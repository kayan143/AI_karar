import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const ALLOWED_EXTENSIONS = new Set([
  '.c', '.cc', '.cpp', '.css', '.csv', '.h', '.hpp', '.html', '.java', '.js', '.pdf',
  '.json', '.md', '.py', '.sql', '.ts', '.tsx', '.txt',
]);
const MAX_EXTRACTED_CHARACTERS = 500_000;
const MAX_PDF_PAGES = 1_000;
const MAX_DOCUMENTS_PER_USER = 30;
const MAX_USER_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_CHUNKS_PER_USER = 2_000;
const MAX_RETRIEVED_CONTEXT = 7_000;

let storeFile;
let encryptionKey;
let records = [];
let pendingWrites = Promise.resolve();

function keyFor(secret) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) {
    throw new Error('Document storage requires a server-side encryption secret of at least 32 characters.');
  }
  return createHash('sha256').update(secret).digest();
}

function encrypt(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return JSON.stringify({
    version: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: ciphertext.toString('base64'),
  });
}

function decrypt(value) {
  const envelope = JSON.parse(value);
  if (envelope?.version !== 1 || typeof envelope.iv !== 'string' || typeof envelope.tag !== 'string' || typeof envelope.data !== 'string') {
    throw new Error('The local document index has an unsupported format.');
  }
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64')),
    decipher.final(),
  ]).toString('utf8'));
}

async function persist(nextRecords) {
  const temporaryFile = `${storeFile}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await fs.writeFile(temporaryFile, encrypt({ version: 1, documents: nextRecords }), { mode: 0o600 });
    await fs.rename(temporaryFile, storeFile);
    records = nextRecords;
  } catch (error) {
    await fs.rm(temporaryFile, { force: true });
    throw error;
  }
}

function transact(change) {
  const operation = pendingWrites.then(async () => {
    const next = structuredClone(records);
    const result = await change(next);
    await persist(next);
    return result;
  });
  pendingWrites = operation.catch(() => undefined);
  return operation;
}

export async function initializeDocumentStore({ filePath, secret }) {
  encryptionKey = keyFor(secret);
  storeFile = path.resolve(filePath);
  await fs.mkdir(path.dirname(storeFile), { recursive: true });
  try {
    const saved = decrypt(await fs.readFile(storeFile, 'utf8'));
    if (saved?.version !== 1 || !Array.isArray(saved.documents)) {
      throw new Error('The local document index has an unsupported format.');
    }
    records = saved.documents;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    records = [];
    await persist(records);
  }
}

export function allowedDocumentExtension(filename) {
  return ALLOWED_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function decodeUpload(data, maxBytes) {
  if (typeof data !== 'string' || data.length === 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) {
    throw new Error('This file could not be read. Choose a supported, non-empty file and try again.');
  }
  if (data.length > Math.ceil(maxBytes * 4 / 3) + 8) {
    throw new Error(`Files must be smaller than ${Math.ceil(maxBytes / (1024 * 1024))} MB.`);
  }
  const bytes = Buffer.from(data, 'base64');
  if (!bytes.length || bytes.length > maxBytes) {
    throw new Error(`Files must be smaller than ${Math.ceil(maxBytes / (1024 * 1024))} MB.`);
  }
  return bytes;
}

export async function extractDocumentPages(filename, bytes) {
  const extension = path.extname(filename).toLowerCase();
  if (extension === '.pdf') {
    let pdfjs;
    try {
      pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    } catch {
      throw new Error('PDF reading is unavailable. Install the project dependencies and restart Karar.');
    }
    let document;
    try {
      document = await pdfjs.getDocument({
        data: new Uint8Array(bytes),
        isEvalSupported: false,
        useSystemFonts: true,
      }).promise;
      if (document.numPages > MAX_PDF_PAGES) {
        throw new Error('This document exceeds the local PDF page limit. Try a smaller file.');
      }
      const pages = [];
      let extractedCharacters = 0;
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        const pageText = content.items.map((item) => ('str' in item ? item.str : '')).join(' ').trim();
        extractedCharacters += pageText.length;
        if (extractedCharacters > MAX_EXTRACTED_CHARACTERS) {
          throw new Error('This document exceeds the local text-extraction limit. Try a smaller file.');
        }
        pages.push({
          page: pageNumber,
          text: pageText,
        });
      }
      await document.destroy();
      if (!pages.some(({ text }) => text)) {
        throw new Error('This PDF contains no selectable text. It may be scanned or image-only; OCR is not enabled.');
      }
      return pages;
    } catch (error) {
      if (error instanceof Error && /no selectable text|exceeds the local (text-extraction|PDF page) limit/.test(error.message)) throw error;
      throw new Error('Karar could not read this PDF. Check that it is a valid, unencrypted PDF and try again.', { cause: error });
    }
  }

  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('This text file is not valid UTF-8. Save it as UTF-8 and upload it again.');
  }
  if (extension === '.json') {
    try {
      JSON.parse(text);
    } catch {
      throw new Error('This JSON file is malformed. Correct it and upload again.');
    }
  }
  if (!text.trim()) throw new Error('This file is empty and cannot be indexed.');
  return [{ page: null, text }];
}

function chunkSettings() {
  const chunkSize = Number.parseInt(process.env.KARAR_DOCUMENT_CHUNK_SIZE || '900', 10);
  const chunkOverlap = Number.parseInt(process.env.KARAR_DOCUMENT_CHUNK_OVERLAP || '120', 10);
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 200 || chunkSize > 4_000) {
    throw new Error('KARAR_DOCUMENT_CHUNK_SIZE must be an integer between 200 and 4000 characters.');
  }
  if (!Number.isSafeInteger(chunkOverlap) || chunkOverlap < 0 || chunkOverlap >= chunkSize / 2) {
    throw new Error('KARAR_DOCUMENT_CHUNK_OVERLAP must be non-negative and less than half the chunk size.');
  }
  return { chunkSize, chunkOverlap };
}

export function chunkDocumentPages(pages, filename, { chunkSize, chunkOverlap } = chunkSettings()) {
  const chunks = [];
  for (const { page, text } of pages) {
    const normalized = text.replace(/\r\n/g, '\n').trim();
    if (!normalized) continue;
    let start = 0;
    while (start < normalized.length) {
      let end = Math.min(start + chunkSize, normalized.length);
      if (end < normalized.length) {
        const boundary = normalized.lastIndexOf('\n', end);
        const paragraphBoundary = normalized.lastIndexOf('\n\n', end);
        const selectedBoundary = paragraphBoundary > start + chunkSize / 2 ? paragraphBoundary : boundary;
        if (selectedBoundary > start + chunkSize / 2) end = selectedBoundary;
      }
      const content = normalized.slice(start, end).trim();
      if (content) {
        const lineStart = normalized.slice(0, start).split('\n').length;
        const lineEnd = lineStart + content.split('\n').length - 1;
        chunks.push({ filename, page, lineStart: page === null ? lineStart : null, lineEnd: page === null ? lineEnd : null, text: content });
      }
      if (end >= normalized.length) break;
      start = Math.max(start + 1, end - chunkOverlap);
    }
  }
  return chunks;
}

function publicDocument(document) {
  return {
    id: document.id,
    filename: document.filename,
    size: document.size,
    pageCount: document.pageCount,
    chunkCount: document.chunks.length,
    createdAt: document.createdAt,
  };
}

export function listDocuments(userId) {
  return records.filter((item) => item.userId === userId).map(publicDocument);
}

export function getDocument(userId, documentId) {
  const document = records.find((item) => item.userId === userId && item.id === documentId);
  return document ? publicDocument(document) : null;
}

async function embedTexts({ baseUrl, model, texts, fetchImpl = fetch, timeoutMs = 180_000 }) {
  let response;
  try {
    response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: texts }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new Error('Ollama took too long to create document embeddings. Try a smaller file or try again.', { cause: error });
    }
    throw new Error('Karar could not connect to Ollama for document search. Start Ollama and try again.', { cause: error });
  }
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`The embedding model "${model}" is unavailable. Run "ollama pull ${model}" on this computer.`);
    }
    throw new Error('Ollama could not create document embeddings. Check the configured embedding model and try again.');
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('Ollama returned an unreadable document embedding response.');
  }
  const embeddings = result?.embeddings;
  if (
    !Array.isArray(embeddings) ||
    embeddings.length !== texts.length ||
    embeddings.some((vector) => !Array.isArray(vector) || vector.length === 0 || vector.length > 2_048 || vector.some((value) => !Number.isFinite(value))) ||
    (embeddings.length > 1 && embeddings.some((vector) => vector.length !== embeddings[0].length))
  ) {
    throw new Error('Ollama returned invalid document embeddings. Check the configured embedding model.');
  }
  return embeddings;
}

export async function addDocument(userId, file, options) {
  if (typeof userId !== 'string' || !userId) throw new Error('Sign in before adding study documents.');
  if (!file || typeof file.name !== 'string' || file.name.length > 180 || path.basename(file.name) !== file.name || file.name.includes('\0')) {
    throw new Error('This filename is invalid. Rename the file and try again.');
  }
  if (!allowedDocumentExtension(file.name)) {
    throw new Error('This file type is not supported. Upload PDF, text, Markdown, CSV, JSON, or supported source-code files.');
  }
  const bytes = decodeUpload(file.data, options.maxBytes);
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  const existing = records.find((item) => item.userId === userId && item.contentHash === contentHash);
  if (existing) return { document: publicDocument(existing), alreadyIndexed: true };

  const userDocuments = records.filter((item) => item.userId === userId);
  const userBytes = userDocuments.reduce((sum, item) => sum + item.size, 0);
  if (userDocuments.length >= MAX_DOCUMENTS_PER_USER || userBytes + bytes.length > MAX_USER_UPLOAD_BYTES) {
    throw new Error('Your local study-document storage limit has been reached. Delete a document before adding another.');
  }
  const pages = await extractDocumentPages(file.name, bytes);
  const extractedCharacters = pages.reduce((sum, item) => sum + item.text.length, 0);
  if (extractedCharacters > MAX_EXTRACTED_CHARACTERS) {
    throw new Error('This document has too much extractable text to index safely. Try a smaller file.');
  }
  const chunks = chunkDocumentPages(pages, file.name);
  if (!chunks.length || chunks.length > 600) {
    throw new Error('Karar could not create a safe number of search sections for this file. Try a smaller file.');
  }
  const userChunkCount = userDocuments.reduce((sum, item) => sum + item.chunks.length, 0);
  if (userChunkCount + chunks.length > MAX_CHUNKS_PER_USER) {
    throw new Error('Your study-document index is full. Delete a document before adding more searchable text.');
  }
  const vectors = await embedTexts({
    ...options,
    texts: chunks.map((chunk) => chunk.text),
  });
  const document = {
    id: randomBytes(16).toString('hex'),
    userId,
    filename: file.name,
    size: bytes.length,
    contentHash,
    pageCount: pages.length,
    createdAt: new Date().toISOString(),
    chunks: chunks.map((chunk, index) => ({ ...chunk, embedding: vectors[index] })),
  };
  await transact((next) => next.push(document));
  return { document: publicDocument(document), alreadyIndexed: false };
}

function cosineSimilarity(left, right) {
  if (left.length !== right.length) return -1;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  if (!leftMagnitude || !rightMagnitude) return -1;
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

export async function retrieveDocumentContext(userId, query, documentIds, options) {
  if (!Array.isArray(documentIds) || !documentIds.length) return { context: '', sources: [] };
  if (documentIds.length > 30 || documentIds.some((id) => typeof id !== 'string' || id.length > 64)) {
    throw new Error('The selected study documents are invalid. Refresh the document list and try again.');
  }
  const selected = new Set(documentIds);
  const ownedDocuments = records.filter((item) => item.userId === userId && selected.has(item.id));
  if (ownedDocuments.length !== selected.size) {
    throw new Error('One or more selected study documents are unavailable. Refresh the document list and try again.');
  }
  const [queryEmbedding] = await embedTexts({ ...options, texts: [query] });
  const candidates = ownedDocuments.flatMap((document) => document.chunks.map((chunk) => ({
    ...chunk,
    documentId: document.id,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }))).filter((chunk) => chunk.score >= 0.2).sort((left, right) => right.score - left.score);

  const selectedChunks = [];
  let contextLength = 0;
  for (const chunk of candidates) {
    const source = chunk.page === null
      ? `${chunk.filename}, lines ${chunk.lineStart}-${chunk.lineEnd}`
      : `${chunk.filename}, page ${chunk.page}`;
    const formatted = `[Source: ${source}]\n${chunk.text}`;
    if (contextLength + formatted.length > MAX_RETRIEVED_CONTEXT) continue;
    selectedChunks.push({ source, text: chunk.text });
    contextLength += formatted.length;
    if (selectedChunks.length >= 5) break;
  }
  const context = selectedChunks
    .map(({ source, text }) => `[Source: ${source}]\n${text}`)
    .join('\n\n');
  return {
    context: context || 'No relevant excerpts were found in the selected documents. Tell the student that the selected documents did not provide evidence for the answer; do not invent a source or claim the answer came from a document.',
    sources: [...new Set(selectedChunks.map(({ source }) => source))],
  };
}

export async function deleteDocument(userId, documentId) {
  if (typeof documentId !== 'string' || documentId.length > 64) return false;
  let deleted = false;
  await transact((next) => {
    const filtered = next.filter((item) => {
      if (item.userId === userId && item.id === documentId) {
        deleted = true;
        return false;
      }
      return true;
    });
    next.length = 0;
    for (const item of filtered) next.push(item);
  });
  return deleted;
}

export async function deleteUserDocuments(userId) {
  await transact((next) => {
    if (userId === null) {
      next.length = 0;
      return;
    }
    const remaining = next.filter((item) => item.userId !== userId);
    next.length = 0;
    for (const item of remaining) next.push(item);
  });
}

export function resetDocumentStoreForTests() {
  storeFile = undefined;
  encryptionKey = undefined;
  records = [];
  pendingWrites = Promise.resolve();
}
