import { Check, Copy, Edit3, Lightbulb, RefreshCw, Sparkles, Swords, StepForward, X } from 'lucide-react';
import { useState } from 'react';
import { Message, useAppStore } from '../store';

interface MessageItemProps {
  message: Message;
  index: number;
  isLast: boolean;
}

function highlightCode(code: string) {
  const tokens = code.split(/(\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:const|let|var|function|return|if|else|for|while|class|import|from|export|async|await|def|print|True|False|None|in|not|and|or|new|public|static|void|int|string|true|false|null)\b|\b\d+(?:\.\d+)?\b)/g);
  return tokens.map((token, index) => {
    let kind = '';
    if (/^(\/\/|#)/.test(token)) kind = 'token-comment';
    else if (/^["']/.test(token)) kind = 'token-string';
    else if (/^\d/.test(token)) kind = 'token-number';
    else if (/^(const|let|var|function|return|if|else|for|while|class|import|from|export|async|await|def|print|True|False|None|in|not|and|or|new|public|static|void|int|string|true|false|null)$/.test(token)) kind = 'token-keyword';
    return <span className={kind} key={`${index}-${token}`}>{token}</span>;
  });
}

function inlineContent(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g);
  return parts.map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index} className="inline-code" dir="ltr">{part.slice(1, -1)}</code>;
    return part;
  });
}

function FormattedAnswer({ content }: { content: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  };
  const blocks = content.split(/(```[\w.+-]*\n[\s\S]*?(?:```|$))/g);
  return <div className="answer-content">
    {blocks.map((block, blockIndex) => {
      const code = block.match(/^```([\w.+-]*)\n([\s\S]*?)(?:```)?$/);
      if (code) return (
        <div className="code-block" dir="ltr" key={blockIndex}>
          <div className="code-header"><span>{code[1] || 'code'}</span><button onClick={() => void copy(code[2].replace(/\n$/, ''), `code-${blockIndex}`)} aria-label="Copy code">{copied === `code-${blockIndex}` ? <Check size={14} /> : <Copy size={14} />} {copied === `code-${blockIndex}` ? 'Copied' : 'Copy'}</button></div>
          <pre><code>{highlightCode(code[2])}</code></pre>
        </div>
      );
      return block.split('\n').map((line, lineIndex) => {
        const key = `${blockIndex}-${lineIndex}`;
        if (!line.trim()) return <div className="paragraph-gap" key={key} />;
        if (/^#{1,3}\s/.test(line)) {
          const depth = line.match(/^#+/)?.[0].length ?? 2;
          const Heading = `h${Math.min(depth + 1, 4)}` as 'h2' | 'h3' | 'h4';
          return <Heading className="answer-heading" key={key}>{inlineContent(line.replace(/^#{1,3}\s+/, ''))}</Heading>;
        }
        if (/^\s*[-*]\s/.test(line)) return <div className="answer-list-item" key={key}><span aria-hidden="true">•</span><span>{inlineContent(line.replace(/^\s*[-*]\s+/, ''))}</span></div>;
        if (/^\s*\d+[.)]\s/.test(line)) return <div className="answer-list-item" key={key}><span className="ordered-marker">{line.match(/^\s*\d+/)?.[0]}.</span><span>{inlineContent(line.replace(/^\s*\d+[.)]\s+/, ''))}</span></div>;
        return <p key={key}>{inlineContent(line)}</p>;
      });
    })}
  </div>;
}

export default function MessageItem({ message, index, isLast }: MessageItemProps) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState('');
  const [notice, setNotice] = useState('');
  const language = useAppStore((state) => state.language);
  const isLoading = useAppStore((state) => state.isLoading);
  const responseStarted = useAppStore((state) => state.responseStarted);
  const messages = useAppStore((state) => state.messages);
  const sendMessage = useAppStore((state) => state.sendMessage);
  const editMessage = useAppStore((state) => state.editMessage);
  const continueFromMessage = useAppStore((state) => state.continueFromMessage);
  const retry = useAppStore((state) => state.retryMessage);
  const isUser = message.role === 'user';
  const isStreaming = isLast && isLoading && responseStarted;
  const editTargetIndex = isUser ? index : index - 1;
  const editTarget = messages[editTargetIndex];
  const canEdit = editTarget?.role === 'user';
  const ar = language === 'ar';

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const startEditing = () => {
    if (!canEdit || isLoading) return;
    setEditDraft(editTarget.content);
    setEditing(true);
    setNotice('');
  };

  const saveEdit = () => {
    const content = editDraft.trim();
    if (!content || !canEdit || isLoading) return;
    const confirmed = window.confirm(ar
      ? 'سيؤدي تعديل هذه الرسالة إلى حذف كل ما جاء بعدها من المحادثة، ثم سيُنشأ رد جديد من النص المعدّل. هل تريد المتابعة؟'
      : 'Editing this message will permanently remove everything that followed it in this conversation, then generate a new response from the edited text. Continue?');
    if (!confirmed) return;
    setEditing(false);
    void editMessage(editTargetIndex, content);
  };

  const continueHere = () => {
    if (isLoading) return;
    const laterCount = messages.length - index - 1;
    if (laterCount > 0) {
      const confirmed = window.confirm(ar
        ? `سيؤدي المتابعة من هنا إلى حذف ${laterCount} رسالة بعدها. هل تريد المتابعة؟`
        : `Continuing from here will remove the ${laterCount} message${laterCount === 1 ? '' : 's'} that followed it. Continue?`);
      if (!confirmed) return;
    }
    continueFromMessage(index);
    setEditing(false);
    setNotice(ar ? 'تمت متابعة المحادثة من هذه الرسالة.' : 'Conversation continued from this message.');
    window.setTimeout(() => setNotice(''), 2500);
  };

  const actions = (
    <div className="message-actions" aria-label={ar ? 'إجراءات الرسالة' : 'Message actions'}>
      {canEdit && (
        <button type="button" onClick={startEditing} disabled={isLoading} aria-label={ar ? 'تعديل الرسالة' : 'Edit message'}>
          <Edit3 size={15} /><span>{ar ? 'تعديل' : 'Edit'}</span>
        </button>
      )}
      <button type="button" onClick={() => void copyMessage()} aria-label={ar ? 'نسخ الرسالة' : 'Copy message'}>
        {copied ? <Check size={15} /> : <Copy size={15} />}
        <span>{copied ? (ar ? 'نُسخ' : 'Copied') : (ar ? 'نسخ' : 'Copy')}</span>
      </button>
      <button type="button" onClick={continueHere} disabled={isLoading} aria-label={ar ? 'المتابعة من هنا' : 'Continue from here'}>
        <StepForward size={15} /><span>{ar ? 'المتابعة من هنا' : 'Continue from here'}</span>
      </button>
    </div>
  );

  if (isUser) return (
    <div className="user-message-row">
      <article className="user-message">
        {editing ? (
          <div className="message-editor">
            <p className="edit-warning" role="note">{ar
              ? 'سيؤدي حفظ التعديل إلى حذف كل الرسائل التالية وإنشاء رد جديد من النص المعدّل.'
              : 'Saving this edit removes all following messages and generates a new response from the edited text.'}</p>
            <textarea aria-label={ar ? 'تعديل الرسالة' : 'Edit message'} value={editDraft} onChange={(event) => setEditDraft(event.target.value)} dir="auto" autoFocus />
            <div className="message-editor-actions">
              <button type="button" onClick={() => setEditing(false)}><X size={14} />{ar ? 'إلغاء' : 'Cancel'}</button>
              <button type="button" className="message-primary-action" onClick={saveEdit} disabled={!editDraft.trim()}>{ar ? 'تعديل وإعادة الرد' : 'Save & regenerate'}</button>
            </div>
          </div>
        ) : <p dir="auto">{message.content}</p>}
      </article>
      {actions}
      {notice && <span className="message-action-notice" role="status">{notice}</span>}
    </div>
  );

  return (
    <article className="assistant-message">
      <div className="assistant-avatar" aria-hidden="true"><Sparkles size={15} /></div>
      <div className="assistant-body">
        <div className="assistant-byline">{ar ? 'قرار' : 'Karar'}<span className="byline-dot" />{ar ? 'رفيقك في التعلّم' : 'Study companion'}</div>
        {editing ? (
          <div className="message-editor">
            <p className="edit-warning" role="note">{ar
              ? 'سيؤدي تعديل السؤال المرتبط بهذه الإجابة إلى حذف هذه الإجابة وكل الرسائل التالية، ثم إنشاء رد جديد.'
              : 'Editing the question for this answer removes this answer and all following messages, then generates a new response.'}</p>
            <textarea aria-label={ar ? 'تعديل السؤال' : 'Edit the question'} value={editDraft} onChange={(event) => setEditDraft(event.target.value)} dir="auto" autoFocus />
            <div className="message-editor-actions">
              <button type="button" onClick={() => setEditing(false)}><X size={14} />{ar ? 'إلغاء' : 'Cancel'}</button>
              <button type="button" className="message-primary-action" onClick={saveEdit} disabled={!editDraft.trim()}>{ar ? 'تعديل وإعادة الرد' : 'Save & regenerate'}</button>
            </div>
          </div>
        ) : <FormattedAnswer content={message.content} />}
        {message.sources && message.sources.length > 0 && (
          <div className="answer-sources">
            <strong>{ar ? 'المصادر' : 'Sources'}</strong>
            {message.sources.map((source) => <span key={source}>{source}</span>)}
          </div>
        )}
        {isStreaming && <span className="streaming-cursor" aria-label={ar ? 'جارٍ كتابة الرد' : 'Response is streaming'} />}
        {!isStreaming && <>
          {actions}
          <div className="answer-actions">
            {isLast && <button onClick={() => void retry()} aria-label="Regenerate answer"><RefreshCw size={14} /><span>{ar ? 'حاول مجدداً' : 'Try again'}</span></button>}
            {isLast && <span className="action-divider" />}
            {isLast && <button onClick={() => void sendMessage(ar ? `أعطني تلميحاً يساعدني على فهم هذا دون كشف الإجابة مباشرة:\n\n${message.content.slice(0, 220)}` : `Give me a helpful hint about this answer without revealing everything:\n\n${message.content.slice(0, 220)}`)}><Lightbulb size={14} /><span>{ar ? 'تلميح' : 'Hint'}</span></button>}
            {isLast && <button onClick={() => void sendMessage(ar ? `اشرح الفكرة السابقة بطريقة أبسط ومثال واضح:\n\n${message.content.slice(0, 220)}` : `Explain that in simpler terms, with one clear example:\n\n${message.content.slice(0, 220)}`)}><Sparkles size={14} /><span>{ar ? 'ببساطة' : 'Simplify'}</span></button>}
            {isLast && <button onClick={() => void sendMessage(ar ? 'أعطني سؤال تدريب واحداً عن موضوعنا، ولا تعرض الإجابة حتى أجيب.' : 'Give me one practice question on this topic, and wait for my answer before showing the solution.')}><Swords size={14} /><span>{ar ? 'تدريب' : 'Practice'}</span></button>}
          </div>
          {notice && <span className="message-action-notice" role="status">{notice}</span>}
        </>}
      </div>
    </article>
  );
}
