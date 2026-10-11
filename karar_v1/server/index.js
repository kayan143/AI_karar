import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { buildDocumentAwareSystemPrompt, containsArabicText, generateTutorResponse } from './ollama.js';
import {
  addDocument,
  deleteDocument,
  deleteUserDocuments,
  getDocument,
  initializeDocumentStore,
  listDocuments,
  retrieveDocumentContext,
} from './documents.js';
import {
  initializeLocalAuth,
  localAccountSession,
  localTokenAllowance,
  registerLocalAuthRoutes,
  releaseLocalTokens,
  reserveLocalTokens,
  settleLocalTokens,
  clearLocalDocumentReferences,
} from './local-auth.js';

dotenv.config();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.API_PORT || process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';
const OLLAMA_TRANSLATION_MODEL = process.env.OLLAMA_TRANSLATION_MODEL || 'qwen2.5:3b';
const OLLAMA_TIMEOUT = Math.min(600, Math.max(10, Number.parseInt(process.env.OLLAMA_TIMEOUT || '180', 10) || 180)) * 1000;
const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.APP_URL?.replace(/\/+$/, '');
const sessionSecret = process.env.SESSION_SECRET;
const LOCAL_AUTH_ENABLED = process.env.KARAR_LOCAL_AUTH === 'true';
const supabaseAuthConfigured = Boolean(
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  APP_URL &&
  sessionSecret &&
  Buffer.byteLength(sessionSecret) >= 32,
);
const authConfigured = Boolean(
  LOCAL_AUTH_ENABLED || supabaseAuthConfigured,
);
const isProduction = process.env.NODE_ENV === 'production';
const sessionCookie = isProduction ? '__Host-karar_session' : 'karar_session';

app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '16mb' }));

if (
  !LOCAL_AUTH_ENABLED &&
  SUPABASE_URL &&
  (!SUPABASE_ANON_KEY || !APP_URL || !sessionSecret || Buffer.byteLength(sessionSecret ?? '') < 32)
) {
  console.error('Authentication configuration is incomplete. Check SUPABASE_ANON_KEY, APP_URL, and a 32-character SESSION_SECRET.');
}

function secureCookieOptions(maxAge = 60 * 60 * 24 * 30) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'Lax',
    path: '/',
    maxAge,
  };
}

const encryptionKey = createHash('sha256')
  .update(sessionSecret || randomBytes(32))
  .digest();

function encryptSession(session) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(session)), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

function decryptSession(value) {
  try {
    const [iv, authTag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
    if (!iv || !authTag || !encrypted) return null;
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey, iv);
    decipher.setAuthTag(authTag);
    return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString());
  } catch {
    return null;
  }
}

function setSessionCookie(res, session) {
  const maxAge = Math.max(1, Math.min(session.expires_at - Math.floor(Date.now() / 1000), 60 * 60 * 24 * 30));
  res.cookie(sessionCookie, encryptSession(session), secureCookieOptions(maxAge));
}

function readSession(req) {
  const cookie = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${sessionCookie}=`));
  if (!cookie) return null;
  return decryptSession(decodeURIComponent(cookie.slice(sessionCookie.length + 1)));
}

function clearSessionCookie(res) {
  res.clearCookie(sessionCookie, secureCookieOptions(0));
}

const requestCounts = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const key = `${req.ip}:${req.path}`;
  const current = requestCounts.get(key);
  if (!current || current.expiresAt <= now) {
    requestCounts.set(key, { count: 1, expiresAt: now + 15 * 60 * 1000 });
  } else {
    current.count += 1;
    if (current.count > 8) {
      res.set('Retry-After', String(Math.ceil((current.expiresAt - now) / 1000)));
      return res.status(429).json({ error: 'Too many attempts. Please wait a little before trying again.' });
    }
  }
  if (requestCounts.size > 10_000) {
    for (const [entry, value] of requestCounts) {
      if (value.expiresAt <= now) requestCounts.delete(entry);
    }
  }
  next();
}

function requireAjax(req, res, next) {
  if (req.get('X-Requested-With') !== 'XMLHttpRequest') {
    return res.status(403).json({ error: 'This request could not be verified.' });
  }
  next();
}

if (LOCAL_AUTH_ENABLED) {
  await initializeLocalAuth();
}

const documentEncryptionSecret = process.env.KARAR_DATA_KEY || sessionSecret;
let documentStoreReady = false;
if (documentEncryptionSecret && Buffer.byteLength(documentEncryptionSecret) >= 32) {
  await initializeDocumentStore({
    filePath: process.env.KARAR_DOCUMENTS_PATH || path.join(__dirname, 'data', 'karar-documents.json'),
    secret: documentEncryptionSecret,
  });
  documentStoreReady = true;
}

if (LOCAL_AUTH_ENABLED) {
  registerLocalAuthRoutes(app, {
    requireAjax,
    rateLimit,
    deleteUserDocuments: documentStoreReady ? deleteUserDocuments : async () => {},
  });
}

const maxUploadBytes = Math.min(
  10 * 1024 * 1024,
  Math.max(1024, Number.parseInt(process.env.KARAR_MAX_UPLOAD_BYTES || String(5 * 1024 * 1024), 10) || 5 * 1024 * 1024),
);
const OLLAMA_EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';

async function documentUserId(req, res) {
  if (!documentStoreReady) {
    res.status(503).json({ error: 'Encrypted local document storage is not configured. Ask the Karar owner to configure a 32-character server-side encryption secret.' });
    return null;
  }
  try {
    if (LOCAL_AUTH_ENABLED) {
      const session = await localAccountSession(req);
      if (!session) {
        res.status(401).json({ error: 'Sign in to access your study documents.' });
        return null;
      }
      return session.userId;
    }
    if (authConfigured) {
      const session = await authenticatedSession(req, res);
      if (!session) {
        res.status(401).json({ error: 'Sign in to access your study documents.' });
        return null;
      }
      return session.user.id;
    }
    res.status(503).json({ error: 'Study-document storage requires a signed-in local account.' });
    return null;
  } catch {
    res.status(503).json({ error: 'The account service is temporarily unavailable.' });
    return null;
  }
}

app.get('/api/documents', requireAjax, async (req, res) => {
  const userId = await documentUserId(req, res);
  if (!userId) return;
  return res.json({ documents: listDocuments(userId) });
});

app.post('/api/documents', requireAjax, async (req, res) => {
  const userId = await documentUserId(req, res);
  if (!userId) return;
  const { name, data } = req.body ?? {};
  if (typeof name !== 'string' || typeof data !== 'string') {
    return res.status(400).json({ error: 'Choose a supported document and try again.' });
  }
  try {
    const result = await addDocument(userId, { name, data }, {
      baseUrl: OLLAMA_BASE_URL,
      model: OLLAMA_EMBEDDING_MODEL,
      maxBytes: maxUploadBytes,
      timeoutMs: OLLAMA_TIMEOUT,
    });
    return res.status(result.alreadyIndexed ? 200 : 201).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Karar could not index this document. Please try again.';
    const clientError = /^(This file|This filename|Files must|Your local|Your study-document|This PDF|This JSON|This text file|This document|Karar could not (read this PDF|create a safe number)|One or more|The selected)/.test(message);
    return res.status(clientError ? 400 : 503).json({ error: message });
  }
});

app.delete('/api/documents/:id', requireAjax, async (req, res) => {
  const userId = await documentUserId(req, res);
  if (!userId) return;
  try {
    const document = getDocument(userId, req.params.id);
    if (!document) return res.status(404).json({ error: 'That study document could not be found.' });
    if (LOCAL_AUTH_ENABLED) await clearLocalDocumentReferences(userId, document.filename);
    if (!await deleteDocument(userId, req.params.id)) {
      return res.status(404).json({ error: 'That study document could not be found.' });
    }
    return res.json({ success: true });
  } catch {
    return res.status(503).json({ error: 'Karar could not delete this document right now. Please try again.' });
  }
});

async function providerRequest(endpoint, { method = 'GET', token, body, admin = false } = {}) {
  const headers = {
    apikey: admin ? SUPABASE_SERVICE_ROLE_KEY : SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  };
  if (admin) headers.Authorization = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
  else if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${endpoint}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  let data;
  try { data = await response.json(); } catch { data = null; }
  return { response, data };
}

async function refreshSession(session) {
  if (!session?.refresh_token) return null;
  const { response, data } = await providerRequest('token?grant_type=refresh_token', {
    method: 'POST',
    body: { refresh_token: session.refresh_token },
  });
  if (!response.ok || typeof data?.access_token !== 'string') return null;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at ?? Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    user: data.user,
  };
}

async function authenticatedSession(req, res) {
  let session = readSession(req);
  if (!session) return null;
  if (session.expires_at <= Math.floor(Date.now() / 1000) + 60) {
    session = await refreshSession(session);
    if (!session) {
      clearSessionCookie(res);
      return null;
    }
    setSessionCookie(res, session);
  }
  const { response, data } = await providerRequest('user', { token: session.access_token });
  if (!response.ok || !data?.id) {
    clearSessionCookie(res);
    return null;
  }
  session.user = data;
  return session;
}

function configured(req, res, next) {
  if (!authConfigured) {
    return res.status(503).json({ error: 'Account services are not configured yet. Please contact the app owner.' });
  }
  next();
}

if (!LOCAL_AUTH_ENABLED) {
app.get('/api/auth/session', async (req, res) => {
  if (!authConfigured) return res.json({ configured: false, user: null });
  try {
    const session = await authenticatedSession(req, res);
    if (session) setSessionCookie(res, session);
    return res.json({ configured: true, user: session?.user ?? null });
  } catch {
    return res.status(503).json({ configured: true, user: null, error: 'Account services are temporarily unavailable.' });
  }
});

app.post('/api/auth/session', requireAjax, configured, rateLimit, async (req, res) => {
  const { accessToken, refreshToken } = req.body ?? {};
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string' || accessToken.length > 8192 || refreshToken.length > 8192) {
    return res.status(400).json({ error: 'The sign-in link is invalid. Please request a new one.' });
  }
  try {
    const { response, data } = await providerRequest('user', { token: accessToken });
    if (!response.ok || !data?.id) return res.status(400).json({ error: 'The sign-in link has expired or is invalid.' });
    const session = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: data,
    };
    setSessionCookie(res, session);
    return res.json({ user: data });
  } catch {
    return res.status(503).json({ error: 'Account services are temporarily unavailable.' });
  }
});

app.post('/api/auth/signup', requireAjax, configured, rateLimit, async (req, res) => {
  const { email, password, displayName } = req.body ?? {};
  if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || password.length < 10 || password.length > 256 || (displayName !== undefined && (typeof displayName !== 'string' || displayName.length > 80))) {
    return res.status(400).json({ error: 'Enter a valid email and a password of at least 10 characters.' });
  }
  try {
    const { response } = await providerRequest(`signup?redirect_to=${encodeURIComponent(`${APP_URL}/#/signin`)}`, {
      method: 'POST',
      body: {
        email: email.trim(),
        password,
        data: { display_name: typeof displayName === 'string' ? displayName.trim() : '' },
        gotrue_meta_security: { captcha_token: undefined },
      },
    });
    if (!response.ok) return res.status(400).json({ error: 'Unable to create an account with those details. Check your information or try again.' });
    return res.json({ success: true });
  } catch {
    return res.status(503).json({ error: 'Account services are temporarily unavailable.' });
  }
});

app.post('/api/auth/signin', requireAjax, configured, rateLimit, async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' || email.length > 254 || password.length > 256) {
    return res.status(400).json({ error: 'Enter your email and password to sign in.' });
  }
  try {
    const { response, data } = await providerRequest('token?grant_type=password', {
      method: 'POST',
      body: { email: email.trim(), password },
    });
    if (!response.ok || !data?.access_token || !data?.user?.id) {
      return res.status(401).json({ error: 'Unable to sign in with those details. Check them or reset your password.' });
    }
    const session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at ?? Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
      user: data.user,
    };
    setSessionCookie(res, session);
    return res.json({ user: data.user });
  } catch {
    return res.status(503).json({ error: 'Account services are temporarily unavailable.' });
  }
});

app.post('/api/auth/forgot', requireAjax, configured, rateLimit, async (req, res) => {
  const { email } = req.body ?? {};
  if (typeof email !== 'string' || email.length > 254) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  try {
    const { response } = await providerRequest(`recover?redirect_to=${encodeURIComponent(`${APP_URL}/#/reset`)}`, {
      method: 'POST',
      body: { email: email.trim() },
    });
    if (!response.ok) return res.status(503).json({ error: 'Unable to process this request right now. Please try again later.' });
    return res.json({ success: true });
  } catch {
    return res.status(503).json({ error: 'Unable to process this request right now. Please try again later.' });
  }
});

app.post('/api/auth/password', requireAjax, configured, rateLimit, async (req, res) => {
  const { password } = req.body ?? {};
  if (typeof password !== 'string' || password.length < 10 || password.length > 256) {
    return res.status(400).json({ error: 'Choose a password with at least 10 characters.' });
  }
  try {
    const session = await authenticatedSession(req, res);
    if (!session) return res.status(401).json({ error: 'Please sign in again before changing your password.' });
    const { response, data } = await providerRequest('user', {
      method: 'PUT',
      token: session.access_token,
      body: { password },
    });
    if (!response.ok) return res.status(400).json({ error: 'Unable to update your password. Please try again.' });
    return res.json({ success: true, user: data });
  } catch {
    return res.status(503).json({ error: 'Account services are temporarily unavailable.' });
  }
});

app.patch('/api/auth/profile', requireAjax, configured, async (req, res) => {
  const { displayName } = req.body ?? {};
  if (typeof displayName !== 'string' || displayName.trim().length > 80) {
    return res.status(400).json({ error: 'Enter a display name with 80 characters or fewer.' });
  }
  try {
    const session = await authenticatedSession(req, res);
    if (!session) return res.status(401).json({ error: 'Please sign in again before updating your profile.' });
    const { response, data } = await providerRequest('user', {
      method: 'PUT',
      token: session.access_token,
      body: { data: { ...session.user.user_metadata, display_name: displayName.trim() } },
    });
    if (!response.ok) return res.status(400).json({ error: 'Unable to update your profile. Please try again.' });
    return res.json({ success: true, user: data });
  } catch {
    return res.status(503).json({ error: 'Account services are temporarily unavailable.' });
  }
});

app.post('/api/auth/signout-others', requireAjax, configured, async (req, res) => {
  try {
    const session = await authenticatedSession(req, res);
    if (!session) return res.status(401).json({ error: 'Please sign in again to manage your sessions.' });
    const { response } = await providerRequest('logout?scope=others', { method: 'POST', token: session.access_token });
    if (!response.ok) return res.status(503).json({ error: 'Unable to sign out other sessions. Please try again.' });
    return res.json({ success: true });
  } catch {
    return res.status(503).json({ error: 'Account services are temporarily unavailable.' });
  }
});

app.post('/api/auth/signout', requireAjax, async (req, res) => {
  const session = authConfigured ? readSession(req) : null;
  if (session?.access_token) {
    try { await providerRequest('logout', { method: 'POST', token: session.access_token }); }
    catch { /* The local cookie is cleared even if the provider is unreachable. */ }
  }
  clearSessionCookie(res);
  return res.json({ success: true });
});

app.delete('/api/auth/account', requireAjax, configured, async (req, res) => {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Account deletion is not enabled. Please contact the app owner.' });
  }
  try {
    const session = await authenticatedSession(req, res);
    if (!session) return res.status(401).json({ error: 'Please sign in again before deleting your account.' });
    await deleteUserDocuments(session.user.id);
    const { response } = await providerRequest(`admin/users/${encodeURIComponent(session.user.id)}`, {
      method: 'DELETE',
      token: session.access_token,
      admin: true,
    });
    if (!response.ok) return res.status(503).json({ error: 'Unable to delete the account right now. Please try again.' });
    clearSessionCookie(res);
    return res.json({ success: true });
  } catch {
    return res.status(503).json({ error: 'Unable to delete the account right now. Please try again.' });
  }
});
}

const tutorSystemPrompt = 'You are Karar, a patient, encouraging AI tutor for IT and computer-science students. Explain technical ideas at the requested level with practical examples, analogies, and clear steps. Help debug and review code without executing it; explain likely causes, useful tests, and time or space complexity when relevant. Support revision notes, summaries, flashcards, quizzes, and practice exams, following the requested topic, question count, and difficulty. If a student asks to receive questions before answers, do not reveal solutions until requested. Be explicit about uncertainty, never invent sources or document facts, and guide students through problems without shaming them.';

function writeChatEvent(res, event) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

async function streamResponse(messages, signal, maxTokens, onDelta, documentContext = '') {
  return generateTutorResponse({
    baseUrl: OLLAMA_BASE_URL,
    model: OLLAMA_MODEL,
    translationModel: OLLAMA_TRANSLATION_MODEL,
    system: buildDocumentAwareSystemPrompt(
      tutorSystemPrompt,
      documentContext,
    ),
    messages,
    signal,
    maxTokens,
    timeoutMs: OLLAMA_TIMEOUT,
    onDelta,
  });
}

app.post('/api/chat', requireAjax, async (req, res) => {
  let localSession = null;
  if (LOCAL_AUTH_ENABLED) {
    try {
      localSession = await localAccountSession(req);
      if (!localSession) {
        return res.status(401).json({ error: 'Please sign in to continue chatting.' });
      }
    } catch {
      return res.status(503).json({ error: 'The local account is temporarily unavailable.' });
    }
  } else if (authConfigured) {
    try {
      if (!await authenticatedSession(req, res)) {
        return res.status(401).json({ error: 'Please sign in to continue chatting.' });
      }
    } catch {
      return res.status(503).json({ error: 'Account services are temporarily unavailable.' });
    }
  }

  const { messages, documentIds = [] } = req.body ?? {};
  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > 40 ||
    messages[messages.length - 1]?.role !== 'user' ||
    messages.some((item) => !item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string' || item.content.length > 12_000) ||
    messages.reduce((total, item) => total + item.content.length, 0) > 40_000
  ) {
    return res.status(400).json({ error: 'This message is too long or could not be read. Please shorten it and try again.' });
  }
  if (!Array.isArray(documentIds) || documentIds.length > 30 || documentIds.some((id) => typeof id !== 'string')) {
    return res.status(400).json({ error: 'The selected study documents are invalid. Refresh the document list and try again.' });
  }

  let documentContext = '';
  let documentSources = [];
  if (documentIds.length) {
    let userId = localSession?.userId ?? null;
    if (!userId && authConfigured) {
      try {
        userId = (await authenticatedSession(req, res))?.user?.id ?? null;
      } catch {
        return res.status(503).json({ error: 'Account services are temporarily unavailable.' });
      }
    }
    if (!userId) {
      return res.status(401).json({ error: 'Sign in to use your study documents.' });
    }
    if (!documentStoreReady) {
      return res.status(503).json({ error: 'Encrypted local document storage is not configured. Ask the Karar owner to configure a 32-character server-side encryption secret.' });
    }
    try {
      const retrieval = await retrieveDocumentContext(userId, messages[messages.length - 1].content, documentIds, {
        baseUrl: OLLAMA_BASE_URL,
        model: OLLAMA_EMBEDDING_MODEL,
        timeoutMs: OLLAMA_TIMEOUT,
      });
      documentContext = retrieval.context;
      documentSources = retrieval.sources;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Karar could not search your study documents. Please try again.';
      const status = /selected study documents are (invalid|unavailable)/i.test(message) ? 400 : 503;
      return res.status(status).json({ error: message });
    }
  }
  const generationMessages = documentContext
    ? messages.map((item, index) => index === messages.length - 1
      ? { ...item, content: `${item.content}\n\nUse the selected study documents and cite them in your answer.` }
      : item)
    : messages;

  let reservedTokens = 0;
  let maxOutputTokens = 2048;
  if (localSession && localSession.role !== 'owner') {
    const balance = localTokenAllowance(localSession.userId);
    if (balance === null || balance === undefined) {
      return res.status(401).json({ error: 'The account is unavailable. Please sign in again.' });
    }
    const promptBytes = Buffer.byteLength(tutorSystemPrompt, 'utf8') +
      Buffer.byteLength(documentContext, 'utf8') +
      generationMessages.reduce((total, item) => total + Buffer.byteLength(item.content, 'utf8'), 0);
    const basePromptReserve = Math.ceil(promptBytes / 2) + generationMessages.length * 16 + 64;
    const latestQuestion = messages[messages.length - 1].content;
    const isArabicQuestion = containsArabicText(latestQuestion);
    const questionTranslationLimit = isArabicQuestion
      ? Math.min(4_096, Math.max(128, Math.ceil(Buffer.byteLength(latestQuestion, 'utf8') / 2)))
      : 0;
    const translationPromptReserve = isArabicQuestion
      ? Math.ceil(Buffer.byteLength(latestQuestion, 'utf8') / 2) + 120
      : 0;
    const promptReserve = isArabicQuestion
      ? basePromptReserve + translationPromptReserve + questionTranslationLimit + 120
      : basePromptReserve;
    if (!Number.isSafeInteger(promptReserve) || !Number.isSafeInteger(balance)) {
      return res.status(503).json({ error: 'Unable to safely calculate this account’s token allowance.' });
    }
    maxOutputTokens = Math.min(2048, Math.floor((balance - promptReserve) / (isArabicQuestion ? 3 : 1)));
    if (maxOutputTokens < 1) {
      return res.status(402).json({
        error: balance < 1
          ? 'You are out of tokens. Ask the Karar owner to add tokens to your account.'
          : 'This conversation needs more tokens. Ask the Karar owner to add tokens to your account.',
        tokenBalance: balance,
      });
    }
    reservedTokens = promptReserve + maxOutputTokens * (isArabicQuestion ? 3 : 1);
    try {
      if (!await reserveLocalTokens(localSession.userId, reservedTokens)) {
        const remaining = localTokenAllowance(localSession.userId) ?? 0;
        return res.status(402).json({
          error: 'There are not enough tokens available for this reply. Ask the Karar owner to add tokens.',
          tokenBalance: remaining,
        });
      }
    } catch (error) {
      console.error('User token reservation failed:', error);
      return res.status(503).json({ error: 'Unable to reserve account tokens. Please try again.' });
    }
  }

  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  try {
    const reply = await streamResponse(generationMessages, controller.signal, maxOutputTokens, (delta) => {
      if (!res.destroyed) writeChatEvent(res, { type: 'delta', content: delta });
    }, documentContext);
    if (localSession) {
      await settleLocalTokens(localSession.userId, reservedTokens, reply.totalTokens);
    }
    if (!res.destroyed) {
      writeChatEvent(res, {
        type: 'done',
        sources: documentSources,
        tokenBalance: localSession?.role === 'owner' ? null : localSession
          ? localTokenAllowance(localSession.userId)
          : undefined,
      });
      return res.end();
    }
  } catch (error) {
    if (localSession && reservedTokens > 0) {
      try {
        await releaseLocalTokens(localSession.userId, reservedTokens);
      } catch (releaseError) {
        console.error('Reserved user tokens could not be released:', releaseError);
      }
    }
    if (controller.signal.aborted || res.destroyed) return;
    const message = error instanceof Error ? error.message : 'Karar could not reply just now. Please try again.';
    writeChatEvent(res, { type: 'error', error: message });
    return res.end();
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/ollama/status', requireAjax, async (_req, res) => {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(4_000) });
    if (!response.ok) return res.status(503).json({ error: 'The local AI service is unavailable.' });
    const data = await response.json();
    const installedModels = Array.isArray(data.models) ? data.models.map((item) => item?.name) : [];
    const isInstalled = (modelName) => installedModels.some((name) =>
      name === modelName || name === `${modelName}:latest` || name?.replace(/:latest$/, '') === modelName);
    return res.json({
      chatReady: isInstalled(OLLAMA_MODEL),
      translationReady: isInstalled(OLLAMA_TRANSLATION_MODEL),
      embeddingsReady: isInstalled(OLLAMA_EMBEDDING_MODEL),
    });
  } catch {
    return res.status(503).json({ error: 'The local AI service is unavailable. Start Ollama and try again.' });
  }
});

if (isProduction) {
  const clientDistPath = path.resolve(__dirname, '../client/dist');
  app.use(express.static(clientDistPath));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDistPath, 'index.html')));
}

let server;
if (isProduction && LOCAL_AUTH_ENABLED) {
  const pfxPath = process.env.KARAR_TLS_PFX_PATH
    ? path.resolve(process.cwd(), process.env.KARAR_TLS_PFX_PATH)
    : '';
  if (!pfxPath || !process.env.KARAR_TLS_PFX_PASSWORD) {
    throw new Error('Local account mode in production requires KARAR_TLS_PFX_PATH and KARAR_TLS_PFX_PASSWORD.');
  }
  server = createHttpsServer({
    pfx: readFileSync(pfxPath),
    passphrase: process.env.KARAR_TLS_PFX_PASSWORD,
  }, app);
  server.listen(PORT, HOST, () => {
    console.log(`Karar HTTPS server listening on ${HOST}:${PORT}`);
  });
} else {
  server = app.listen(PORT, HOST, () => {
    console.log(`Karar server listening on ${HOST}:${PORT}`);
  });
}
export { server };
