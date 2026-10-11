import { ArrowUpRight, Code2, Network, Sparkles } from 'lucide-react';
import { useAppStore } from '../store';

const suggestions = {
  en: [
    { icon: Code2, title: 'Explain recursion', detail: 'With a simple, practical example' },
    { icon: Sparkles, title: 'Help me debug this Python code', detail: 'Let’s figure it out together' },
    { icon: Network, title: 'Quiz me on networking', detail: 'One question at a time' },
  ],
  ar: [
    { icon: Code2, title: 'اشرح لي الاستدعاء الذاتي', detail: 'مع مثال عملي بسيط' },
    { icon: Sparkles, title: 'ساعدني في تصحيح كود Python', detail: 'لنكتشف الحل معاً' },
    { icon: Network, title: 'اختبرني في الشبكات', detail: 'سؤال واحد في كل مرة' },
  ],
};

export default function WelcomeScreen() {
  const language = useAppStore((state) => state.language);
  const sendMessage = useAppStore((state) => state.sendMessage);
  const items = suggestions[language];

  return (
    <section className="welcome-screen" aria-labelledby="welcome-title">
      <span className="welcome-icon"><span className="brand-mark"><Sparkles size={23} /></span></span>
      <p className="eyebrow">{language === 'ar' ? 'رفيقك في تعلّم التقنية' : 'YOUR STUDY COMPANION'}</p>
      <h1 id="welcome-title">{language === 'ar' ? 'مرحباً، أنا قرار.' : 'Hi, I’m Karar.'}<br />
        <span>{language === 'ar' ? 'ماذا تتعلم اليوم؟' : 'What are you learning today?'}</span>
      </h1>
      <p className="welcome-description">{language === 'ar'
        ? 'اسأل، جرّب، واكتشف — سأرافقك خطوة بخطوة.'
        : 'Ask anything, explore ideas, and work through the tricky bits together.'}</p>
      <div className="suggestion-grid">
        {items.map(({ icon: Icon, title, detail }) => (
          <button key={title} className="suggestion-card" onClick={() => void sendMessage(title)}>
            <span className="suggestion-icon"><Icon size={18} /></span>
            <span className="suggestion-copy"><strong>{title}</strong><small>{detail}</small></span>
            <ArrowUpRight size={16} className="suggestion-arrow" />
          </button>
        ))}
      </div>
      <p className="welcome-note">{language === 'ar' ? 'البرمجة · الخوارزميات · الشبكات · وأكثر' : 'Programming · algorithms · networking · and whatever you’re curious about'}</p>
    </section>
  );
}
