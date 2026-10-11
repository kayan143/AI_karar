import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  addDocument,
  allowedDocumentExtension,
  chunkDocumentPages,
  deleteDocument,
  deleteUserDocuments,
  extractDocumentPages,
  initializeDocumentStore,
  listDocuments,
  resetDocumentStoreForTests,
  retrieveDocumentContext,
} from './documents.js';

const secret = 'test-only-document-storage-secret-32+';

async function temporaryStore(t, suffix) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'karar-documents-'));
  t.after(async () => {
    resetDocumentStoreForTests();
    await rm(directory, { recursive: true, force: true });
  });
  await initializeDocumentStore({ filePath: path.join(directory, `${suffix}.json`), secret });
  return directory;
}

function embeddingResponse(inputs) {
  return {
    ok: true,
    json: async () => ({
      embeddings: inputs.map((text) => /recursion|base case/i.test(text) ? [1, 0] : [0, 1]),
    }),
  };
}

function fakeFetcher(_url, options) {
  const body = JSON.parse(options.body);
  return Promise.resolve(embeddingResponse(body.input));
}

function makePdf(text) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
}

test('accepts only the supported text, source, and PDF extensions', () => {
  assert.equal(allowedDocumentExtension('notes.PDF'), true);
  assert.equal(allowedDocumentExtension('module.py'), true);
  assert.equal(allowedDocumentExtension('launch.exe'), false);
  assert.equal(allowedDocumentExtension('../notes.txt'), true);
});

test('chunks preserve document filename and PDF page or source line metadata', () => {
  const source = chunkDocumentPages([{ page: null, text: 'line one\nline two\nline three' }], 'main.py');
  assert.equal(source[0].filename, 'main.py');
  assert.equal(source[0].lineStart, 1);
  assert.equal(source[0].lineEnd, 3);
  const pdf = chunkDocumentPages([{ page: 4, text: 'Page-specific study text.' }], 'notes.pdf');
  assert.equal(pdf[0].page, 4);
  assert.equal(pdf[0].lineStart, null);
});

test('chunk sizes and overlap can be configured for local hardware', () => {
  const chunks = chunkDocumentPages(
    [{ page: null, text: 'x'.repeat(1_500) }],
    'long.txt',
    { chunkSize: 500, chunkOverlap: 50 },
  );
  assert.ok(chunks.length > 3);
  assert.ok(chunks.every((chunk) => chunk.text.length <= 500));
  assert.ok(chunks[0].text.endsWith(chunks[1].text.slice(0, 50)));
});

test('extracts text from a valid PDF and reports a malformed PDF safely', async () => {
  const pages = await extractDocumentPages('notes.pdf', makePdf('Recursion needs a base case'));
  assert.match(pages[0].text, /Recursion needs a base case/);
  await assert.rejects(
    extractDocumentPages('bad.pdf', Buffer.from('not a PDF')),
    /valid, unencrypted PDF/,
  );
  await assert.rejects(
    extractDocumentPages('scanned.pdf', makePdf('')),
    /no selectable text/,
  );
});

test('rejects malformed JSON, empty documents, and invalid text encodings', async () => {
  await assert.rejects(extractDocumentPages('data.json', Buffer.from('{broken')), /JSON file is malformed/);
  await assert.rejects(extractDocumentPages('empty.txt', Buffer.from(' \n ')), /file is empty/);
  await assert.rejects(extractDocumentPages('bad.txt', Buffer.from([0xff, 0xfe])), /not valid UTF-8/);
});

test('indexes locally with embeddings, avoids duplicate indexing, and retrieves cited chunks', async (t) => {
  const directory = await temporaryStore(t, 'index');
  const bytes = Buffer.from('Recursion is when a function calls itself. A base case stops the calls.');
  const upload = {
    name: 'recursion.txt',
    data: bytes.toString('base64'),
  };
  const options = { baseUrl: 'http://localhost:11434', model: 'nomic-embed-text', maxBytes: 4096, fetchImpl: fakeFetcher };
  const indexed = await addDocument('student-one', upload, options);
  assert.equal(indexed.alreadyIndexed, false);
  assert.equal(listDocuments('student-one').length, 1);
  assert.equal(listDocuments('student-two').length, 0);
  assert.equal((await addDocument('student-one', upload, options)).alreadyIndexed, true);

  const result = await retrieveDocumentContext('student-one', 'Explain recursion and its base case', [indexed.document.id], options);
  assert.match(result.context, /Recursion is when a function calls itself/);
  assert.match(result.sources[0], /recursion\.txt, lines 1-1/);
  const encryptedFile = await readFile(path.join(directory, 'index.json'), 'utf8');
  assert.doesNotMatch(encryptedFile, /Recursion is when a function calls itself/);
  await initializeDocumentStore({ filePath: path.join(directory, 'index.json'), secret });
  assert.equal(listDocuments('student-one').length, 1);
  await assert.rejects(
    retrieveDocumentContext('student-two', 'Explain recursion', [indexed.document.id], options),
    /unavailable/,
  );
  const noMatch = await retrieveDocumentContext('student-one', 'How do IP routers forward packets?', [indexed.document.id], options);
  assert.equal(noMatch.sources.length, 0);
  assert.match(noMatch.context, /No relevant excerpts/);
});

test('uses the built-in fetch when indexing documents without a custom fetcher', async (t) => {
  await temporaryStore(t, 'default-fetch');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    return embeddingResponse(body.input);
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const result = await addDocument('student', {
    name: 'notes.txt',
    data: Buffer.from('Embedding requests use the platform fetch implementation.').toString('base64'),
  }, {
    baseUrl: 'http://localhost:11434',
    model: 'nomic-embed-text',
    maxBytes: 4096,
  });

  assert.equal(result.alreadyIndexed, false);
  assert.equal(listDocuments('student').length, 1);
});

test('rejects unsafe uploads, oversized files, and documents whose user quota is reached', async (t) => {
  await temporaryStore(t, 'validation');
  const options = { baseUrl: 'http://localhost:11434', model: 'nomic-embed-text', maxBytes: 16, fetchImpl: fakeFetcher };
  await assert.rejects(addDocument('student', { name: 'program.exe', data: 'eA==' }, options), /file type is not supported/);
  await assert.rejects(addDocument('student', { name: 'notes.txt', data: Buffer.from('x'.repeat(32)).toString('base64') }, options), /smaller than/);
  await assert.rejects(addDocument('student', { name: '../notes.txt', data: Buffer.from('valid').toString('base64') }, options), /filename is invalid/);
  await assert.rejects(addDocument('student', { name: 'bad.json', data: Buffer.from('{').toString('base64') }, options), /JSON file is malformed/);
});

test('deletes only the selected user document and supports account-data deletion', async (t) => {
  await temporaryStore(t, 'delete');
  const options = { baseUrl: 'http://localhost:11434', model: 'nomic-embed-text', maxBytes: 4096, fetchImpl: fakeFetcher };
  const first = await addDocument('student-one', {
    name: 'one.txt',
    data: Buffer.from('recursion base case').toString('base64'),
  }, options);
  const second = await addDocument('student-two', {
    name: 'two.txt',
    data: Buffer.from('network routing').toString('base64'),
  }, options);
  assert.equal(await deleteDocument('student-two', first.document.id), false);
  assert.equal(await deleteDocument('student-one', first.document.id), true);
  assert.equal(listDocuments('student-one').length, 0);
  assert.equal(listDocuments('student-two').length, 1);
  await deleteUserDocuments('student-two');
  assert.equal(listDocuments('student-two').length, 0);
  await addDocument('student-two', {
    name: 'again.txt',
    data: Buffer.from('routing').toString('base64'),
  }, options);
  await deleteUserDocuments(null);
  assert.equal(listDocuments('student-two').length, 0);
  assert.ok(second.document.id);
});

test('reports Ollama embedding-model and malformed embedding failures clearly', async (t) => {
  await temporaryStore(t, 'embed-errors');
  const file = { name: 'notes.txt', data: Buffer.from('study text').toString('base64') };
  const options = { baseUrl: 'http://localhost:11434', model: 'missing-embedder', maxBytes: 4096 };
  await assert.rejects(addDocument('student', file, {
    ...options,
    fetchImpl: async () => ({ ok: false, status: 404 }),
  }), /ollama pull missing-embedder/);
  await assert.rejects(addDocument('student', file, {
    ...options,
    fetchImpl: async () => ({ ok: true, json: async () => ({ embeddings: [] }) }),
  }), /invalid document embeddings/);
});
