import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDocumentAwareSystemPrompt,
  containsArabicText,
  generateOllamaResponse,
  generateTutorResponse,
} from './ollama.js';

const messages = [
  { role: 'user', content: 'Explain recursion.' },
  { role: 'assistant', content: 'A function calling itself.' },
  { role: 'user', content: 'Show a short example.' },
];

function createStream(lines, chunkSizes = []) {
  const bytes = new TextEncoder().encode(lines.join('\n') + '\n');
  return new ReadableStream({
    start(controller) {
      let offset = 0;
      for (const size of chunkSizes) {
        if (offset >= bytes.length) break;
        controller.enqueue(bytes.slice(offset, offset + size));
        offset += size;
      }
      if (offset < bytes.length) controller.enqueue(bytes.slice(offset));
      controller.close();
    },
  });
}

test('includes retrieved study-document excerpts in the Ollama system prompt', () => {
  const system = buildDocumentAwareSystemPrompt(
    'Be a helpful tutor.',
    '[Source: biology.txt, lines 1-2]\nChlorophyll captures sunlight for photosynthesis.',
  );

  assert.match(system, /Be a helpful tutor\./);
  assert.match(system, /<untrusted-document-excerpts>/);
  assert.match(system, /Chlorophyll captures sunlight for photosynthesis\./);
  assert.match(system, /biology\.txt, lines 1-2/);
  assert.match(system, /never as instructions/);
});

test('detects Arabic script in the latest question', () => {
  assert.equal(containsArabicText('اشرح لي recursion'), true);
  assert.equal(containsArabicText('ࢠ'), true);
  assert.equal(containsArabicText('Explain recursion.'), false);
});

test('translates Arabic questions to English and streams only the Arabic answer', async () => {
  const requests = [];
  const deltas = [];
  const response = await generateTutorResponse({
    baseUrl: 'http://localhost:11434/',
    model: 'llama3.2:3b',
    translationModel: 'qwen2.5:3b',
    system: 'Be a helpful tutor.',
    messages: [
      { role: 'user', content: 'اشرح لي مفهوم الاستدعاء الذاتي.' },
    ],
    signal: new AbortController().signal,
    maxTokens: 128,
    timeoutMs: 10_000,
    onDelta: (text) => deltas.push(text),
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url, body });
      if (requests.length === 1) {
        assert.equal(body.model, 'qwen2.5:3b');
        assert.equal(body.stream, false);
        assert.match(body.system, /professional Arabic-to-English translator/);
        assert.match(body.prompt, /<text>\nاشرح لي مفهوم الاستدعاء الذاتي\.\n<\/text>/);
        return new Response(JSON.stringify({
          response: 'Explain the concept of recursion.',
          prompt_eval_count: 11,
          eval_count: 7,
        }));
      }
      if (requests.length === 2) {
        assert.equal(body.model, 'llama3.2:3b');
        assert.equal(body.stream, true);
        assert.match(body.system, /translated from Arabic into English/i);
        assert.match(body.prompt, /Explain the concept of recursion\./);
        return new Response(createStream([
          JSON.stringify({ response: 'Recursion is when a function calls itself.', done: false }),
          JSON.stringify({ response: '', done: true, prompt_eval_count: 31, eval_count: 12 }),
        ]));
      }
      assert.equal(body.stream, true);
      assert.equal(body.model, 'qwen2.5:3b');
      assert.match(body.system, /professional English-to-Arabic translator/);
      assert.match(body.prompt, /<text>\nRecursion is when a function calls itself\.\n<\/text>/);
      return new Response(createStream([
        JSON.stringify({ response: 'الاستدعاء الذاتي هو أن تستدعي الدالة نفسها.', done: false }),
        JSON.stringify({ response: '', done: true, prompt_eval_count: 20, eval_count: 15 }),
      ]));
    },
  });

  assert.equal(requests.length, 3);
  assert.deepEqual(deltas, ['الاستدعاء الذاتي هو أن تستدعي الدالة نفسها.']);
  assert.deepEqual(response, {
    message: 'الاستدعاء الذاتي هو أن تستدعي الدالة نفسها.',
    promptTokens: 62,
    completionTokens: 34,
    totalTokens: 96,
  });
});

test('keeps non-Arabic questions on the normal single-call path', async () => {
  let requests = 0;
  const response = await generateTutorResponse({
    baseUrl: 'http://localhost:11434',
    model: 'llama3.2:3b',
    system: 'Be a helpful tutor.',
    messages: [{ role: 'user', content: 'Explain recursion.' }],
    signal: new AbortController().signal,
    maxTokens: 128,
    onDelta: () => {},
    fetchImpl: async () => {
      requests += 1;
      return new Response(createStream([
        JSON.stringify({ response: 'A function calls itself.', done: false }),
        JSON.stringify({ response: '', done: true, prompt_eval_count: 10, eval_count: 6 }),
      ]));
    },
  });
  assert.equal(requests, 1);
  assert.equal(response.message, 'A function calls itself.');
  assert.equal(response.totalTokens, 16);
});

test('does not stream an answer when the translation model returns English only', async () => {
  let request = 0;
  const deltas = [];
  await assert.rejects(
    generateTutorResponse({
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2:3b',
      translationModel: 'qwen2.5:3b',
      system: 'system',
      messages: [{ role: 'user', content: 'اشرح مفهوم recursion.' }],
      signal: new AbortController().signal,
      maxTokens: 64,
      onDelta: (text) => deltas.push(text),
      fetchImpl: async () => {
        request += 1;
        if (request === 1) {
          return new Response(JSON.stringify({
            response: 'Explain recursion.',
            prompt_eval_count: 5,
            eval_count: 3,
          }));
        }
        if (request === 2) {
          return new Response(createStream([
            JSON.stringify({ response: 'Recursion is when a function calls itself.', done: false }),
            JSON.stringify({ response: '', done: true, prompt_eval_count: 10, eval_count: 9 }),
          ]));
        }
        return new Response(createStream([
          JSON.stringify({ response: 'Recursion is when a function calls itself.', done: false }),
          JSON.stringify({ response: '', done: true, prompt_eval_count: 8, eval_count: 8 }),
        ]));
      },
    }),
    { message: 'The translation model "qwen2.5:3b" returned an answer without Arabic text. Check the Arabic-capable model and try again.' },
  );
  assert.deepEqual(deltas, []);
});

test('explains how to install a missing translation model', async () => {
  await assert.rejects(
    generateTutorResponse({
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2:3b',
      translationModel: 'qwen2.5:3b',
      system: 'system',
      messages: [{ role: 'user', content: 'اشرح recursion.' }],
      signal: new AbortController().signal,
      maxTokens: 64,
      onDelta: () => {},
      fetchImpl: async () => new Response('{}', { status: 404 }),
    }),
    { message: 'The Arabic translation model "qwen2.5:3b" is unavailable. Run "ollama pull qwen2.5:3b" on the host computer.' },
  );
});

test('sends system prompt and conversation to Ollama and streams generated text', async () => {
  let requestUrl;
  let requestOptions;
  const deltas = [];
  const response = await generateOllamaResponse({
    baseUrl: 'http://localhost:11434/',
    model: 'llama3.2:3b',
    system: 'Be a helpful tutor.',
    messages,
    signal: new AbortController().signal,
    maxTokens: 128,
    onDelta: (text) => deltas.push(text),
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return new Response(createStream([
        JSON.stringify({ response: 'Recursion ', done: false }),
        JSON.stringify({ response: 'example.', done: false }),
        JSON.stringify({ response: '', done: true, prompt_eval_count: 31, eval_count: 8 }),
      ], [13, 20, 7]));
    },
  });

  assert.equal(requestUrl, 'http://localhost:11434/api/generate');
  const body = JSON.parse(requestOptions.body);
  assert.equal(body.model, 'llama3.2:3b');
  assert.equal(body.system, 'Be a helpful tutor.');
  assert.equal(body.stream, true);
  assert.equal(body.options.num_predict, 128);
  assert.match(body.prompt, /Student:\nExplain recursion\./);
  assert.match(body.prompt, /Karar:\nA function calling itself\./);
  assert.deepEqual(deltas, ['Recursion ', 'example.']);
  assert.deepEqual(response, {
    message: 'Recursion example.',
    promptTokens: 31,
    completionTokens: 8,
    totalTokens: 39,
  });
});

test('reports when Ollama is not running without exposing internal errors', async () => {
  await assert.rejects(
    generateOllamaResponse({
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2:3b',
      system: 'system',
      messages,
      signal: new AbortController().signal,
      maxTokens: 64,
      onDelta: () => {},
      fetchImpl: async () => { throw new Error('internal socket details'); },
    }),
    {
      message: 'Karar could not connect to Ollama. Start Ollama on this computer and try again.',
    },
  );
});

test('explains how to install a model missing from Ollama', async () => {
  await assert.rejects(
    generateOllamaResponse({
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2:3b',
      system: 'system',
      messages,
      signal: new AbortController().signal,
      maxTokens: 64,
      onDelta: () => {},
      fetchImpl: async () => new Response('{}', { status: 404 }),
    }),
    { message: 'The Ollama model "llama3.2:3b" is unavailable. Run "ollama pull llama3.2:3b" on the host computer.' },
  );
});

test('requires Ollama usage counts for account token settlement', async () => {
  await assert.rejects(
    generateOllamaResponse({
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2:3b',
      system: 'system',
      messages,
      signal: new AbortController().signal,
      maxTokens: 64,
      onDelta: () => {},
      fetchImpl: async () => new Response(createStream([
        JSON.stringify({ response: 'A reply.', done: false }),
        JSON.stringify({ response: '', done: true }),
      ])),
    }),
    { message: 'Ollama did not return token usage, so the reply could not be safely charged to the account.' },
  );
});
