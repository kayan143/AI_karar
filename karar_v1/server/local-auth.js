import { randomBytes, createCipheriv, createDecipheriv, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const deriveKey = promisify(scrypt);
const SESSION_COOKIE = '__Host-karar_session';
const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let storePath;
let store = { owner: null, users: [], sessions: [], conversations: [], deletedConversationIds: [], clearedAt: 0 };
let writes = Promise.resolve();

function encryptionKey() {
  const secret = process.env.KARAR_DATA_KEY;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('KARAR_DATA_KEY must contain at least 32 characters to encrypt local account data.');
  }
  return createHash('sha256').update(secret).digest();
}

function encryptStore(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return JSON.stringify({
    version: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64'),
  });
}

function decryptStore(value) {
  const envelope = JSON.parse(value);
  if (envelope?.version !== 1 || typeof envelope.iv !== 'string' || typeof envelope.tag !== 'string' || typeof envelope.data !== 'string') {
    throw new Error('The local account data is not in the encrypted format.');
  }
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64')),
    decipher.final(),
  ]).toString('utf8'));
}

function emptyStore() {
  return { owner: null, users: [], sessions: [], conversations: [], deletedConversationIds: [], clearedAtByUser: {}, clearedAt: 0 };
}

function findUser(data, userId) {
  if (data.owner?.id === userId) return data.owner;
  return data.users.find((user) => user.id === userId) ?? null;
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

async function writeStore(next) {
  const temporaryPath = `${storePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  next.lastUpdatedAt = new Date().toISOString();
  try {
    await fs.writeFile(temporaryPath, encryptStore(next), { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temporaryPath, storePath);
    store = next;
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
}

function transact(update) {
  const write = writes.then(async () => {
    const next = structuredClone(store);
    const result = await update(next);
    await writeStore(next);
    return result;
  });
  writes = write.catch(() => undefined);
  return write;
}

async function hashPassword(password, salt = randomBytes(16)) {
  const key = await deriveKey(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return { salt: salt.toString('hex'), passwordHash: key.toString('hex') };
}

async function verifyPassword(password, owner) {
  const salt = Buffer.from(owner.salt, 'hex');
  const expected = Buffer.from(owner.passwordHash, 'hex');
  const actual = await deriveKey(password, salt, expected.length, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function userFor(account) {
  return account ? {
    id: account.id,
    username: account.username,
    role: account.role,
    tokenBalance: account.role === 'owner' ? null : account.tokenBalance,
    tokensUsed: account.tokensUsed ?? 0,
    user_metadata: { display_name: account.displayName },
    created_at: account.createdAt,
  } : null;
}

function requestToken(req) {
  const cookie = req.headers.cookie?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1));
  } catch {
    return null;
  }
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/',
    maxAge: SESSION_DURATION,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/',
    maxAge: 0,
  });
}

async function createSession(account) {
  const token = randomBytes(32).toString('base64url');
  const session = {
    tokenHash: hashToken(token),
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DURATION,
  };
  await transact((next) => {
    if (!findUser(next, account.id)) throw new Error('The local account changed during sign-in.');
    next.sessions = next.sessions.filter((item) => item.expiresAt > Date.now());
    next.sessions.push({ ...session, userId: account.id });
  });
  return token;
}

async function currentSession(req) {
  const token = requestToken(req);
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = store.sessions.find((item) => item.tokenHash === tokenHash);
  const account = session && findUser(store, session.userId ?? store.owner?.id);
  if (!session || session.expiresAt <= Date.now() || !account) return null;
  return { tokenHash, userId: account.id, role: account.role, user: userFor(account) };
}

function isLoopback(req) {
  const address = (req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  return address === '127.0.0.1' || address === '::1';
}

function secureRequest(req, res) {
  const proxyAddress = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  const forwardedProtocol = req.get('X-Forwarded-Proto')?.split(',')[0].trim().toLowerCase();
  const localTlsProxy = ['127.0.0.1', '::1'].includes(proxyAddress) && forwardedProtocol === 'https';
  if (req.secure || localTlsProxy) return true;
  res.status(426).json({ error: 'Use the secure HTTPS address to manage this account.' });
  return false;
}

function validatedConversation(input) {
  if (
    !input ||
    typeof input.id !== 'string' ||
    input.id.length < 1 ||
    input.id.length > 128 ||
    typeof input.title !== 'string' ||
    input.title.length > 200 ||
    !Array.isArray(input.messages) ||
    input.messages.length > 200 ||
    input.messages.some((message) =>
      !message ||
      !['user', 'assistant'].includes(message.role) ||
      typeof message.content !== 'string' ||
      message.content.length > 12_000 ||
      (message.sources !== undefined &&
        (!Array.isArray(message.sources) ||
          message.sources.length > 10 ||
          message.sources.some((source) => typeof source !== 'string' || source.length > 512))) ||
      !Number.isFinite(message.timestamp)
    ) ||
    !Number.isFinite(input.createdAt) ||
    !Number.isFinite(input.updatedAt)
  ) return null;
  return {
    id: input.id,
    title: input.title,
    messages: input.messages.map(({ role, content, timestamp, sources }) => ({
      role,
      content,
      timestamp,
      ...(sources ? { sources } : {}),
    })),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

export async function initializeLocalAuth() {
  encryptionKey();
  storePath = path.resolve(process.env.KARAR_DATA_PATH || path.join(__dirname, 'data', 'karar-local.json'));
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  try {
    const contents = await fs.readFile(storePath, 'utf8');
    const envelope = JSON.parse(contents);
    const migratingPlaintext = envelope?.version !== 1 &&
      envelope &&
      (envelope.owner === null || typeof envelope.owner === 'object') &&
      Array.isArray(envelope.sessions) &&
      Array.isArray(envelope.conversations);
    const data = migratingPlaintext ? envelope : decryptStore(contents);
    if (
      !data ||
      (data.owner !== null && typeof data.owner !== 'object') ||
      !Array.isArray(data.sessions) ||
      !Array.isArray(data.conversations) ||
      !Array.isArray(data.deletedConversationIds) ||
      (data.clearedAtByUser !== undefined && (!data.clearedAtByUser || typeof data.clearedAtByUser !== 'object' || Array.isArray(data.clearedAtByUser))) ||
      (data.users !== undefined && !Array.isArray(data.users))
    ) throw new Error('The local account data has an unsupported format.');
    const needsMigration = migratingPlaintext ||
      !Array.isArray(data.users) ||
      !data.clearedAtByUser ||
      Boolean(data.owner && (data.owner.role !== 'owner' || !Number.isSafeInteger(data.owner.tokensUsed))) ||
      data.sessions.some((session) => !session.userId) ||
      data.deletedConversationIds.some((entry) => !entry.userId) ||
      data.conversations.some((conversation) => !conversation.userId);
    const owner = data.owner ? {
      ...data.owner,
      role: 'owner',
      tokensUsed: data.owner.tokensUsed ?? 0,
    } : null;
    store = {
      ...emptyStore(),
      ...data,
      owner,
      users: (data.users ?? []).map((user) => ({
        ...user,
        role: 'member',
        tokenBalance: Number.isSafeInteger(user.tokenBalance) ? user.tokenBalance : 0,
        tokensUsed: Number.isSafeInteger(user.tokensUsed) ? user.tokensUsed : 0,
        tokensGranted: Number.isSafeInteger(user.tokensGranted) ? user.tokensGranted : 0,
        reservedTokens: Number.isSafeInteger(user.reservedTokens) ? user.reservedTokens : 0,
      })),
      clearedAtByUser: data.clearedAtByUser ?? {},
      sessions: data.sessions.map((session) => ({
        ...session,
        userId: session.userId ?? owner?.id,
      })),
      conversations: data.conversations.map((conversation) => ({
        ...conversation,
        userId: conversation.userId ?? owner?.id,
      })),
      deletedConversationIds: data.deletedConversationIds.map((entry) => ({
        ...entry,
        userId: entry.userId ?? owner?.id,
      })),
    };
    if (needsMigration) await writeStore(store);
  } catch (error) {
    if (error.code === 'ENOENT') {
      store = emptyStore();
      await writeStore(store);
      return;
    }
    throw error;
  }
}

export async function resetLocalOwnerPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) {
    throw new Error('Choose a password with at least 12 characters.');
  }
  if (!store.owner) throw new Error('No local owner account exists yet.');
  const passwordData = await hashPassword(password);
  await transact((next) => {
    next.owner = { ...next.owner, ...passwordData };
    next.sessions = [];
  });
}

export function localAccountSession(req) {
  return currentSession(req);
}

export function localTokenAllowance(userId) {
  const account = findUser(store, userId);
  if (!account) return null;
  return account.role === 'owner' ? null : account.tokenBalance;
}

export async function reserveLocalTokens(userId, amount) {
  return transact((next) => {
    const account = findUser(next, userId);
    if (!account) return false;
    if (account.role === 'owner') return true;
    if (account.tokenBalance < amount) return false;
    account.tokenBalance -= amount;
    account.reservedTokens = (account.reservedTokens ?? 0) + amount;
    return true;
  });
}

export async function settleLocalTokens(userId, reserved, actual) {
  if (!Number.isSafeInteger(reserved) || reserved < 0 || !Number.isSafeInteger(actual) || actual < 0) {
    throw new Error('Token settlement values must be non-negative safe integers.');
  }
  return transact((next) => {
    const account = findUser(next, userId);
    if (!account) return false;
    const tokensUsed = (account.tokensUsed ?? 0) + actual;
    if (!Number.isSafeInteger(tokensUsed)) throw new Error('The account token usage limit was exceeded.');
    account.tokensUsed = tokensUsed;
    if (account.role === 'owner') return true;
    account.reservedTokens = Math.max(0, (account.reservedTokens ?? 0) - reserved);
    account.tokenBalance += reserved - actual;
    if (!Number.isSafeInteger(account.tokenBalance)) throw new Error('The account token balance limit was exceeded.');
    return true;
  });
}

export async function releaseLocalTokens(userId, reserved) {
  return settleLocalTokens(userId, reserved, 0);
}

export async function clearLocalDocumentReferences(userId, filename) {
  if (typeof filename !== 'string' || !filename) return;
  await transact((next) => {
    const prefix = `${filename},`;
    for (const conversation of next.conversations) {
      if (conversation.userId !== userId) continue;
      let changed = false;
      conversation.messages = conversation.messages.map((message) => {
        if (!Array.isArray(message.sources)) return message;
        const sources = message.sources.filter((source) => !source.startsWith(prefix));
        if (sources.length === message.sources.length) return message;
        changed = true;
        const updatedMessage = { ...message };
        delete updatedMessage.sources;
        if (sources.length) updatedMessage.sources = sources;
        return updatedMessage;
      });
      if (changed) conversation.updatedAt = Date.now();
    }
  });
}

export function registerLocalAuthRoutes(app, { requireAjax, rateLimit, deleteUserDocuments = async () => {} }) {
  const authenticated = async (req, res) => {
    if (!secureRequest(req, res)) return null;
    const session = await currentSession(req);
    if (!session) {
      res.status(401).json({ error: 'Sign in to access this local account.' });
      return null;
    }
    return session;
  };
  const administrator = async (req, res) => {
    const session = await authenticated(req, res);
    if (!session) return null;
    if (session.role !== 'owner') {
      res.status(403).json({ error: 'Only the Karar owner can manage user accounts.' });
      return null;
    }
    return session;
  };

  app.get('/api/auth/session', async (req, res) => {
    const session = await currentSession(req);
    return res.json({
      configured: true,
      mode: 'local',
      setupRequired: !store.owner,
      user: session?.user ?? null,
    });
  });

  app.post('/api/auth/setup', requireAjax, rateLimit, async (req, res) => {
    if (!secureRequest(req, res)) return;
    if (!isLoopback(req)) {
      return res.status(403).json({ error: 'Create the owner account from this PC at https://localhost:5000.' });
    }
    const { username, password } = req.body ?? {};
    if (
      typeof username !== 'string' ||
      !/^[a-zA-Z0-9_.-]{1,32}$/.test(username) ||
      typeof password !== 'string' ||
      password.length < 12 ||
      password.length > 256
    ) return res.status(400).json({ error: 'Choose a username and a password with at least 12 characters.' });
    try {
      const passwordData = await hashPassword(password);
      const owner = {
        id: randomBytes(16).toString('hex'),
        username,
        displayName: username,
        role: 'owner',
        tokensUsed: 0,
        ...passwordData,
        createdAt: new Date().toISOString(),
      };
      const created = await transact((next) => {
        if (next.owner) return false;
        next.owner = owner;
        return true;
      });
      if (!created) return res.status(409).json({ error: 'The owner account has already been created.' });
      const token = await createSession(owner);
      setSessionCookie(res, token);
      return res.status(201).json({ user: userFor(owner) });
    } catch (error) {
      console.error('Local owner setup failed:', error);
      return res.status(503).json({ error: 'Unable to save the local owner account. Check this PC’s storage and try again.' });
    }
  });

  app.post('/api/auth/signup', requireAjax, rateLimit, async (req, res) => {
    if (!secureRequest(req, res)) return;
    if (!store.owner) {
      return res.status(503).json({ error: 'The Karar owner must finish local setup before user registration is enabled.' });
    }
    const { username, password, displayName } = req.body ?? {};
    if (
      typeof username !== 'string' ||
      !/^[a-zA-Z0-9_.-]{3,32}$/.test(username) ||
      typeof password !== 'string' ||
      password.length < 12 ||
      password.length > 256 ||
      (displayName !== undefined && (typeof displayName !== 'string' || displayName.trim().length > 80))
    ) return res.status(400).json({ error: 'Use a username of 3–32 letters, numbers, dots, underscores, or hyphens and a password of at least 12 characters.' });
    try {
      const passwordData = await hashPassword(password);
      const account = {
        id: randomBytes(16).toString('hex'),
        username,
        displayName: typeof displayName === 'string' && displayName.trim() ? displayName.trim() : username,
        role: 'member',
        tokenBalance: 0,
        tokensUsed: 0,
        tokensGranted: 0,
        reservedTokens: 0,
        ...passwordData,
        createdAt: new Date().toISOString(),
      };
      const created = await transact((next) => {
        const duplicate = [next.owner, ...next.users]
          .some((user) => user?.username.toLowerCase() === username.toLowerCase());
        if (duplicate) return false;
        next.users.push(account);
        return true;
      });
      if (!created) return res.status(409).json({ error: 'That username is already in use. Choose another.' });
      const token = await createSession(account);
      setSessionCookie(res, token);
      return res.status(201).json({ user: userFor(account) });
    } catch (error) {
      console.error('Local user registration failed:', error);
      return res.status(503).json({ error: 'Unable to create the local account. Please try again.' });
    }
  });

  app.post('/api/auth/signin', requireAjax, rateLimit, async (req, res) => {
    if (!secureRequest(req, res)) return;
    if (!secureRequest(req, res)) return;
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string' || username.length > 32 || password.length > 256) {
      return res.status(401).json({ error: 'Unable to sign in with those details.' });
    }
    try {
      const account = [store.owner, ...store.users]
        .find((user) => user?.username.toLowerCase() === username.toLowerCase());
      const matches = account && await verifyPassword(password, account);
      if (!matches) return res.status(401).json({ error: 'Unable to sign in with those details.' });
      const token = await createSession(account);
      setSessionCookie(res, token);
      return res.json({ user: userFor(account) });
    } catch (error) {
      console.error('Local account sign-in failed:', error);
      return res.status(503).json({ error: 'The local account is temporarily unavailable.' });
    }
  });

  app.post('/api/auth/signout', requireAjax, async (req, res) => {
    const token = requestToken(req);
    if (token) {
      const tokenHash = hashToken(token);
      try {
        await transact((next) => { next.sessions = next.sessions.filter((item) => item.tokenHash !== tokenHash); });
      } catch (error) {
        console.error('Local session revocation failed:', error);
        return res.status(503).json({ error: 'Unable to sign out securely. Please try again.' });
      }
    }
    clearSessionCookie(res);
    return res.json({ success: true });
  });

  app.post('/api/auth/password', requireAjax, rateLimit, async (req, res) => {
    const session = await authenticated(req, res);
    if (!session) return;
    const { currentPassword, password } = req.body ?? {};
    if (
      typeof currentPassword !== 'string' ||
      typeof password !== 'string' ||
      password.length < 12 ||
      password.length > 256
    ) return res.status(400).json({ error: 'Enter your current password and choose a new password with at least 12 characters.' });
    try {
      const account = findUser(store, session.userId);
      if (!account || !await verifyPassword(currentPassword, account)) {
        return res.status(401).json({ error: 'The current password is incorrect.' });
      }
      const passwordData = await hashPassword(password);
      await transact((next) => {
        const target = findUser(next, session.userId);
        if (!target) throw new Error('The local account no longer exists.');
        Object.assign(target, passwordData);
        next.sessions = next.sessions.filter((item) => item.tokenHash === session.tokenHash);
      });
      setSessionCookie(res, requestToken(req));
      return res.json({ success: true });
    } catch (error) {
      console.error('Local password update failed:', error);
      return res.status(503).json({ error: 'Unable to update the password. Please try again.' });
    }
  });

  app.post('/api/auth/signout-others', requireAjax, async (req, res) => {
    const session = await authenticated(req, res);
    if (!session) return;
    try {
      await transact((next) => {
        next.sessions = next.sessions.filter((item) => item.tokenHash === session.tokenHash);
      });
      return res.json({ success: true });
    } catch (error) {
      console.error('Other local sessions could not be revoked:', error);
      return res.status(503).json({ error: 'Unable to sign out other sessions. Please try again.' });
    }
  });

  app.patch('/api/auth/profile', requireAjax, async (req, res) => {
    const session = await authenticated(req, res);
    if (!session) return;
    const { displayName } = req.body ?? {};
    if (typeof displayName !== 'string' || displayName.trim().length < 1 || displayName.trim().length > 80) {
      return res.status(400).json({ error: 'Enter a display name with 80 characters or fewer.' });
    }
    try {
      await transact((next) => {
        const account = findUser(next, session.userId);
        if (!account) throw new Error('The local account no longer exists.');
        account.displayName = displayName.trim();
      });
      return res.json({ success: true, user: userFor(findUser(store, session.userId)) });
    } catch (error) {
      console.error('Local profile update failed:', error);
      return res.status(503).json({ error: 'Unable to update the profile. Please try again.' });
    }
  });

  app.get('/api/account/usage', async (req, res) => {
    const session = await authenticated(req, res);
    if (!session) return;
    return res.json({ user: session.user });
  });

  app.get('/api/conversations', async (req, res) => {
    const session = await authenticated(req, res);
    if (!session) return;
    return res.json({ conversations: store.conversations.filter((conversation) => conversation.userId === session.userId) });
  });

  app.put('/api/conversations', requireAjax, async (req, res) => {
    const session = await authenticated(req, res);
    if (!session) return;
    const incoming = req.body?.conversations;
    if (!Array.isArray(incoming) || incoming.length > 500) {
      return res.status(400).json({ error: 'The conversation list is invalid or too large.' });
    }
    const conversations = incoming.map(validatedConversation);
    if (conversations.some((conversation) => !conversation)) {
      return res.status(400).json({ error: 'A conversation contains invalid or oversized messages.' });
    }
    const totalText = conversations.reduce((total, conversation) =>
      total + conversation.messages.reduce((sum, message) => sum + message.content.length, 0), 0);
    if (totalText > 4_000_000) return res.status(413).json({ error: 'The conversation archive is too large to save.' });
    try {
      await transact((next) => {
        const byId = new Map(next.conversations
          .filter((conversation) => conversation.userId === session.userId)
          .map((conversation) => [conversation.id, conversation]));
        const deleted = new Set(next.deletedConversationIds
          .filter((entry) => entry.userId === session.userId)
          .map((entry) => entry.id));
        for (const conversation of conversations) {
          if (deleted.has(conversation.id) ||
            conversation.updatedAt <= (next.clearedAtByUser[session.userId] ?? 0)) continue;
          const current = byId.get(conversation.id);
          if (!current || conversation.updatedAt > current.updatedAt) {
            byId.set(conversation.id, { ...conversation, userId: session.userId });
          }
        }
        next.conversations = [
          ...next.conversations.filter((conversation) => conversation.userId !== session.userId),
          ...[...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt),
        ];
      });
      return res.json({ conversations: store.conversations.filter((conversation) => conversation.userId === session.userId) });
    } catch (error) {
      console.error('Local conversations could not be saved:', error);
      return res.status(503).json({ error: 'Unable to save conversations on this PC. Check the available disk space.' });
    }
  });

  app.delete('/api/conversations', requireAjax, async (req, res) => {
    const session = await authenticated(req, res);
    if (!session) return;
    try {
      await transact((next) => {
        const deletedAt = Date.now();
        const entries = next.conversations
          .filter((conversation) => conversation.userId === session.userId)
          .map((conversation) => ({ id: conversation.id, userId: session.userId, deletedAt }));
        const known = new Map(next.deletedConversationIds.map((item) => [`${item.userId}:${item.id}`, item]));
        for (const item of entries) known.set(`${item.userId}:${item.id}`, item);
        next.deletedConversationIds = [...known.values()].slice(-5000);
        next.clearedAtByUser[session.userId] = deletedAt;
        next.conversations = next.conversations.filter((conversation) => conversation.userId !== session.userId);
      });
      return res.json({ success: true });
    } catch (error) {
      console.error('Local conversation deletion failed:', error);
      return res.status(503).json({ error: 'Unable to delete saved conversations. Please try again.' });
    }
  });

  app.delete('/api/conversations/:id', requireAjax, async (req, res) => {
    const session = await authenticated(req, res);
    if (!session) return;
    try {
      await transact((next) => {
        const exists = next.conversations.some((conversation) =>
          conversation.userId === session.userId && conversation.id === req.params.id);
        if (exists) {
          next.conversations = next.conversations.filter((conversation) =>
            conversation.userId !== session.userId || conversation.id !== req.params.id);
          next.deletedConversationIds = [
            ...next.deletedConversationIds.filter((entry) =>
              entry.userId !== session.userId || entry.id !== req.params.id),
            { id: req.params.id, userId: session.userId, deletedAt: Date.now() },
          ].slice(-5000);
        }
      });
      return res.json({ success: true });
    } catch (error) {
      console.error('Local conversation deletion failed:', error);
      return res.status(503).json({ error: 'Unable to delete that conversation. Please try again.' });
    }
  });

  app.get('/api/admin/summary', async (req, res) => {
    const session = await administrator(req, res);
    if (!session) return;
    const messages = store.conversations.reduce((total, conversation) => total + conversation.messages.length, 0);
    return res.json({
      username: store.owner.username,
      userCount: store.users.length + Number(Boolean(store.owner)),
      conversationCount: store.conversations.length,
      messageCount: messages,
      tokensUsed: [store.owner, ...store.users].reduce((total, user) => total + (user?.tokensUsed ?? 0), 0),
      storage: 'This PC',
      lastUpdatedAt: store.lastUpdatedAt ?? null,
    });
  });

  app.get('/api/admin/users', async (req, res) => {
    if (!await administrator(req, res)) return;
    const accounts = [store.owner, ...store.users].filter(Boolean);
    return res.json({
      users: accounts.map((account) => {
        const conversations = store.conversations.filter((conversation) => conversation.userId === account.id);
        return {
          ...userFor(account),
          conversationCount: conversations.length,
          messageCount: conversations.reduce((total, conversation) => total + conversation.messages.length, 0),
          tokensGranted: account.tokensGranted ?? 0,
          reservedTokens: account.reservedTokens ?? 0,
        };
      }),
    });
  });

  app.post('/api/admin/users/:id/tokens', requireAjax, rateLimit, async (req, res) => {
    if (!await administrator(req, res)) return;
    const { tokens } = req.body ?? {};
    if (!Number.isSafeInteger(tokens) || tokens < 1 || tokens > 1_000_000) {
      return res.status(400).json({ error: 'Grant between 1 and 1,000,000 tokens at a time.' });
    }
    try {
      const account = await transact((next) => {
        const target = next.users.find((user) => user.id === req.params.id);
        if (!target) return null;
        if (
          !Number.isSafeInteger(target.tokenBalance + tokens) ||
          !Number.isSafeInteger((target.tokensGranted ?? 0) + tokens)
        ) throw new Error('The account token balance limit was exceeded.');
        target.tokenBalance += tokens;
        target.tokensGranted += tokens;
        return userFor(target);
      });
      if (!account) return res.status(404).json({ error: 'That user account was not found.' });
      return res.json({ user: account });
    } catch (error) {
      console.error('Admin token grant failed:', error);
      return res.status(503).json({ error: 'Unable to grant tokens. Please try again.' });
    }
  });

  app.delete('/api/admin/users/:id', requireAjax, async (req, res) => {
    if (!await administrator(req, res)) return;
    try {
      if (!store.users.some((user) => user.id === req.params.id)) {
        return res.status(404).json({ error: 'That user account was not found.' });
      }
      await deleteUserDocuments(req.params.id);
      const deleted = await transact((next) => {
        const target = next.users.find((user) => user.id === req.params.id);
        if (!target) return false;
        next.users = next.users.filter((user) => user.id !== target.id);
        next.sessions = next.sessions.filter((item) => item.userId !== target.id);
        next.conversations = next.conversations.filter((conversation) => conversation.userId !== target.id);
        next.deletedConversationIds = next.deletedConversationIds.filter((entry) => entry.userId !== target.id);
        return true;
      });
      if (!deleted) return res.status(404).json({ error: 'That user account was not found.' });
      return res.json({ success: true });
    } catch (error) {
      console.error('Admin user deletion failed:', error);
      return res.status(503).json({ error: 'Unable to delete that user account. Please try again.' });
    }
  });

  app.delete('/api/admin/conversations', requireAjax, async (req, res) => {
    if (!await administrator(req, res)) return;
    try {
      await transact((next) => {
        const deletedAt = Date.now();
        const entries = next.conversations.map((conversation) => ({
          id: conversation.id,
          userId: conversation.userId,
          deletedAt,
        }));
        const known = new Map(next.deletedConversationIds.map((item) => [`${item.userId}:${item.id}`, item]));
        for (const item of entries) known.set(`${item.userId}:${item.id}`, item);
        next.deletedConversationIds = [...known.values()].slice(-5000);
        const accountIds = [next.owner?.id, ...next.users.map((user) => user.id)].filter(Boolean);
        for (const userId of accountIds) next.clearedAtByUser[userId] = deletedAt;
        next.conversations = [];
        next.sessions = next.sessions.filter((item) => item.userId === next.owner?.id);
      });
      return res.json({ success: true });
    } catch (error) {
      console.error('Admin conversation deletion failed:', error);
      return res.status(503).json({ error: 'Unable to delete saved conversations. Please try again.' });
    }
  });

  app.delete('/api/auth/account', requireAjax, rateLimit, async (req, res) => {
    const session = await authenticated(req, res);
    if (!session) return;
    const { password } = req.body ?? {};
    const account = findUser(store, session.userId);
    if (typeof password !== 'string' || !account || !await verifyPassword(password, account)) {
      return res.status(401).json({ error: 'Enter the current password to delete the account.' });
    }
    if (account.role === 'owner' && store.users.length > 0) {
      return res.status(409).json({ error: 'Delete member accounts before deleting the owner account.' });
    }
    try {
      await deleteUserDocuments(account.role === 'owner' ? null : session.userId);
      await transact((next) => {
        if (account.role === 'owner') {
          next.owner = null;
          next.users = [];
          next.sessions = [];
          next.conversations = [];
          next.deletedConversationIds = [];
          next.clearedAtByUser = {};
          next.clearedAt = Date.now();
        } else {
          next.users = next.users.filter((user) => user.id !== session.userId);
          next.sessions = next.sessions.filter((item) => item.userId !== session.userId);
          next.conversations = next.conversations.filter((conversation) => conversation.userId !== session.userId);
          next.deletedConversationIds = next.deletedConversationIds.filter((entry) => entry.userId !== session.userId);
          delete next.clearedAtByUser[session.userId];
        }
      });
      clearSessionCookie(res);
      return res.json({ success: true });
    } catch (error) {
      console.error('Local account deletion failed:', error);
      return res.status(503).json({ error: 'Unable to delete the local account. Please try again.' });
    }
  });
}
