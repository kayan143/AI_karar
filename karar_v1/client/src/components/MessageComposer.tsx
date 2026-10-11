import { ArrowUp, FileCode2, FileText, Paperclip, Plus, Square, Table2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store';
import DocumentShelf from './DocumentShelf';
import type { DocumentShelfHandle } from './DocumentShelf';

export default function MessageComposer({ tokenBalance, isOwner, canUseDocuments }: { tokenBalance: number | null; isOwner: boolean; canUseDocuments: boolean }) {
  const [draft, setDraft] = useState('');
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const attachmentMenu = useRef<HTMLDivElement>(null);
  const documentShelf = useRef<DocumentShelfHandle>(null);
  const language = useAppStore((state) => state.language);
  const isLoading = useAppStore((state) => state.isLoading);
  const currentConversationId = useAppStore((state) => state.currentConversationId);
  const sendMessage = useAppStore((state) => state.sendMessage);
  const stopResponse = useAppStore((state) => state.stopResponse);
  const noTokens = !isOwner && tokenBalance !== null && tokenBalance < 1;
  const ar = language === 'ar';

  useEffect(() => {
    if (textarea.current) {
      textarea.current.style.height = 'auto';
      textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 180)}px`;
    }
  }, [draft]);

  useEffect(() => {
    if (!attachmentMenuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !attachmentMenu.current?.contains(event.target)) {
        setAttachmentMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [attachmentMenuOpen]);

  const submit = () => {
    if (!draft.trim() || isLoading) return;
    const current = draft;
    setDraft('');
    if (textarea.current) textarea.current.style.height = 'auto';
    void sendMessage(current);
  };

  return (
    <footer className="composer-wrap">
      {canUseDocuments && <DocumentShelf ref={documentShelf} />}
      <form className="composer-box" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <textarea
          ref={textarea}
          rows={1}
          aria-label={language === 'ar' ? 'اكتب رسالتك' : 'Message Karar'}
          placeholder={noTokens
            ? (language === 'ar' ? 'اطلب من مالك قرار إضافة رموز إلى حسابك.' : 'Ask the Karar owner to add tokens to your account.')
            : language === 'ar' ? 'اسأل سؤالاً أو الصق كوداً...' : 'Ask anything, or paste a piece of code…'}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          dir="auto"
        />
        <div className="composer-bottom">
          <div className="composer-tools">
            {canUseDocuments && (
              <div className="attachment-menu-wrap" ref={attachmentMenu}>
                <button
                  type="button"
                  className="attach-button"
                  aria-label={ar ? 'إضافة ملف' : 'Add a file'}
                  aria-haspopup="menu"
                  aria-expanded={attachmentMenuOpen}
                  title={ar ? 'إضافة ملف' : 'Add a file'}
                  disabled={isLoading}
                  onClick={() => setAttachmentMenuOpen((open) => !open)}
                >
                  <Plus size={17} strokeWidth={2.4} />
                </button>
                {attachmentMenuOpen && (
                  <div
                    className="attachment-menu"
                    role="menu"
                    aria-label={ar ? 'نوع الملف' : 'Choose a file type'}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        setAttachmentMenuOpen(false);
                        attachmentMenu.current?.querySelector<HTMLButtonElement>('.attach-button')?.focus();
                      }
                    }}
                  >
                    <button type="button" role="menuitem" onClick={() => { setAttachmentMenuOpen(false); documentShelf.current?.openFilePicker('notes'); }}>
                      <FileText size={16} />
                      <span><strong>{ar ? 'ملاحظات دراسية' : 'Study notes'}</strong><small>PDF, TXT, MD</small></span>
                    </button>
                    <button type="button" role="menuitem" onClick={() => { setAttachmentMenuOpen(false); documentShelf.current?.openFilePicker('code'); }}>
                      <FileCode2 size={16} />
                      <span><strong>{ar ? 'ملفات برمجية' : 'Code files'}</strong><small>Python, Java, JS, HTML…</small></span>
                    </button>
                    <button type="button" role="menuitem" onClick={() => { setAttachmentMenuOpen(false); documentShelf.current?.openFilePicker('data'); }}>
                      <Table2 size={16} />
                      <span><strong>{ar ? 'ملفات بيانات' : 'Data files'}</strong><small>CSV, JSON</small></span>
                    </button>
                  </div>
                )}
              </div>
            )}
            <span className="composer-tip"><Paperclip size={14} /> {language === 'ar' ? 'Shift + Enter لسطر جديد' : 'Shift + Enter for a new line'}</span>
          </div>
          {isLoading ? (
            <button type="button" className="send-button stop-button" aria-label="Stop response" onClick={stopResponse}><Square size={14} fill="currentColor" /><span>{language === 'ar' ? 'إيقاف' : 'Stop'}</span></button>
          ) : (
            <button type="submit" className="send-button" aria-label={language === 'ar' ? 'إرسال الرسالة' : 'Send message'} disabled={noTokens || !draft.trim() || !currentConversationId}>
              <ArrowUp size={18} strokeWidth={2.6} />
            </button>
          )}
        </div>
      </form>
      {noTokens && <p className="composer-quota-notice">{language === 'ar' ? 'نفد رصيد الرموز. تواصل مع مالك قرار لإضافة المزيد.' : 'Your token balance is empty. Contact the Karar owner to get more.'}</p>}
      <p className="composer-disclaimer">{language === 'ar' ? 'قرار يساعدك على التعلّم؛ تحقّق دائماً من المعلومات المهمة.' : 'Karar can make mistakes. Double-check anything important.'}</p>
    </footer>
  );
}
