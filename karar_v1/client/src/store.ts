import { create } from 'zustand';
import axios from 'axios';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  sources?: string[];
}

export interface StudyDocument {
  id: string;
  filename: string;
  size: number;
  pageCount: number;
  chunkCount: number;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

interface AppStore {
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  language: 'en' | 'ar';
  setLanguage: (language: 'en' | 'ar') => void;
  saveHistory: boolean;
  setSaveHistory: (enabled: boolean) => void;
  accountSyncEnabled: boolean;
  setAccountSyncEnabled: (enabled: boolean) => void;
  accountId: string | null;
  activeStorageKey: string | null;
  activateAccountStorage: (accountId: string | null, migrateLegacyChats?: boolean, keepGuestChats?: boolean) => void;
  removeActiveAccountStorage: () => void;
  tokenBalance: number | null;
  setTokenBalance: (balance: number | null) => void;
  selectedDocumentIds: string[];
  setSelectedDocumentIds: (ids: string[]) => void;
  clearDocumentReferences: (filename: string) => void;
  setConversations: (conversations: Conversation[]) => void;
  conversations: Conversation[];
  currentConversationId: string | null;
  setCurrentConversationId: (id: string) => void;
  newConversation: () => void;
  deleteConversation: (id: string) => void;
  clearConversations: () => void;
  editMessage: (index: number, content: string) => Promise<void>;
  continueFromMessage: (index: number) => void;
  messages: Message[];
  isLoading: boolean;
  responseStarted: boolean;
  error: string | null;
  sendMessage: (content: string, forceNew?: boolean) => Promise<void>;
  retryMessage: () => Promise<void>;
  stopResponse: () => void;
  clearError: () => void;
}

const STORAGE_KEY = 'karar-conversations';
const settings = {
  theme: (localStorage.getItem('karar-theme') as AppStore['theme']) || 'light',
  language: (localStorage.getItem('karar-language') as AppStore['language']) || 'en',
};

function readConversations(): Conversation[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) as Conversation[] : [];
  } catch {
    return [];
  }
}

function createConversationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  }
  return `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

let activeRequest: AbortController | null = null;

export const useAppStore = create<AppStore>((set, get) => ({
  theme: settings.theme,
  setTheme: (theme) => {
    localStorage.setItem('karar-theme', theme);
    set({ theme });
  },
  language: settings.language,
  setLanguage: (language) => {
    localStorage.setItem('karar-language', language);
    set({ language });
  },
  saveHistory: localStorage.getItem('karar-save-history') !== 'false',
  setSaveHistory: (saveHistory) => {
    localStorage.setItem('karar-save-history', String(saveHistory));
    if (!saveHistory) {
      localStorage.removeItem(STORAGE_KEY);
      set({ saveHistory, conversations: [], currentConversationId: null, messages: [] });
      return;
    }
    set({ saveHistory });
  },
  accountSyncEnabled: false,
  setAccountSyncEnabled: (accountSyncEnabled) => set({ accountSyncEnabled }),
  accountId: null,
  activeStorageKey: null,
  activateAccountStorage: (accountId, migrateLegacyChats = false, keepGuestChats = false) => {
    activeRequest?.abort();
    activeRequest = null;
    const storageKey = accountId ? `${STORAGE_KEY}:${accountId}` : keepGuestChats ? STORAGE_KEY : null;
    let conversations: Conversation[] = [];
    if (storageKey) {
      try {
        const saved = localStorage.getItem(storageKey);
        conversations = saved ? JSON.parse(saved) as Conversation[] : [];
        if (accountId && migrateLegacyChats && !saved) {
          const legacy = localStorage.getItem(STORAGE_KEY);
          if (legacy) {
            conversations = JSON.parse(legacy) as Conversation[];
            localStorage.setItem(storageKey, JSON.stringify(conversations));
            localStorage.removeItem(STORAGE_KEY);
          }
        }
      } catch {
        throw new Error('Saved browser conversations could not be loaded safely.');
      }
    }
    set({
      accountId,
      activeStorageKey: storageKey,
      accountSyncEnabled: false,
      selectedDocumentIds: [],
      conversations,
      currentConversationId: conversations[0]?.id ?? null,
      messages: conversations[0]?.messages ?? [],
      isLoading: false,
      responseStarted: false,
      error: null,
    });
  },
  removeActiveAccountStorage: () => {
    const { activeStorageKey } = get();
    if (activeStorageKey) localStorage.removeItem(activeStorageKey);
    get().activateAccountStorage(null);
  },
  tokenBalance: null,
  setTokenBalance: (tokenBalance) => set({ tokenBalance }),
  selectedDocumentIds: [],
  setSelectedDocumentIds: (selectedDocumentIds) => set({ selectedDocumentIds }),
  clearDocumentReferences: (filename) => set((state) => {
    const prefix = `${filename},`;
    const conversations = state.conversations.map((conversation) => {
      let changed = false;
      const messages = conversation.messages.map((message) => {
        if (!message.sources) return message;
        const sources = message.sources.filter((source) => !source.startsWith(prefix));
        if (sources.length === message.sources.length) return message;
        changed = true;
        if (sources.length) return { ...message, sources };
        return { role: message.role, content: message.content, timestamp: message.timestamp };
      });
      return changed ? { ...conversation, messages, updatedAt: Date.now() } : conversation;
    });
    const current = conversations.find((conversation) => conversation.id === state.currentConversationId);
    return {
      conversations,
      messages: current?.messages ?? state.messages,
    };
  }),
  setConversations: (conversations) => set({
    conversations,
    currentConversationId: conversations[0]?.id ?? null,
    messages: conversations[0]?.messages ?? [],
  }),
  conversations: readConversations(),
  currentConversationId: null,
  setCurrentConversationId: (id) => {
    const conversation = get().conversations.find((item) => item.id === id);
    set({ currentConversationId: id, messages: conversation?.messages ?? [], error: null });
  },
  newConversation: () => {
    activeRequest?.abort();
    activeRequest = null;
    const now = Date.now();
    const conversation: Conversation = {
      id: createConversationId(),
      title: 'New chat',
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      currentConversationId: conversation.id,
      messages: [],
      error: null,
      isLoading: false,
      responseStarted: false,
    }));
  },
  deleteConversation: (id) => {
    const { conversations, currentConversationId } = get();
    const remaining = conversations.filter((item) => item.id !== id);
    const nextId = currentConversationId === id ? remaining[0]?.id ?? null : currentConversationId;
    const freshConversation = currentConversationId === id && !nextId
      ? {
        id: createConversationId(),
        title: 'New chat',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      : null;
    set({
      conversations: freshConversation ? [...remaining, freshConversation] : remaining,
      currentConversationId: nextId ?? freshConversation?.id ?? null,
      messages: remaining.find((item) => item.id === nextId)?.messages ?? [],
    });
  },
  clearConversations: () => {
    activeRequest?.abort();
    activeRequest = null;
    set({ conversations: [], currentConversationId: null, messages: [], isLoading: false, responseStarted: false, error: null });
  },
  editMessage: async (index, rawContent) => {
    const content = rawContent.trim();
    const { currentConversationId, conversations } = get();
    const conversation = conversations.find((item) => item.id === currentConversationId);
    if (!conversation || !content || index < 0 || index >= conversation.messages.length || conversation.messages[index].role !== 'user') return;

    activeRequest?.abort();
    activeRequest = null;
    const nextMessages = conversation.messages.slice(0, index);
    set((state) => ({
      messages: state.currentConversationId === currentConversationId ? nextMessages : state.messages,
      conversations: state.conversations.map((item) => item.id === currentConversationId
        ? { ...item, messages: nextMessages, updatedAt: Date.now(), title: index === 0 ? content.slice(0, 44) : item.title }
        : item),
      error: null,
      isLoading: false,
      responseStarted: false,
    }));
    await get().sendMessage(content, true);
  },
  continueFromMessage: (index) => {
    const { currentConversationId, conversations } = get();
    const conversation = conversations.find((item) => item.id === currentConversationId);
    if (!conversation || index < 0 || index >= conversation.messages.length) return;

    activeRequest?.abort();
    activeRequest = null;
    const nextMessages = conversation.messages.slice(0, index + 1);
    set((state) => ({
      messages: state.currentConversationId === currentConversationId ? nextMessages : state.messages,
      conversations: state.conversations.map((item) => item.id === currentConversationId
        ? { ...item, messages: nextMessages, updatedAt: Date.now() }
        : item),
      error: null,
      isLoading: false,
      responseStarted: false,
    }));
  },
  messages: [],
  isLoading: false,
  responseStarted: false,
  error: null,
  clearError: () => set({ error: null }),
  stopResponse: () => {
    activeRequest?.abort();
    activeRequest = null;
    set({ isLoading: false, responseStarted: false });
  },
  sendMessage: async (rawContent, forceNew = false) => {
    const content = rawContent.trim();
    if (!content || get().isLoading) return;
    if (!get().currentConversationId) get().newConversation();
    const conversationId = get().currentConversationId;
    if (!conversationId) return;

    const controller = new AbortController();
    activeRequest = controller;
    const userMessage: Message = { role: 'user', content, timestamp: Date.now() };
    const current = get().conversations.find((item) => item.id === conversationId);
    const previousMessages = current?.messages ?? [];
    const isRetrying = !forceNew && previousMessages[previousMessages.length - 1]?.role === 'user' &&
      previousMessages[previousMessages.length - 1]?.content === content;
    const updatedMessages = isRetrying ? previousMessages : [...previousMessages, userMessage];
    set((state) => ({
      messages: state.currentConversationId === conversationId ? updatedMessages : state.messages,
      conversations: state.conversations.map((item) => item.id === conversationId
        ? {
          ...item,
          messages: updatedMessages,
          updatedAt: Date.now(),
          title: item.title === 'New chat' ? content.slice(0, 44) : item.title,
        }
        : item),
      isLoading: true,
      responseStarted: false,
      error: null,
    }));

    let assistantTimestamp: number | null = null;
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          messages: updatedMessages.slice(-38).map(({ role, content: text }) => ({ role, content: text })),
          documentIds: get().selectedDocumentIds,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string; tokenBalance?: number };
        if (typeof data.tokenBalance === 'number' && activeRequest === controller) get().setTokenBalance(data.tokenBalance);
        throw new Error(data.error || 'Karar could not reply just now. Please try again.');
      }
      if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) {
        throw new Error('Karar returned an unexpected response. Please try again.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      let streamedContent = '';
      const currentAssistantTimestamp = Date.now();
      assistantTimestamp = currentAssistantTimestamp;
      let completed = false;

      const processEvent = (eventText: string) => {
        for (const line of eventText.split(/\r?\n/)) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data) continue;
          const event = JSON.parse(data) as { type?: string; content?: string; error?: string; tokenBalance?: number | null; sources?: string[] };
          if (event.type === 'delta' && typeof event.content === 'string') {
            streamedContent += event.content;
            const assistantMessage: Message = {
              role: 'assistant',
              content: streamedContent,
              timestamp: currentAssistantTimestamp,
            };
            set((state) => {
              if (activeRequest !== controller) return state;
              const conversation = state.conversations.find((item) => item.id === conversationId);
              const priorMessages = conversation?.messages ?? updatedMessages;
              const lastPriorMessage = priorMessages[priorMessages.length - 1];
              const hasStreamingMessage = lastPriorMessage?.role === 'assistant' &&
                lastPriorMessage.timestamp === currentAssistantTimestamp;
              const nextMessages = hasStreamingMessage
                ? [...priorMessages.slice(0, -1), assistantMessage]
                : [...priorMessages, assistantMessage];
              return {
                messages: state.currentConversationId === conversationId ? nextMessages : state.messages,
                conversations: state.conversations.map((item) => item.id === conversationId
                  ? { ...item, messages: nextMessages, updatedAt: Date.now() }
                  : item),
                responseStarted: true,
              };
            });
          } else if (event.type === 'done') {
            completed = true;
            if (activeRequest === controller && Array.isArray(event.sources) && event.sources.every((source) => typeof source === 'string')) {
              set((state) => {
                const conversation = state.conversations.find((item) => item.id === conversationId);
                const conversationMessages = conversation?.messages ?? [];
                const lastMessage = conversationMessages[conversationMessages.length - 1];
                if (lastMessage?.role !== 'assistant' || lastMessage.timestamp !== currentAssistantTimestamp) return state;
                const nextMessages = [...conversationMessages.slice(0, -1), { ...lastMessage, sources: event.sources }];
                return {
                  messages: state.currentConversationId === conversationId ? nextMessages : state.messages,
                  conversations: state.conversations.map((item) => item.id === conversationId
                    ? { ...item, messages: nextMessages }
                    : item),
                };
              });
            }
            if (activeRequest === controller && typeof event.tokenBalance === 'number') {
              get().setTokenBalance(event.tokenBalance);
            }
          } else if (event.type === 'error') {
            throw new Error(event.error || 'Karar could not reply just now. Please try again.');
          }
        }
      };

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });
          const events = pending.replace(/\r\n/g, '\n').split('\n\n');
          pending = events.pop() ?? '';
          for (const eventText of events) processEvent(eventText);
        }
        pending += decoder.decode();
        if (pending.trim()) processEvent(pending);
      } finally {
        reader.releaseLock();
      }
      if (!completed) throw new Error('The tutor response ended unexpectedly. Please try again.');
      if (activeRequest === controller) set({ isLoading: false, responseStarted: false });
    } catch (error) {
      if (controller.signal.aborted) return;
      const detail = error instanceof Error ? error.message : 'Karar could not reply just now. Please try again.';
      if (activeRequest === controller) {
        set((state) => {
          const conversation = state.conversations.find((item) => item.id === conversationId);
          const nextConversationMessages = conversation?.messages.filter((message) =>
            message.role !== 'assistant' || assistantTimestamp === null || message.timestamp !== assistantTimestamp) ?? updatedMessages;
          return {
            error: detail,
            isLoading: false,
            responseStarted: false,
            messages: state.currentConversationId === conversationId
              ? nextConversationMessages
              : state.messages,
            conversations: state.conversations.map((item) => item.id === conversationId
              ? { ...item, messages: nextConversationMessages, updatedAt: Date.now() }
              : item),
          };
        });
      }
    } finally {
      if (activeRequest === controller) {
        activeRequest = null;
        set({ isLoading: false, responseStarted: false });
      }
    }
  },
  retryMessage: async () => {
    const { messages, currentConversationId } = get();
    if (messages[messages.length - 1]?.role !== 'assistant' || !currentConversationId) return;
    const question = messages[messages.length - 2]?.content;
    if (!question) return;
    const trimmed = messages.slice(0, -1);
    set((state) => ({
      messages: trimmed,
      conversations: state.conversations.map((item) => item.id === currentConversationId
        ? { ...item, messages: trimmed, updatedAt: Date.now() }
        : item),
    }));
    await get().sendMessage(question);
  },
}));

let accountSyncQueue = Promise.resolve();

useAppStore.subscribe((state, previousState) => {
  if (state.activeStorageKey) {
    if (state.saveHistory) {
      localStorage.setItem(state.activeStorageKey, JSON.stringify(state.conversations));
    } else {
      localStorage.removeItem(state.activeStorageKey);
    }
  }
  if (state.accountSyncEnabled && state.conversations !== previousState.conversations) {
    const removedIds = previousState.conversations
      .filter((conversation) => !state.conversations.some((current) => current.id === conversation.id))
      .map((conversation) => conversation.id);
    const snapshot = state.conversations;
    const accountId = state.accountId;
    const clearAll = previousState.conversations.length > 0 && snapshot.length === 0;
    accountSyncQueue = accountSyncQueue.then(async () => {
      if (useAppStore.getState().accountId !== accountId) return;
      if (clearAll) {
        await axios.delete('/api/conversations', { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        return;
      }
      for (const id of removedIds) {
        if (useAppStore.getState().accountId !== accountId) return;
        await axios.delete(`/api/conversations/${encodeURIComponent(id)}`, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      }
      if (snapshot.length > 0 && useAppStore.getState().accountId === accountId) {
        await axios.put('/api/conversations', {
          conversations: snapshot.filter((conversation) => conversation.messages.length > 0),
        }, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      }
    }).catch(() => {
      useAppStore.setState({ error: 'Unable to sync saved chats to this PC. Check the connection and try again.' });
    });
  }
});
