import { useAppStore } from '../store';
import {
  BookOpen, FileText, HelpCircle, Info, MessageSquare, Moon, Plus, Settings2, Shield, Sun, Trash2,
} from 'lucide-react';

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
  onNavigate: (page: 'chat' | 'settings' | 'admin' | 'about' | 'privacy' | 'help') => void;
  page: string;
  isAdmin?: boolean;
}

const labels = {
  en: { new: 'New chat', recent: 'YOUR CHATS', settings: 'Settings', admin: 'Admin panel', about: 'About Karar', privacy: 'Privacy policy', help: 'Help & tips', empty: 'Your chats will show up here.', brandLabel: 'YOUR STUDY SPACE', light: 'Light', dark: 'Dark', auto: 'Auto', made: 'Made for the curious.', close: 'Close navigation' },
  ar: { new: 'محادثة جديدة', recent: 'محادثاتك', settings: 'الإعدادات', admin: 'لوحة الإدارة', about: 'عن قرار', privacy: 'سياسة الخصوصية', help: 'المساعدة والنصائح', empty: 'ستظهر محادثاتك هنا.', brandLabel: 'مساحة تعلّمك', light: 'فاتح', dark: 'داكن', auto: 'تلقائي', made: 'صُنع بدافع الفضول.', close: 'إغلاق القائمة' },
};

export default function Sidebar({ mobileOpen, onClose, onNavigate, page, isAdmin = false }: SidebarProps) {
  const language = useAppStore((state) => state.language);
  const theme = useAppStore((state) => state.theme);
  const conversations = useAppStore((state) => state.conversations);
  const recentConversations = conversations.filter((conversation) => conversation.messages.length > 0);
  const selectedId = useAppStore((state) => state.currentConversationId);
  const newConversation = useAppStore((state) => state.newConversation);
  const selectConversation = useAppStore((state) => state.setCurrentConversationId);
  const deleteConversation = useAppStore((state) => state.deleteConversation);
  const setTheme = useAppStore((state) => state.setTheme);
  const t = labels[language];

  const navigate = (target: 'chat' | 'settings' | 'admin' | 'about' | 'privacy' | 'help') => {
    onNavigate(target);
    onClose();
  };

  return (
    <>
      {mobileOpen && <button className="sidebar-scrim" onClick={onClose} aria-label={t.close} />}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`} aria-label="Main navigation">
        <button className="brand-lockup" onClick={() => navigate('chat')} aria-label="Karar home">
          <span className="brand-mark" aria-hidden="true"><BookOpen size={20} strokeWidth={2.2} /></span>
          <span className="brand-name">karar<span className="brand-dot">.</span></span>
          <span className="brand-label">{t.brandLabel}</span>
        </button>

        <button className="new-chat-button" onClick={() => { newConversation(); navigate('chat'); }}>
          <Plus size={17} strokeWidth={2.2} />{t.new}
          <span className="shortcut">⌘ K</span>
        </button>

        <div className="conversation-list">
          <p className="sidebar-section-label">{t.recent}</p>
          {recentConversations.length === 0
            ? <p className="sidebar-empty">{t.empty}</p>
            : recentConversations.map((conversation) => (
              <div key={conversation.id} className={`conversation-row ${selectedId === conversation.id && page === 'chat' ? 'conversation-selected' : ''}`}>
                <button className="conversation-link" onClick={() => { selectConversation(conversation.id); navigate('chat'); }}>
                  <MessageSquare size={15} /><span>{conversation.title}</span>
                </button>
                <button
                  className="conversation-delete"
                  aria-label={`Delete ${conversation.title}`}
                  title="Delete conversation"
                  onClick={() => {
                    if (window.confirm(language === 'ar' ? 'حذف هذه المحادثة؟' : 'Delete this conversation? This can’t be undone.')) {
                      deleteConversation(conversation.id);
                    }
                  }}
                ><Trash2 size={14} /></button>
              </div>
            ))}
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-theme-row" aria-label="Theme">
            <Sun size={14} aria-hidden="true" />
            <button className={`theme-segment ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')} aria-label={t.light}>{t.light}</button>
            <button className={`theme-segment ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')} aria-label={t.dark}><Moon size={13} /></button>
            <button className={`theme-segment ${theme === 'system' ? 'active' : ''}`} onClick={() => setTheme('system')} aria-label={t.auto}>{t.auto}</button>
          </div>
          <button className={`sidebar-nav-link ${page === 'settings' ? 'nav-active' : ''}`} onClick={() => navigate('settings')}><Settings2 size={17} />{t.settings}</button>
          {isAdmin && <button className={`sidebar-nav-link ${page === 'admin' ? 'nav-active' : ''}`} onClick={() => navigate('admin')}><Shield size={17} />{t.admin}</button>}
          <button className={`sidebar-nav-link ${page === 'about' ? 'nav-active' : ''}`} onClick={() => navigate('about')}><Info size={17} />{t.about}</button>
          <button className={`sidebar-nav-link ${page === 'privacy' ? 'nav-active' : ''}`} onClick={() => navigate('privacy')}><FileText size={17} />{t.privacy}</button>
          <button className={`sidebar-nav-link ${page === 'help' ? 'nav-active' : ''}`} onClick={() => navigate('help')}><HelpCircle size={17} />{t.help}</button>
          <div className="sidebar-footer"><span>{t.made}</span><span>v1.0</span></div>
        </div>
      </aside>
    </>
  );
}
