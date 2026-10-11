import { useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import MessageItem from './MessageItem';
import WelcomeScreen from './WelcomeScreen';

export default function ChatArea() {
  const messages = useAppStore((state) => state.messages);
  const isLoading = useAppStore((state) => state.isLoading);
  const responseStarted = useAppStore((state) => state.responseStarted);
  const error = useAppStore((state) => state.error);
  const clearError = useAppStore((state) => state.clearError);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: isLoading ? 'auto' : 'smooth', block: 'end' });
  }, [messages, isLoading]);

  return (
    <main className={`chat-scroll ${messages.length === 0 ? 'chat-empty' : ''}`}>
      {messages.length === 0
        ? <WelcomeScreen />
        : <div className="conversation-thread">
          {messages.map((message, index) => <MessageItem key={`${message.timestamp}-${index}`} message={message} index={index} isLast={index === messages.length - 1} />)}
          {error && <div className="chat-error" role="alert"><p>{error}</p><button onClick={() => {
            clearError();
            const lastMessage = useAppStore.getState().messages[useAppStore.getState().messages.length - 1];
            if (lastMessage?.role === 'user') void useAppStore.getState().sendMessage(lastMessage.content);
          }}>{useAppStore.getState().language === 'ar' ? 'حاول مجدداً' : 'Try again'}</button><button className="error-dismiss" onClick={clearError} aria-label="Dismiss error">×</button></div>}
          {isLoading && !responseStarted && <div className="typing-indicator" role="status" aria-label="Karar is thinking"><span className="assistant-avatar"><span className="typing-dots"><i /><i /><i /></span></span><span>{useAppStore.getState().language === 'ar' ? 'قرار يفكر...' : 'Karar is thinking'}</span></div>}
          <div ref={endRef} />
        </div>}
    </main>
  );
}
