import axios from 'axios';
import { Fragment } from 'react';
import {
  ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronDown, Download, Eye, HelpCircle,
  EyeOff, Languages, LockKeyhole, LogOut, Mail, Menu, Shield, Sparkles, Sun, Trash2,
  UserRound, X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import ChatArea from './components/ChatArea';
import MessageComposer from './components/MessageComposer';
import Sidebar from './components/Sidebar';
import { Conversation, useAppStore } from './store';

type Page = 'chat' | 'settings' | 'admin' | 'about' | 'privacy' | 'terms' | 'help' | 'signin' | 'signup' | 'forgot' | 'reset' | 'setup';
type AuthUser = { id: string; username?: string; email?: string; role?: 'owner' | 'member'; tokenBalance?: number | null; tokensUsed?: number; user_metadata?: { display_name?: string }; email_confirmed_at?: string; created_at?: string };
type AuthStatus = { configured: boolean; mode?: 'local' | 'supabase'; setupRequired?: boolean; user: AuthUser | null };
const translations = {
  en: { settings: 'Settings', about: 'About Karar', privacy: 'Privacy policy', help: 'Help & tips', back: 'Back to chat', welcome: 'Hi, I’m Karar. What are you learning today?', language: 'Language', signIn: 'Sign in', signUp: 'Create account', newChat: 'New chat' },
  ar: { settings: 'الإعدادات', about: 'عن قرار', privacy: 'سياسة الخصوصية', help: 'المساعدة والنصائح', back: 'العودة إلى المحادثة', welcome: 'مرحباً، أنا قرار. ماذا تتعلم اليوم؟', language: 'اللغة', signIn: 'تسجيل الدخول', signUp: 'إنشاء حساب', newChat: 'محادثة جديدة' },
};
const strings = {
  en: {
    welcome: 'Good to have you here.', create: 'Create your account to keep learning.', email: 'Email address', password: 'Password', confirm: 'Confirm password', name: 'Display name (optional)', forgot: 'Forgot password?', sendLink: 'Send reset link', signIn: 'Sign in', signUp: 'Create account', noAccount: 'New to Karar?', haveAccount: 'Already have an account?', back: 'Back to sign in', reset: 'Set a new password', resetSent: 'If there’s an account for that address, we’ll send a password reset link.', verification: 'Check your inbox for a verification link before signing in.', terms: 'By creating an account, you agree to our', termsLink: 'Terms', privacy: 'Privacy Policy', and: 'and', or: 'or', guest: 'Explore Karar without an account', authSecurity: 'Your password is sent only over a secure connection.', termsTitle: 'Terms of Use', termsBody: 'Use Karar respectfully and only share information you are comfortable sending to the configured AI service. AI-generated answers can be inaccurate; verify important information. The owner must publish and review the complete terms before enabling accounts.', pwRule: 'Use at least 10 characters.', notConfigured: 'Accounts aren’t set up yet. The app owner needs to connect Supabase to enable sign-in, registration, and recovery.', profile: 'Profile', appearance: 'Appearance', privacyHeading: 'Privacy', security: 'Account security', notifications: 'Notifications', settings: 'Settings', language: 'Language', displayName: 'Display name', emailAddress: 'Email', unverified: 'Unverified', verified: 'Verified', save: 'Save changes', light: 'Light', dark: 'Dark', system: 'System', history: 'Save chats on this device', historyDesc: 'Your conversation history is saved in this browser only. It is not stored on Karar’s server.', export: 'Export my chats', clear: 'Delete all conversations', clearDesc: 'Permanently remove the saved conversations from this browser.', deleteAccount: 'Delete account', deleteAccountDesc: 'Permanently close your account and remove its personal data.', changePassword: 'Change password', otherSessions: 'Sign out other sessions', dataSaved: 'Your changes have been saved.', enabled: 'Enabled', disabled: 'Disabled', notificationDesc: 'Karar does not currently send notifications.', aboutTitle: 'A little help goes a long way.', aboutBody: 'Karar is an AI tutor for IT students, built to make technical topics easier to explore. Ask questions, share code, or work through a concept one step at a time — at your own pace.', contact: 'Get in touch', aboutContact: 'Questions or feedback? Call', helpTitle: 'A better way to get unstuck.', helpBody: 'Tell Karar what you are working on, what you have tried, and where you got stuck. You can paste code directly into the chat.', helpList: ['Ask for an example when an idea feels abstract.', 'Try “explain this more simply” or ask for a hint.', 'Ask for a practice question, then try it before revealing the answer.', 'Never paste passwords, API keys, or private information into a chat.'], draft: 'DRAFT — PENDING OWNER REVIEW', policyTitle: 'Privacy Policy', policyUpdated: 'Last reviewed: pending owner review.', pIntro: 'This draft describes the current Karar application. Items in square brackets need to be confirmed by the app owner before this policy is final.', pAccount: 'Account & authentication', pAccountBody: 'If the app owner configures Supabase, the service receives your email and an optional display name to create and secure your account. Supabase handles password storage and email verification; Karar does not receive or store your password.', pChats: 'Messages & AI responses', pChatsBody: 'When you send a message, the Karar server forwards your current conversation to NVIDIA?s hosted AI API so it can generate a response. Server chat history is not retained by Karar; conversation history, when enabled, is stored in browser local storage on this device. [Owner: identify the AI provider’s retention and training practices, regional processing locations, and applicable data-processing terms.]', pRetention: 'Storage & retention', pRetentionBody: 'Local chat history remains in this browser until you delete it or clear browser storage. Sign-in sessions use a secure, HTTP-only cookie when authentication is configured. [Owner: verify production session lifetime, provider account-retention rules, backups, and deletion completion timelines.]', pServices: 'Cookies & service providers', pServicesBody: 'The app uses a strictly necessary sign-in session cookie when account authentication is enabled and browser local storage for your preferences and, optionally, chat history. [Owner: confirm the production hosting and email-delivery providers and verify NVIDIA and Supabase service configuration, cookies, and analytics use.] No analytics integration is included in the current app code.', pChoices: 'Your choices & requests', pChoicesBody: 'Turn off chat history, delete conversations, or export locally saved chats in Settings. If account authentication is configured, you can change your password or request account deletion in Settings. [Owner: confirm available account export and the response/deletion process for any data held by the AI or hosting providers.]', pSecurity: 'Security', pSecurityBody: 'API credentials are configured on the server, not in browser code. Authentication sessions use HTTP-only cookies and passwords are handled by the configured authentication provider. No system can promise absolute security.', pChildren: 'Children’s privacy', pChildrenBody: '[Owner: specify the minimum age for the service and how inquiries regarding children’s data are handled. The app’s intended audience is IT students; its minimum age has not been verified.]', pUpdates: 'Changes to this policy', pUpdatesBody: 'This draft may change after the owner verifies its providers, retention settings, and operating practices. The final policy should show its effective date.', pContact: 'Contact', pending: '[Owner: confirm and complete before publication.]', contactLine: 'For privacy questions, call', account: 'Account', signOut: 'Sign out', welcomeBack: 'Welcome back', resetSuccess: 'Password updated. Sign in with your new password.', signInAgain: 'Please sign in to use this account feature.', close: 'Close menu',
  },
  ar: {
    termsTitle: 'شروط الاستخدام',
    termsBody: 'استخدم قرار بمسؤولية، وشارك فقط المعلومات التي توافق على إرسالها إلى خدمة الذكاء الاصطناعي المُعدّة. قد تكون الإجابات غير دقيقة؛ تحقّق من المعلومات المهمة. يجب على مالك التطبيق إعداد الشروط الكاملة ومراجعتها قبل تفعيل الحسابات.',
    welcome: 'سعداء بوجودك.', create: 'أنشئ حساباً لمتابعة التعلّم.', email: 'البريد الإلكتروني', password: 'كلمة المرور', confirm: 'تأكيد كلمة المرور', name: 'الاسم المعروض (اختياري)', forgot: 'نسيت كلمة المرور؟', sendLink: 'إرسال رابط الاستعادة', signIn: 'تسجيل الدخول', signUp: 'إنشاء حساب', noAccount: 'جديد في قرار؟', haveAccount: 'لديك حساب؟', back: 'العودة لتسجيل الدخول', reset: 'تعيين كلمة مرور جديدة', resetSent: 'إذا كان هناك حساب بهذا البريد، فسنرسل رابط استعادة كلمة المرور.', verification: 'تحقّق من بريدك الإلكتروني لفتح رابط التأكيد قبل تسجيل الدخول.', terms: 'بإنشاء حساب، فإنك توافق على', termsLink: 'الشروط', privacy: 'سياسة الخصوصية', and: 'و', or: 'أو', guest: 'جرّب قرار دون حساب', authSecurity: 'تُرسل كلمة المرور عبر اتصال آمن فقط.', pwRule: 'استخدم ١٠ أحرف على الأقل.', notConfigured: 'الحسابات غير مفعّلة بعد. يجب على مالك التطبيق إعداد Supabase لتفعيل التسجيل وتسجيل الدخول واستعادة الحساب.', profile: 'الملف الشخصي', appearance: 'المظهر', privacyHeading: 'الخصوصية', security: 'أمان الحساب', notifications: 'الإشعارات', settings: 'الإعدادات', language: 'اللغة', displayName: 'الاسم المعروض', emailAddress: 'البريد الإلكتروني', unverified: 'غير مؤكد', verified: 'مؤكد', save: 'حفظ التغييرات', light: 'فاتح', dark: 'داكن', system: 'النظام', history: 'حفظ المحادثات على هذا الجهاز', historyDesc: 'يُحفظ سجل محادثاتك في هذا المتصفح فقط، ولا يُخزّن على خادم قرار.', export: 'تصدير محادثاتي', clear: 'حذف كل المحادثات', clearDesc: 'إزالة المحادثات المحفوظة نهائياً من هذا المتصفح.', deleteAccount: 'حذف الحساب', deleteAccountDesc: 'إغلاق حسابك نهائياً وحذف بياناتك الشخصية.', changePassword: 'تغيير كلمة المرور', otherSessions: 'تسجيل الخروج من الجلسات الأخرى', dataSaved: 'تم حفظ التغييرات.', enabled: 'مفعّل', disabled: 'معطّل', notificationDesc: 'لا يرسل قرار إشعارات حالياً.', aboutTitle: 'خطوة صغيرة تفتح آفاقاً جديدة.', aboutBody: 'قرار معلّم ذكاء اصطناعي لطلاب تقنية المعلومات، يساعدك على استكشاف المواضيع التقنية بسهولة. اسأل، شارك الكود، أو تعلّم مفهوماً خطوة بخطوة وبالوتيرة التي تناسبك.', contact: 'تواصل معنا', aboutContact: 'للاستفسارات أو الملاحظات، اتصل بـ', helpTitle: 'تخطَّ العقبات خطوة بخطوة.', helpBody: 'أخبر قرار بما تعمل عليه، وما جرّبته، وأين واجهت صعوبة. يمكنك لصق الكود مباشرة في المحادثة.', helpList: ['اطلب مثالاً حين يبدو المفهوم صعباً.', 'جرّب «اشرح ذلك ببساطة» أو اطلب تلميحاً.', 'اطلب سؤالاً تدريبياً وحاول حله قبل طلب الإجابة.', 'لا تشارك كلمات المرور أو مفاتيح API أو المعلومات الخاصة في المحادثة.'], draft: 'مسودة — تنتظر مراجعة المالك', policyTitle: 'سياسة الخصوصية', policyUpdated: 'آخر مراجعة: تنتظر مراجعة المالك.', pIntro: 'تصف هذه المسودة تطبيق قرار الحالي. يجب على مالك التطبيق التحقق من المعلومات بين الأقواس وإكمالها قبل اعتماد السياسة.', pAccount: 'الحساب والمصادقة', pAccountBody: 'عند إعداد Supabase، يستقبل البريد الإلكتروني والاسم الاختياري لإنشاء الحساب وتأمينه. يتولى Supabase حفظ كلمات المرور والتحقق من البريد الإلكتروني؛ ولا يستقبل قرار كلمة مرورك أو يحفظها.', pChats: 'الرسائل والردود', pChatsBody: 'عند إرسال رسالة، يمرر خادم قرار محادثتك الحالية إلى مزود الذكاء الاصطناعي (NVIDIA) المُعد لإنتاج رد. لا يحتفظ خادم قرار بسجل المحادثات؛ وعند تفعيل سجل المحادثات، يُحفظ في التخزين المحلي للمتصفح على هذا الجهاز. [على المالك تحديد ممارسات الاحتفاظ والتدريب لدى مزود الذكاء الاصطناعي ومواقع المعالجة وشروط معالجة البيانات.]', pRetention: 'التخزين والاحتفاظ', pRetentionBody: 'يبقى سجل المحادثات المحلي في المتصفح إلى أن تحذفه أو تمسح بيانات المتصفح. عند تفعيل المصادقة، تستخدم الجلسات ملفات تعريف ارتباط آمنة لا يمكن لواجهة JavaScript قراءتها. [على المالك التحقق من مدة الجلسة وقواعد الاحتفاظ بحساب المزود والنسخ الاحتياطية ومواعيد اكتمال الحذف في بيئة الإنتاج.]', pServices: 'ملفات الارتباط ومزودو الخدمة', pServicesBody: 'يستخدم التطبيق ملف ارتباط ضرورياً للجلسة عند تفعيل الحساب، والتخزين المحلي لإعداداتك وسجل المحادثات اختيارياً. [على المالك توثيق مزودي الاستضافة والذكاء الاصطناعي والبريد وخدمات الإنتاج والتحقق من ملفات الارتباط والتحليلات.] لا توجد خدمة تحليلات في كود التطبيق الحالي.', pChoices: 'خياراتك وطلباتك', pChoicesBody: 'يمكنك تعطيل سجل المحادثات أو حذفها أو تصديرها محلياً من الإعدادات. عند تفعيل الحساب، يمكنك تغيير كلمة المرور أو طلب حذف الحساب. [على المالك تأكيد إمكانية تصدير الحساب وإجراءات الاستجابة والحذف لدى مزودي الذكاء الاصطناعي والاستضافة.]', pSecurity: 'الأمان', pSecurityBody: 'تُضبط مفاتيح API على الخادم لا في المتصفح. تستخدم الجلسات ملفات ارتباط لا يمكن لـ JavaScript قراءتها، ويتولى مزود المصادقة كلمات المرور. لا يمكن ضمان الأمان المطلق.', pChildren: 'خصوصية الأطفال', pChildrenBody: '[على المالك تحديد الحد الأدنى لعمر المستخدم وكيفية التعامل مع استفسارات بيانات الأطفال. التطبيق مخصص لطلاب تقنية المعلومات، لكن الحد الأدنى للعمر لم يُتحقق منه.]', pUpdates: 'تحديثات السياسة', pUpdatesBody: 'قد تتغير هذه المسودة بعد تأكيد المزودين وإعدادات الاحتفاظ وممارسات التشغيل. يجب إظهار تاريخ سريان السياسة النهائية.', pContact: 'التواصل', pending: '[على المالك التحقق والاستكمال قبل النشر.]', contactLine: 'للاستفسارات المتعلقة بالخصوصية، اتصل بـ', account: 'الحساب', signOut: 'تسجيل الخروج', welcomeBack: 'مرحباً بعودتك', resetSuccess: 'تم تحديث كلمة المرور. سجّل الدخول بكلمتك الجديدة.', signInAgain: 'سجّل الدخول لاستخدام ميزة الحساب هذه.', close: 'إغلاق القائمة',
  },
};
type Copy = typeof strings.en;

function Field({ label, type = 'text', value, onChange, required = false, autoComplete }: { label: string; type?: string; value: string; onChange: (value: string) => void; required?: boolean; autoComplete?: string }) {
  return <label className="form-field"><span>{label}</span><input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} /></label>;
}

function AuthPage({ page, copy, configured, localMode, externalNotice, onNavigate, onSignedIn, onGuest }: { page: Page; copy: Copy; configured: boolean; localMode: boolean; externalNotice: string; onNavigate: (page: Page) => void; onSignedIn: (user: AuthUser) => void; onGuest: () => void }) {
  const language = useAppStore((state) => state.language);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('leo');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const localResetHelp = language === 'ar'
    ? 'أوقف Karar أولاً من نافذة التشغيل باستخدام Ctrl+C. ثم افتح PowerShell في مجلد المشروع وشغّل: npm.cmd run reset:local-owner. اختر كلمة مرور جديدة من 12 حرفاً على الأقل، ثم أعد تشغيل start.bat. سيؤدي ذلك إلى تسجيل خروج الجلسات الحالية مع الاحتفاظ بالمحادثات.'
    : 'First stop Karar with Ctrl+C in its running terminal. Then open PowerShell in the project folder and run: npm.cmd run reset:local-owner. Choose a new password with at least 12 characters, then restart start.bat. This signs out existing sessions but keeps saved conversations.';
  const request = async (path: string, body: object) => axios.post(`/api/auth/${path}`, body, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!configured && !(localMode && page === 'signup')) { setError(copy.notConfigured); return; }
    if ((page === 'setup' && password.length < 12) || ((page === 'signup' || page === 'reset') && password.length < (localMode ? 12 : 10))) { setError(localMode ? (language === 'ar' ? 'استخدم ١٢ حرفاً على الأقل.' : 'Use at least 12 characters.') : copy.pwRule); return; }
    if ((page === 'setup' || page === 'signup' || page === 'reset') && password !== confirmation) { setError(language === 'ar' ? 'كلمتا المرور غير متطابقتين.' : 'Those passwords don’t match.'); return; }
    setBusy(true);
    try {
      if (page === 'setup') {
        const { data } = await request('setup', { username, password });
        onSignedIn(data.user);
      } else if (page === 'signin') {
        const { data } = await request('signin', localMode ? { username, password } : { email, password });
        onSignedIn(data.user);
      } else if (page === 'signup') {
        const { data } = await request('signup', localMode
          ? { username, password, displayName }
          : { email, password, displayName });
        if (localMode) onSignedIn(data.user);
        else setNotice(copy.verification);
      } else if (page === 'forgot') {
        await request('forgot', { email });
        setNotice(copy.resetSent);
      } else if (page === 'reset') {
        await request('password', { password });
        setNotice(copy.resetSuccess);
        setPassword('');
        setConfirmation('');
      }
    } catch (cause) {
      const message = axios.isAxiosError<{ error?: string }>(cause) ? cause.response?.data?.error : undefined;
      setError(message || (language === 'ar' ? 'تعذّر إكمال الطلب. يرجى المحاولة مجدداً.' : 'We couldn’t complete that request. Please try again.'));
    } finally { setBusy(false); }
  };

  const authTitle = page === 'setup'
    ? (language === 'ar' ? 'إعداد حساب المالك المحلي' : 'Set up your local owner account')
    : page === 'signup' ? copy.create : page === 'forgot' ? copy.forgot : page === 'reset' ? copy.reset : copy.welcomeBack;
  return (
    <main className="auth-layout">
      <div className="auth-brand"><div className="brand-mark"><BookOpen size={21} /></div><span>karar<span className="brand-dot">.</span></span></div>
      <section className="auth-card">
        <div className="auth-symbol"><Sparkles size={22} /></div>
        <h1>{authTitle}</h1>
        <p className="auth-subtitle">{page === 'setup'
          ? (language === 'ar' ? 'أنشئ الحساب مرة واحدة على هذا الكمبيوتر. افتح https://localhost:5000 لإعداد المالك.' : 'Create the owner account once on this PC. Open https://localhost:5000 for first-time setup.')
          : page === 'signup' ? copy.create : page === 'forgot' ? (language === 'ar' ? 'سنرسل إليك رابطاً آمناً لإعادة تعيين كلمة المرور.' : 'We’ll email you a secure link to reset your password.') : page === 'reset' ? copy.pwRule : copy.welcome}</p>
        {!configured && <div className="status-banner"><Shield size={17} /><p>{copy.notConfigured}</p></div>}
        {error && <div className="form-error" role="alert">{error}</div>}
        {(notice || externalNotice) && <div className="form-success" role="status"><CheckCircle2 size={17} />{notice || externalNotice}</div>}
        <form className="auth-form" hidden={page === 'reset' && Boolean(notice)} onSubmit={(event) => void submit(event)}>
          {localMode
            ? <Field label={language === 'ar' ? 'اسم المستخدم' : 'Username'} autoComplete="username" value={username} onChange={setUsername} required />
            : page === 'signup' && <Field label={copy.name} value={displayName} onChange={setDisplayName} />}
          {page !== 'reset' && !localMode && <Field label={copy.email} type="email" autoComplete="email" value={email} onChange={setEmail} required />}
          {page !== 'forgot' && <label className="form-field"><span>{copy.password}</span><span className="password-wrap"><input required type={showPassword ? 'text' : 'password'} autoComplete={page === 'signin' ? 'current-password' : 'new-password'} minLength={page === 'signin' && !localMode ? undefined : localMode ? 12 : 10} value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>}
          {(page === 'setup' || page === 'signup' || page === 'reset') && <Field label={copy.confirm} type="password" autoComplete="new-password" value={confirmation} onChange={setConfirmation} required />}
          {page === 'signin' && !localMode && <button className="forgot-link" type="button" onClick={() => onNavigate('forgot')}>{copy.forgot}</button>}
          <button className="primary-button auth-submit" type="submit" disabled={busy}>{busy ? <span className="button-spinner" /> : page === 'setup' ? (language === 'ar' ? 'إنشاء حساب المالك' : 'Create owner account') : page === 'forgot' ? copy.sendLink : page === 'signin' ? copy.signIn : page === 'reset' ? copy.reset : copy.signUp}<ArrowRight size={17} /></button>
        </form>
        {page === 'signin' && localMode && <button className="forgot-link" type="button" onClick={() => setNotice(localResetHelp)}>{language === 'ar' ? 'نسيت كلمة المرور؟' : 'Forgot password?'}</button>}
        {page === 'reset' && notice && <button className="primary-button auth-submit" onClick={onGuest}>{language === 'ar' ? 'متابعة إلى المحادثة' : 'Continue to chat'}<ArrowRight size={17} /></button>}
        {page === 'signup' && <p className="terms-copy">{copy.terms} <a href="#/terms" onClick={(event) => { event.preventDefault(); onNavigate('terms'); }}>{copy.termsTitle}</a> {copy.and} <a href="#/privacy" onClick={(event) => { event.preventDefault(); onNavigate('privacy'); }}>{copy.privacy}</a>.</p>}
        {page === 'signin' && !configured && !localMode && <button className="subtle-link auth-switch" onClick={onGuest}>{copy.guest}</button>}
        {page === 'signin' && <p className="auth-switch">{copy.noAccount} <button className="subtle-link" onClick={() => onNavigate('signup')}>{copy.signUp}</button></p>}
        {page === 'signup' && <p className="auth-switch">{copy.haveAccount} <button className="subtle-link" onClick={() => onNavigate('signin')}>{copy.signIn}</button></p>}
        {page === 'forgot' && <p className="auth-switch"><button className="subtle-link" onClick={() => onNavigate('signin')}>{copy.back}</button></p>}
        {(page === 'signin' || page === 'signup') && <p className="auth-security"><LockKeyhole size={13} />{copy.authSecurity}</p>}
      </section>
      <footer className="auth-footer"><button onClick={() => onNavigate('privacy')}>{copy.privacy}</button><span>·</span><span>Karar © 2026</span></footer>
    </main>
  );
}

function Policy({ c, localAccount, language }: { c: Copy; localAccount: boolean; language: 'en' | 'ar' }) {
  const accountBody = localAccount
    ? 'Local mode has one owner account and supports separate member accounts created by people using the local Wi-Fi site. Each account has a username and salted scrypt password hash; passwords are not stored in plaintext. No email, Supabase project, or email-verification service is used. The owner can view account and usage statistics but not member conversation content.'
    : c.pAccountBody;
  const chatsBody = localAccount
    ? 'Messages and conversation context are sent from this server to the Ollama service configured by the owner. By default, Ollama runs locally on this PC and uses the llama3.2:3b model. If the endpoint is changed, the owner must verify the destination and its data practices. Each signed-in account’s conversations are saved separately on this PC in an AES-256-GCM encrypted local file and in that account’s browser-local storage. Uploaded supported documents are read on this PC; text and locally generated embeddings are stored in a separate AES-256-GCM encrypted local index. Selected excerpts and the question are sent to the configured local Ollama chat model; the query and document text are sent to the configured Ollama embedding endpoint.'
    : 'Messages and the context needed to answer them are sent to the Ollama service configured by the app owner. By default, Ollama runs locally on the host computer with the llama3.2:3b model. Supported uploaded documents are read and indexed on this host using the configured Ollama embedding model (nomic-embed-text by default); selected excerpts and questions are sent to the configured chat endpoint. The owner must verify any changed endpoint and its data practices.';
  const retentionBody = localAccount
    ? 'Saved conversations remain on this PC until deleted in Settings or the admin panel, or until the owner account is deleted. Uploaded documents and their search index remain in an encrypted file under server/data until deleted in the chat document list or the associated account is deleted. The local archives are encrypted using a key in the server-only .env file. Session cookies are Secure, HTTP-only, SameSite=Strict and expire after 30 days; signing out revokes the session. Owner-created backups may persist separately.'
    : 'Conversations are stored according to the app’s configured account system. Uploaded documents and their local search index remain in an encrypted file on the Karar host until deleted in the document list or when the associated account is deleted. The owner’s separately created backups may persist and must be deleted separately. [Owner: verify account-provider retention and backup deletion practices.]';
  const servicesBody = localAccount
    ? 'Local account credentials and chat storage are managed by this Karar server; AI and embedding requests are sent to the configured Ollama services, which default to this PC. The default embedding model is nomic-embed-text and must be downloaded separately. The app uses browser local storage for a local copy of chats and preferences, and a Secure, HTTP-only session cookie. No analytics integration is included. The app is served over a locally generated HTTPS certificate that devices must trust.'
    : 'The AI and document-search features use the Ollama services configured by the app owner. By default, they run locally on the host computer; the default embedding model is nomic-embed-text. The owner must verify changed endpoints, account-provider, hosting, and email-service practices before publication.';
  const choicesBody = localAccount
    ? 'Export conversations in the admin panel, delete selected or all conversations in the app, and change the owner password in Settings. Deleting the owner account removes the encrypted account archive. Owner-created backup copies must be deleted separately.'
    : 'Delete an uploaded document from the study-document list to remove its active local index, or delete the associated account to remove its indexed documents. Account and conversation export/deletion options depend on the configured authentication provider. [Owner: confirm request procedures for any data held by external providers.]';
  const securityBody = localAccount
    ? 'Passwords are hashed with scrypt; session tokens are stored as hashes and sent in Secure, HTTP-only cookies. The server encrypts its local account, conversation, and document-index files with AES-256-GCM. Uploaded code and other documents are treated as untrusted text and are never executed. The encryption key and HTTPS private key are held in the ignored, server-only .env file. HTTPS protects LAN traffic only on devices that trust the local certificate.'
    : 'Uploaded documents are stored as encrypted data on the Karar host and are treated as untrusted text, not executed. AI and embedding credentials are configured server-side. The app also relies on its configured authentication provider and hosting protections. [Owner: verify the deployed encryption-key handling, TLS, backups, and provider security practices.]';
  const sections: [string, ReactNode][] = [
    [c.pAccount, accountBody], [c.pChats, chatsBody], [c.pRetention, retentionBody],
    [c.pServices, servicesBody], [c.pChoices, choicesBody], [c.pSecurity, securityBody],
    [c.pChildren, c.pChildrenBody], [c.pUpdates, c.pUpdatesBody], [c.pContact, `${c.contactLine} +961 81693429.`],
  ];
  const localSections: [string, ReactNode][] = language === 'ar'
    ? [
      ['1. معلومات الحساب والمصادقة', 'يتضمن الوضع المحلي حساب مالك واحداً، ويسمح بإنشاء حسابات منفصلة للمستخدمين عبر موقع شبكة Wi-Fi المحلية. لكل حساب اسم مستخدم وملخص كلمة مرور scrypt مع قيمة عشوائية؛ لا تُحفظ كلمات المرور كنص صريح. لا يستخدم هذا الوضع Supabase أو البريد الإلكتروني أو التحقق عبر البريد. يمكن للمالك الاطلاع على أسماء الحسابات وإحصاءات الاستخدام، لا محتوى محادثات المستخدمين.'],
      ['2. الرسائل والردود المولّدة بالذكاء الاصطناعي', 'يرسل خادم Karar الرسالة وسياق المحادثة إلى خدمة Ollama المحددة في إعداد الخادم لتوليد الرد. الإعداد الافتراضي يشغّل Ollama على هذا الكمبيوتر باستخدام نموذج llama3.2:3b محلياً. يمكن رفع ملفات مدعومة؛ تُستخرج نصوصها محلياً ويُنشأ لها فهرس تضمين بواسطة نموذج Ollama المحلي nomic-embed-text. عند تحديد ملف، يرسل التطبيق سؤالك والمقاطع المسترجعة إلى نماذج Ollama المهيأة. يعرض الرد مراجع إلى اسم الملف ورقم الصفحة أو نطاق الأسطر. إذا غُيّر عنوان الخدمة، يجب على المالك التحقق من الوجهة وممارساتها. تجنّب إرسال كلمات المرور أو المعلومات الحساسة.'],
      ['3. تخزين البيانات والاحتفاظ بها', 'تُحفظ محادثات كل حساب بشكل منفصل في أرشيف مشفّر على هذا الكمبيوتر، كما يحتفظ متصفح ذلك الحساب بنسخة محلية. تُحفظ الملفات المرفوعة وفهارس البحث في ملف مشفّر منفصل على خادم Karar المحلي حتى حذفها من قائمة ملفات الدراسة أو حذف الحساب المرتبط بها. لا يشمل ذلك النسخ الاحتياطية التي ينشئها المالك، ويجب حذفها بصورة منفصلة. تنتهي صلاحية ملف الجلسة بعد 30 يوماً؛ وتسجيل الخروج يلغي الجلسة. يعتمد الاحتفاظ بالبيانات المرسلة على إعداد عنوان Ollama الذي يحدده المالك.'],
      ['4. ملفات تعريف الارتباط والتخزين المحلي', 'يستخدم التطبيق ملف ارتباط جلسة Secure وHTTP-only وSameSite=Strict للمصادقة، وتنتهي صلاحيته بعد 30 يوماً. يستخدم تخزين المتصفح المحلي لنسخة المحادثات والتفضيلات. يمكن حذف النسخة المحلية من إعدادات المتصفح، وقد يؤثر حذف ملف الارتباط على تسجيل الدخول. لا يتضمن التطبيق حالياً تكاملاً للتحليلات.'],
      ['5. خياراتك وطلبات الخصوصية', 'يمكنك تصدير محادثات حسابك، وحذف محادثاتك، وتغيير كلمة مرورك من الإعدادات. تبدأ حسابات المستخدمين الجديدة دون رصيد رموز؛ ويمكن للمالك منح رموز لاستخدام الذكاء الاصطناعي. يُخصم الاستخدام الذي يبلّغ عنه Ollama من الرصيد، ولا تُقبل الطلبات إذا لم يتوفر رصيد كافٍ. يتطلب حذف الحساب تأكيد كلمة المرور ويحذف ذلك الحساب ومحادثاته من الأرشيف النشط. يجب حذف النسخ الاحتياطية التي ينشئها المالك بصورة منفصلة. حذف محادثة من Karar لا يحذف بالضرورة أي بيانات تحتفظ بها الخدمة على عنوان Ollama المهيأ.'],
      ['6. أمن البيانات', 'تُخزّن كلمات المرور كملخصات scrypt، وتُخزّن رموز الجلسات كملخصات، وتُرسل الجلسة في ملف ارتباط HTTP-only وSecure. تُشفّر ملفات الحساب والمحادثات وفهرس المستندات على هذا الكمبيوتر باستخدام AES-256-GCM. تُعامل الملفات كنص غير موثوق ولا تُنفّذ. يوجد مفتاح التشفير ومفتاح شهادة HTTPS الخاص على الخادم في ملف .env غير المتعقب. تحمي HTTPS الاتصال فقط على الأجهزة التي تثق بشهادة Karar المحلية. لا توجد وسيلة تخزين أو نقل آمنة بالكامل.'],
      ['7. خدمات الجهات الخارجية', 'تُرسل الرسائل وسياقها إلى خدمة Ollama التي يحددها المالك؛ ويعمل الإعداد الافتراضي على هذا الكمبيوتر. تُخزّن بيانات الحساب والمحادثات والملفات وفهارسها على خادم Karar المحلي في هذا الكمبيوتر ضمن ملفات مشفّرة. نموذج التضمين الافتراضي هو nomic-embed-text ويلزم تنزيله بصورة منفصلة. وضع الحساب المحلي لا يستخدم Supabase أو مزود بريد إلكتروني، ولا يتضمن التطبيق تكاملاً للتحليلات. يمكن للمالك رؤية أسماء الحسابات وإجماليات الاستخدام، لكن لوحة الإدارة لا تعرض محتوى محادثات المستخدمين. يجب على المالك التحقق من عنوان Ollama وممارسات تخزين البيانات قبل اعتماد السياسة.'],
      ['8. خصوصية الأطفال', 'التطبيق مخصص لدعم طلاب تقنية المعلومات، لكن الحد الأدنى للعمر المسموح به لم يُحدّد أو يُتحقق منه بعد. [على المالك تحديد الحد الأدنى للعمر ومتطلبات موافقة الوالدين وآلية التعامل مع بيانات الأطفال وفقاً للقوانين والخدمات المستخدمة.]'],
      ['9. المعالجة الدولية', 'يعتمد موقع معالجة الرسائل على خدمة Ollama وعنوانها اللذين يحددهما المالك. يعمل الإعداد الافتراضي محلياً على هذا الكمبيوتر؛ ويجب على المالك التحقق من أي إعداد بعيد قبل النشر.'],
      ['10. تغييرات سياسة الخصوصية', 'قد تُحدّث هذه السياسة عند تغيّر ميزات Karar أو مزودي الخدمات أو ممارسات الأمان أو المتطلبات القانونية. ستُحدّث خانة تاريخ آخر تعديل عند إجراء تغيير.'],
      ['11. اتصل بنا', <Fragment key="privacy-contact-ar">للاستفسارات أو الطلبات المتعلقة بالخصوصية، اتصل على <a href="tel:+96181693429">+961 81 693 429</a>. لا ترسل كلمات مرور أو معلومات حساسة ضمن الاستفسارات.</Fragment>],
    ]
    : [
      ['1. Account Information and Authentication', 'Local account mode has one owner and allows people on the local Wi-Fi to create separate member accounts. Each account has a username and salted scrypt password hash; passwords are not stored as plain text. This mode does not use Supabase, email, or email verification. Karar’s local server manages sign-in sessions. The owner can see usernames and usage statistics, but not members’ conversation content.'],
      ['2. Messages and AI-Generated Responses', 'When you submit a message, Karar’s server sends the message and conversation context to the Ollama service configured on the server. By default, Ollama runs locally on this PC and uses the llama3.2:3b model. Supported uploaded documents are read locally and indexed with the configured Ollama embedding model (nomic-embed-text by default). When selected, relevant excerpts and your question are sent to the configured local Ollama chat model; answers show the source filename and page or line range. If an endpoint is changed, the owner must verify its destination and data practices. Avoid submitting passwords or sensitive information.'],
      ['3. Data Storage and Retention', 'Each signed-in account’s conversations are stored separately in an encrypted archive on this PC, and a local copy is kept in that account’s browser. Uploaded documents and their search indexes are stored in a separate encrypted file on the Karar host until deleted in the study-document list or when the associated account is deleted. Owner-created backups are separate and must be deleted separately. Session cookies expire after 30 days; signing out revokes the session. Data retention at the configured Ollama service depends on its deployment and settings.'],
      ['4. Cookies and Local Storage', 'The app uses a Secure, HTTP-only, SameSite=Strict session cookie for authentication; it expires after 30 days. Browser local storage holds a local copy of conversations and preferences. You can remove the browser copy through browser settings; removing the session cookie may sign you out. The current app has no analytics integration.'],
      ['5. Your Choices and Privacy Requests', 'You can export your own conversations, delete your conversations, and change your password in Settings. New member accounts start with zero AI tokens; the owner can grant tokens, and usage reported by Ollama is deducted from that balance. AI requests are blocked when the remaining balance cannot cover the request. Account deletion requires password confirmation and removes that account and its conversations from the active local archive. Owner-created backups must be deleted separately. Deleting data from Karar does not necessarily delete data retained by the configured Ollama service. For privacy questions, use the phone number in the Contact section.'],
      ['6. Data Security', 'Passwords are stored as scrypt hashes, session tokens as hashes, and the session is sent in an HTTP-only, Secure cookie. The account, conversation, and document-index files on this PC are encrypted using AES-256-GCM. Uploaded documents are treated as untrusted text and are never executed. The encryption key and private HTTPS certificate are held server-side in the ignored .env file. HTTPS protects connections only on devices that trust Karar’s local certificate. No method of transmission or storage is completely secure.'],
      ['7. Third-Party Services', 'Messages and conversation context are sent to the Ollama service configured by the owner; the default setup runs it on this PC. Account, conversation, uploaded-document, and index data are stored in encrypted files on the Karar server running on this PC. The default embedding model is nomic-embed-text and must be downloaded separately. Local account mode does not use Supabase or an email provider, and the app currently has no analytics integration. The owner can see usernames and usage totals, but the admin dashboard does not expose member chat content. The owner must verify the configured Ollama endpoint and its data practices before approving this policy.'],
      ['8. Children’s Privacy', 'Karar is intended to support IT students, but the minimum permitted age has not yet been established or verified. [Owner: confirm the minimum age, parental-consent requirements, and process for children’s data under applicable law and provider requirements.]'],
      ['9. International Data Processing', 'Processing location depends on the Ollama service configured by the owner. The default is a local service on this PC; the owner should verify any remote Ollama deployment before publication.'],
      ['10. Changes to This Privacy Policy', 'This policy may be updated when Karar features, providers, security practices, or legal requirements change. The last-updated date should be revised whenever the policy changes.'],
      ['11. Contact Us', <Fragment key="privacy-contact-en">For questions or requests about this Privacy Policy, call <a href="tel:+96181693429">+961 81 693 429</a>. Do not include passwords or other sensitive information in privacy-related inquiries.</Fragment>],
    ];
  const displayedSections = localAccount ? localSections : sections;
  const updatedLabel = language === 'ar' ? 'آخر تحديث: 10/10/2026' : 'Last Updated: 10/10/2026';
  const intro = language === 'ar'
    ? 'تشرح سياسة الخصوصية هذه كيفية جمع قرار للمعلومات ومعالجتها وتخزينها وحمايتها. هذه مسودة بانتظار مراجعة مالك التطبيق؛ يجب التحقق من ممارسات مزودي الخدمة والعمر الأدنى قبل النشر.'
    : 'This Privacy Policy explains how Karar collects, processes, stores, and protects information. This is a draft pending owner review; provider practices and the minimum age must be verified before publication.';
  return <><span className="draft-badge"><span />{c.draft}</span><h1>{c.policyTitle}</h1><p className="page-subtitle">{updatedLabel}</p><div className="policy-intro">{localAccount ? intro : c.pIntro}</div><div className="policy-sections">{displayedSections.map(([title, body]) => <section className="policy-section" key={title}><h2>{title}</h2><p>{body}</p>{typeof body === 'string' && (body.includes('[Owner:') || body.includes('[على المالك')) ? <span className="owner-placeholder">{c.pending}</span> : null}</section>)}</div></>;
}

function SettingsPage({ c, user, localAccount, onDeleteAccount, onSignOut, onProfileUpdated }: { c: Copy; user: AuthUser | null; localAccount: boolean; onDeleteAccount: () => void; onSignOut: () => void; onProfileUpdated: (user: AuthUser) => void }) {
  const language = useAppStore((state) => state.language);
  const setLanguage = useAppStore((state) => state.setLanguage);
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const history = useAppStore((state) => state.saveHistory);
  const setSaveHistory = useAppStore((state) => state.setSaveHistory);
  const conversations = useAppStore((state) => state.conversations);
  const clearConversations = useAppStore((state) => state.clearConversations);
  const tokenBalance = useAppStore((state) => state.tokenBalance);
  const [name, setName] = useState(user?.user_metadata?.display_name ?? '');
  const [status, setStatus] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const download = () => {
    const exportData = {
      exportedAt: new Date().toISOString(),
      account: user ? {
        username: user.username ?? null,
        email: user.email ?? null,
        displayName: user.user_metadata?.display_name ?? null,
        emailVerified: Boolean(user.email_confirmed_at),
        createdAt: user.created_at ?? null,
      } : null,
      conversations,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `karar-conversations-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const updateProfile = async () => {
    setBusy(true); setStatus('');
    try { const { data } = await axios.patch('/api/auth/profile', { displayName: name }, { headers: { 'X-Requested-With': 'XMLHttpRequest' } }); onProfileUpdated(data.user); setStatus(c.dataSaved); }
    catch { setStatus(language === 'ar' ? 'تعذّر حفظ التغييرات.' : 'Unable to save changes right now.'); }
    finally { setBusy(false); }
  };
  const changePassword = async () => {
    if (password.length < (localAccount ? 12 : 10)) { setStatus(localAccount ? (language === 'ar' ? 'استخدم ١٢ حرفاً على الأقل.' : 'Use at least 12 characters.') : c.pwRule); return; }
    if (localAccount && !currentPassword) { setStatus(language === 'ar' ? 'أدخل كلمة المرور الحالية أولاً.' : 'Enter your current password first.'); return; }
    setBusy(true);
    try {
      await axios.post('/api/auth/password', { currentPassword, password }, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      setStatus(c.dataSaved); setPassword(''); setCurrentPassword('');
    }
    catch { setStatus(language === 'ar' ? 'تعذّر تحديث كلمة المرور.' : 'Unable to update the password right now.'); }
    finally { setBusy(false); }
  };
  const signOutOthers = async () => {
    try { await axios.post('/api/auth/signout-others', {}, { headers: { 'X-Requested-With': 'XMLHttpRequest' } }); setStatus(c.dataSaved); }
    catch { setStatus(language === 'ar' ? 'تعذّر تسجيل الخروج من الجلسات الأخرى.' : 'Could not sign out other sessions.'); }
  };
  return <>
    <h1>{c.settings}</h1><p className="page-subtitle">{language === 'ar' ? 'اجعل قرار مناسباً لك.' : 'Make your study space your own.'}</p>
    {status && <div className="form-success settings-status"><CheckCircle2 size={16} />{status}</div>}
    <section className="settings-section"><div className="section-heading"><UserRound size={19} /><div><h2>{c.profile}</h2><p>{language === 'ar' ? 'إدارة تفاصيل حسابك.' : 'Manage your account details.'}</p></div></div>
      {user ? <>
        <Field label={c.displayName} value={name} onChange={setName} />
        {localAccount
          ? <div className="settings-meta"><span>{language === 'ar' ? 'اسم المستخدم' : 'Username'}</span><span>{user.username}</span></div>
          : <><div className="settings-meta"><span>{c.emailAddress}</span><span>{user.email}</span></div><div className="settings-meta"><span>{language === 'ar' ? 'حالة البريد' : 'Email status'}</span><span className="verification-pill">{user.email_confirmed_at ? c.verified : c.unverified}</span></div></>}
        {localAccount && <div className="settings-meta"><span>{language === 'ar' ? 'رموز الذكاء الاصطناعي المتبقية' : 'AI tokens remaining'}</span><span>{user.role === 'owner' ? (language === 'ar' ? 'غير محدود' : 'Unlimited') : tokenBalance ?? user.tokenBalance ?? 0}</span></div>}
        <button className="secondary-button" onClick={() => void updateProfile()} disabled={busy}>{c.save}</button>
        <button className="text-danger" onClick={onSignOut}><LogOut size={15} />{c.signOut}</button>
      </> : <p className="settings-muted">{language === 'ar' ? 'الملف الشخصي متاح بعد تفعيل تسجيل الدخول.' : 'A profile is available once account sign-in is configured.'}</p>}
    </section>
    <section className="settings-section"><div className="section-heading"><Sun size={19} /><div><h2>{c.appearance}</h2><p>{language === 'ar' ? 'اختيار المظهر المفضل.' : 'Choose a comfortable look.'}</p></div></div>
      <div className="segmented-control">{(['light', 'dark', 'system'] as const).map((choice) => <button key={choice} className={theme === choice ? 'segment-active' : ''} onClick={() => setTheme(choice)}>{choice === 'light' ? c.light : choice === 'dark' ? c.dark : c.system}</button>)}</div>
      <div className="settings-meta"><span><Languages size={15} />{c.language}</span><select aria-label={c.language} value={language} onChange={(event) => setLanguage(event.target.value as 'en' | 'ar')}><option value="en">English</option><option value="ar">العربية</option></select></div>
    </section>
    <section className="settings-section"><div className="section-heading"><Shield size={19} /><div><h2>{c.privacyHeading}</h2><p>{language === 'ar' ? 'تحكّم في سجلّك وبياناتك.' : 'Your history stays on your devices and this PC.'}</p></div></div>
      <div className="settings-toggle-row"><div><strong>{c.history}</strong><p>{localAccount ? (language === 'ar' ? 'تُحفظ نسخة مشفرة على هذا الكمبيوتر وتتم مزامنتها مع الأجهزة التي تسجل الدخول، إضافة إلى التخزين المحلي.' : 'Chats are encrypted on this PC and synced to devices that sign in, with a local browser copy.') : c.historyDesc}</p></div><button role="switch" aria-checked={history} className={`toggle-switch ${history ? 'toggle-on' : ''}`} onClick={() => setSaveHistory(!history)}><span /></button></div>
      <button className="secondary-button" onClick={download} disabled={!conversations.length && !user}><Download size={15} />{user ? (language === 'ar' ? 'تصدير بيانات الحساب' : 'Export account data') : c.export}</button>
      <button className="text-danger" onClick={() => { if (window.confirm(language === 'ar' ? 'حذف جميع المحادثات؟' : localAccount ? 'Delete all saved conversations from this PC and your browser copies?' : 'Delete all saved conversations from this browser?')) clearConversations(); }}><Trash2 size={15} />{c.clear}</button><p className="settings-footnote">{localAccount ? (language === 'ar' ? 'سيؤدي ذلك إلى حذف المحادثات من هذا الكمبيوتر والمتصفحات المتزامنة.' : 'This deletes the saved archive on this PC and its synced browser copies.') : c.clearDesc}</p>
      {user && <><button className="text-danger" onClick={() => void onDeleteAccount()}><Trash2 size={15} />{c.deleteAccount}</button><p className="settings-footnote">{c.deleteAccountDesc}</p></>}
    </section>
    {user && <section className="settings-section"><div className="section-heading"><LockKeyhole size={19} /><div><h2>{c.security}</h2><p>{language === 'ar' ? 'تحديث كلمة المرور وإدارة الجلسات.' : 'Keep your account secure.'}</p></div></div>
      {localAccount && <Field label={language === 'ar' ? 'كلمة المرور الحالية' : 'Current password'} type="password" autoComplete="current-password" value={currentPassword} onChange={setCurrentPassword} />}
      <Field label={localAccount ? (language === 'ar' ? 'كلمة المرور الجديدة' : 'New password') : c.changePassword} type="password" autoComplete="new-password" value={password} onChange={setPassword} />
      <button className="secondary-button" onClick={() => void changePassword()} disabled={busy}>{c.changePassword}</button>
      <button className="secondary-button" onClick={() => void signOutOthers()}>{c.otherSessions}</button>
    </section>}
    <section className="settings-section"><div className="section-heading"><Mail size={19} /><div><h2>{c.notifications}</h2><p>{c.notificationDesc}</p></div></div>
      <div className="settings-toggle-row"><div><strong>{language === 'ar' ? 'تذكيرات التعلّم' : 'Study reminders'}</strong><p>{c.notificationDesc}</p></div><button role="switch" aria-checked={false} aria-label={language === 'ar' ? 'تذكيرات التعلم غير متاحة' : 'Study reminders unavailable'} disabled className="toggle-switch"><span /></button></div>
    </section>
  </>;
}

type AdminUser = AuthUser & { username: string; role: 'owner' | 'member'; tokenBalance: number | null; tokensUsed: number; tokensGranted: number; reservedTokens: number; conversationCount: number; messageCount: number };

function AdminPage({ language }: { language: 'en' | 'ar' }) {
  const [summary, setSummary] = useState<{ username: string; userCount: number; conversationCount: number; messageCount: number; tokensUsed: number; storage: string; lastUpdatedAt: string | null } | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [grantAmounts, setGrantAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const clearConversations = useAppStore((state) => state.clearConversations);

  const refresh = async () => {
    const [summaryResponse, usersResponse] = await Promise.all([
      axios.get('/api/admin/summary'),
      axios.get<{ users: AdminUser[] }>('/api/admin/users'),
    ]);
    setSummary(summaryResponse.data);
    setUsers(usersResponse.data.users);
  };

  useEffect(() => {
    void refresh().catch(() => setError(language === 'ar' ? 'تعذّر تحميل بيانات لوحة الإدارة.' : 'Could not load the admin panel. Check the connection.'));
  }, [language]);

  const exportData = async () => {
    setBusy(true); setError(''); setStatus('');
    try {
      const { data } = await axios.get('/api/conversations');
      const archive = {
        exportedAt: new Date().toISOString(),
        account: summary?.username ?? null,
        conversations: data.conversations,
      };
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' }));
      link.download = `karar-local-archive-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      setStatus(language === 'ar' ? 'تم تصدير نسخة المحادثات.' : 'The conversation archive was exported.');
    } catch {
      setError(language === 'ar' ? 'تعذّر تصدير البيانات.' : 'Could not export the local archive.');
    } finally { setBusy(false); }
  };

  const deleteAll = async () => {
    if (!window.confirm(language === 'ar' ? 'حذف كل المحادثات المحفوظة نهائياً؟' : 'Permanently delete every conversation saved on this PC?')) return;
    setBusy(true); setError(''); setStatus('');
    try {
      await axios.delete('/api/admin/conversations', { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      clearConversations();
      await refresh();
      setStatus(language === 'ar' ? 'تم حذف المحادثات المحفوظة.' : 'Saved conversations were deleted.');
    } catch {
      setError(language === 'ar' ? 'تعذّر حذف المحادثات من الكمبيوتر.' : 'Could not delete the saved conversations from this PC.');
    } finally { setBusy(false); }
  };

  const grantTokens = async (user: AdminUser) => {
    const tokens = Number(grantAmounts[user.id]);
    if (!Number.isSafeInteger(tokens) || tokens < 1 || tokens > 1_000_000) {
      setError(language === 'ar' ? 'أدخل عدداً صحيحاً من 1 إلى 1,000,000.' : 'Enter a whole number from 1 to 1,000,000.');
      return;
    }
    setBusy(true); setError(''); setStatus('');
    try {
      await axios.post(`/api/admin/users/${encodeURIComponent(user.id)}/tokens`, { tokens }, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      setGrantAmounts((current) => ({ ...current, [user.id]: '' }));
      await refresh();
      setStatus(language === 'ar' ? `تمت إضافة ${tokens} رمزاً إلى ${user.username}.` : `Granted ${tokens} tokens to ${user.username}.`);
    } catch (cause) {
      const message = axios.isAxiosError<{ error?: string }>(cause) ? cause.response?.data?.error : undefined;
      setError(message || (language === 'ar' ? 'تعذّر إضافة الرموز.' : 'Could not grant tokens.'));
    } finally { setBusy(false); }
  };

  const deleteUser = async (user: AdminUser) => {
    if (!window.confirm(language === 'ar' ? `حذف حساب ${user.username} ومحادثاته نهائياً؟` : `Permanently delete ${user.username}'s account and conversations?`)) return;
    setBusy(true); setError(''); setStatus('');
    try {
      await axios.delete(`/api/admin/users/${encodeURIComponent(user.id)}`, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      await refresh();
      setStatus(language === 'ar' ? `تم حذف حساب ${user.username}.` : `Deleted ${user.username}'s account.`);
    } catch (cause) {
      const message = axios.isAxiosError<{ error?: string }>(cause) ? cause.response?.data?.error : undefined;
      setError(message || (language === 'ar' ? 'تعذّر حذف الحساب.' : 'Could not delete that account.'));
    } finally { setBusy(false); }
  };

  return <>
    <h1>{language === 'ar' ? 'لوحة الإدارة المحلية' : 'Local admin panel'}</h1>
    <p className="page-subtitle">{language === 'ar' ? 'إدارة المستخدمين والرموز. محتوى محادثات المستخدمين خاص ولا يظهر هنا.' : 'Manage accounts and token balances. Users’ conversation content remains private and is not shown here.'}</p>
    {error && <div className="form-error" role="alert">{error}</div>}
    {status && <div className="form-success settings-status" role="status"><CheckCircle2 size={16} />{status}</div>}
    <section className="settings-section">
      <div className="section-heading"><Shield size={19} /><div><h2>{language === 'ar' ? 'حساب المالك' : 'Owner dashboard'}</h2><p>{language === 'ar' ? 'تسجيل المستخدمين متاح عبر شبكة Wi-Fi المحلية.' : 'People can create accounts from the local Wi-Fi sign-up page.'}</p></div></div>
      <div className="settings-meta"><span>{language === 'ar' ? 'اسم المستخدم' : 'Username'}</span><span>{summary?.username ?? '—'}</span></div>
      <div className="settings-meta"><span>{language === 'ar' ? 'المستخدمون' : 'Accounts'}</span><span>{summary?.userCount ?? '—'}</span></div>
      <div className="settings-meta"><span>{language === 'ar' ? 'مكان التخزين' : 'Storage location'}</span><span>{language === 'ar' ? 'هذا الكمبيوتر' : 'This PC (encrypted local file)'}</span></div>
      <div className="settings-meta"><span>{language === 'ar' ? 'عدد المحادثات' : 'Saved conversations'}</span><span>{summary?.conversationCount ?? '—'}</span></div>
      <div className="settings-meta"><span>{language === 'ar' ? 'عدد الرسائل' : 'Saved messages'}</span><span>{summary?.messageCount ?? '—'}</span></div>
      <div className="settings-meta"><span>{language === 'ar' ? 'الرموز المستخدمة' : 'Total AI tokens used'}</span><span>{summary?.tokensUsed ?? '—'}</span></div>
      <div className="settings-meta"><span>{language === 'ar' ? 'آخر حفظ' : 'Last saved'}</span><span>{summary?.lastUpdatedAt ? new Date(summary.lastUpdatedAt).toLocaleString() : '—'}</span></div>
      <p className="settings-footnote">{language === 'ar' ? 'لا تحفظ نسخة احتياطية من ملف البيانات المشفر دون مفتاح التشفير الموجود في .env.' : 'The encrypted archive is in server/data. Back it up together with the private .env encryption key; losing that key makes the archive unreadable.'}</p>
      <button className="secondary-button" onClick={() => void exportData()} disabled={busy}><Download size={15} />{language === 'ar' ? 'تصدير المحادثات' : 'Export conversations'}</button>
      <button className="text-danger" onClick={() => void deleteAll()} disabled={busy}><Trash2 size={15} />{language === 'ar' ? 'حذف كل المحادثات' : 'Delete all saved conversations'}</button>
    </section>
    <section className="settings-section">
      <div className="section-heading"><UserRound size={19} /><div><h2>{language === 'ar' ? 'حسابات المستخدمين والرموز' : 'Users and token balances'}</h2><p>{language === 'ar' ? 'يحصل الحساب الجديد على صفر رمز حتى تمنحه رصيداً.' : 'New accounts start with zero tokens; grant a balance to enable AI replies.'}</p></div></div>
      {users.map((user) => <article className="admin-user-card" key={user.id}>
        <div className="settings-meta"><span>{language === 'ar' ? 'المستخدم' : 'Account'}</span><span>{user.username}{user.role === 'owner' ? (language === 'ar' ? ' (المالك)' : ' (owner)') : ''}</span></div>
        <div className="settings-meta"><span>{language === 'ar' ? 'المحادثات / الرسائل' : 'Chats / messages'}</span><span>{user.conversationCount} / {user.messageCount}</span></div>
        <div className="settings-meta"><span>{language === 'ar' ? 'الرموز المتبقية / المستخدمة' : 'Tokens left / used'}</span><span>{user.role === 'owner' ? (language === 'ar' ? 'غير محدود' : 'Unlimited') : `${user.tokenBalance ?? 0} / ${user.tokensUsed}`}</span></div>
        {user.role === 'member' && <>
          <div className="admin-grant-row">
            <input aria-label={`Tokens to grant to ${user.username}`} type="number" min="1" max="1000000" step="1" value={grantAmounts[user.id] ?? ''} onChange={(event) => setGrantAmounts((current) => ({ ...current, [user.id]: event.target.value }))} placeholder={language === 'ar' ? 'عدد الرموز' : 'Tokens to add'} />
            <button className="secondary-button" onClick={() => void grantTokens(user)} disabled={busy}>{language === 'ar' ? 'إضافة رموز' : 'Grant tokens'}</button>
            <button className="text-danger" onClick={() => void deleteUser(user)} disabled={busy}><Trash2 size={14} />{language === 'ar' ? 'حذف المستخدم' : 'Delete user'}</button>
          </div>
        </>}
      </article>)}
    </section>
  </>;
}

export default function App() {
  const localAuthMode = import.meta.env.VITE_KARAR_LOCAL_AUTH === 'true';
  const [page, setPage] = useState<Page>(() => {
    const route = window.location.hash.replace(/^#\/?/, '').split('?')[0];
    return (['settings', 'admin', 'about', 'privacy', 'terms', 'help', 'signin', 'signup', 'forgot', 'reset', 'setup'].includes(route) ? route : 'chat') as Page;
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authConfigured, setAuthConfigured] = useState(localAuthMode);
  const [authMode, setAuthMode] = useState<'local' | 'supabase' | 'none'>(localAuthMode ? 'local' : 'none');
  const [authSetupRequired, setAuthSetupRequired] = useState(false);
  const [authNotice, setAuthNotice] = useState('');
  const theme = useAppStore((state) => state.theme);
  const language = useAppStore((state) => state.language);
  const setLanguage = useAppStore((state) => state.setLanguage);
  const clearConversations = useAppStore((state) => state.clearConversations);
  const tokenBalance = useAppStore((state) => state.tokenBalance);
  const t = translations[language];
  const c = strings[language];

  const navigate = (target: Page) => {
    setPage(target);
    window.location.hash = `/${target}`;
    useAppStore.getState().clearError();
  };

  useEffect(() => {
    const onHashChange = () => {
      const route = window.location.hash.replace(/^#\/?/, '').split('?')[0];
      setPage((['settings', 'admin', 'about', 'privacy', 'terms', 'help', 'signin', 'signup', 'forgot', 'reset', 'setup'].includes(route) ? route : 'chat') as Page);
    };
    window.addEventListener('hashchange', onHashChange);
    let alive = true;
    const recoverFromEmailLink = async () => {
      const hash = new URLSearchParams(window.location.hash.split('?')[1] ?? window.location.hash.slice(1));
      const accessToken = hash.get('access_token') ?? new URLSearchParams(window.location.hash.slice(1)).get('access_token');
      const refreshToken = hash.get('refresh_token') ?? new URLSearchParams(window.location.hash.slice(1)).get('refresh_token');
      const type = hash.get('type');
      if (accessToken && refreshToken) {
        try {
          const { data } = await axios.post('/api/auth/session', { accessToken, refreshToken }, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
          if (alive) {
            if (data.user) {
              useAppStore.getState().activateAccountStorage(data.user.id, data.mode === 'local' && data.user.role === 'owner');
              useAppStore.getState().setTokenBalance(data.user.tokenBalance ?? null);
            } else {
              useAppStore.getState().activateAccountStorage(null, false, !data.configured);
              useAppStore.getState().setTokenBalance(null);
            }
            setUser(data.user);
            if (type === 'recovery') setPage('reset');
            else { setAuthNotice(c.verification); setPage('signin'); }
            window.history.replaceState(null, '', `${window.location.pathname}#/` + (type === 'recovery' ? 'reset' : 'signin'));
          }
        } catch { if (alive) { setAuthNotice(language === 'ar' ? 'انتهت صلاحية الرابط أو لم يعد صالحاً.' : 'This verification link has expired or is invalid.'); setPage('signin'); } }
      }
    };
    void Promise.all([
      axios.get<AuthStatus>('/api/auth/session').then(({ data }) => {
        if (alive) {
          setAuthConfigured(data.configured);
          setAuthMode(data.mode ?? (data.configured ? 'supabase' : 'none'));
          setAuthSetupRequired(Boolean(data.setupRequired));
          if (data.user) {
            useAppStore.getState().activateAccountStorage(data.user.id, data.mode === 'local' && data.user.role === 'owner');
            useAppStore.getState().setTokenBalance(data.user.tokenBalance ?? null);
          } else {
            useAppStore.getState().activateAccountStorage(null, false, !data.configured);
            useAppStore.getState().setTokenBalance(null);
          }
          setUser(data.user);
          if (data.setupRequired) setPage('setup');
          else if (!data.user && window.location.hash.includes('/setup')) setPage('signin');
          else if (data.user && /#\/(setup|signin|signup|forgot|reset)/.test(window.location.hash)) setPage('chat');
        }
      }),
      recoverFromEmailLink(),
    ]).catch(() => {
      if (alive) {
        setAuthConfigured(localAuthMode);
        setAuthMode(localAuthMode ? 'local' : 'none');
        if (localAuthMode) setAuthNotice(language === 'ar' ? 'خدمة الحساب غير متاحة الآن. حاول مجدداً.' : 'Local account service is unavailable. Please retry.');
      }
    }).finally(() => { if (alive) setAuthReady(true); });
    return () => { alive = false; window.removeEventListener('hashchange', onHashChange); };
  }, []);

  useEffect(() => {
    const appStore = useAppStore.getState();
    if (!authReady || authMode !== 'local' || !user) {
      appStore.setAccountSyncEnabled(false);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const { data } = await axios.get<{ conversations: Conversation[] }>('/api/conversations');
        if (!alive) return;
        const merged = new Map(data.conversations.map((conversation) => [conversation.id, conversation]));
        for (const conversation of useAppStore.getState().conversations) {
          const current = merged.get(conversation.id);
          if (!current || conversation.updatedAt > current.updatedAt) merged.set(conversation.id, conversation);
        }
        const conversations = [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt);
        useAppStore.getState().setConversations(conversations);
        useAppStore.getState().setAccountSyncEnabled(true);
        const { data: saved } = await axios.put<{ conversations: Conversation[] }>('/api/conversations', { conversations }, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        if (alive) useAppStore.getState().setConversations(saved.conversations);
      } catch {
        if (alive) useAppStore.setState({ error: language === 'ar' ? 'تعذّرت مزامنة المحادثات مع هذا الكمبيوتر.' : 'Could not sync chats with this PC. Check the connection and try again.' });
      }
    })();
    return () => {
      alive = false;
      useAppStore.getState().setAccountSyncEnabled(false);
    };
  }, [authReady, authMode, user?.id]);

  useEffect(() => {
    if (!authReady || authMode !== 'local' || !user || user.role === 'owner') return;
    let alive = true;
    const refreshBalance = async () => {
      try {
        const { data } = await axios.get<{ user: AuthUser }>('/api/account/usage');
        if (alive && typeof data.user.tokenBalance === 'number') {
          useAppStore.getState().setTokenBalance(data.user.tokenBalance);
        }
      } catch (cause) {
        if (!alive) return;
        if (axios.isAxiosError(cause) && cause.response?.status === 401) {
          useAppStore.getState().setAccountSyncEnabled(false);
          useAppStore.getState().activateAccountStorage(null);
          useAppStore.getState().setTokenBalance(null);
          setUser(null);
          setAuthNotice(language === 'ar' ? 'انتهت صلاحية الجلسة أو لم يعد الحساب متاحاً. سجّل الدخول مجدداً.' : 'Your session expired or the account is no longer available. Please sign in again.');
          navigate('signin');
          return;
        }
        useAppStore.setState({ error: language === 'ar' ? 'تعذّر تحديث رصيد الرموز. تحقق من اتصالك.' : 'Could not refresh your token balance. Check your connection.' });
      }
    };
    void refreshBalance();
    const timer = window.setInterval(() => { void refreshBalance(); }, 15_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [authReady, authMode, user?.id, user?.role, language]);

  useEffect(() => {
    const root = document.documentElement;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => root.classList.toggle('dark', theme === 'dark' || (theme === 'system' && systemDark.matches));
    applyTheme();
    systemDark.addEventListener('change', applyTheme);
    return () => systemDark.removeEventListener('change', applyTheme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.title = language === 'ar' ? 'قرار — معلّم ذكي لطلاب تقنية المعلومات' : 'Karar - AI Tutor for IT Students';
  }, [language]);
  useEffect(() => {
    if (!authReady || page !== 'chat' || (authConfigured && !user)) return;
    const state = useAppStore.getState();
    if (state.currentConversationId) return;
    if (state.conversations[0]) state.setCurrentConversationId(state.conversations[0].id);
    else state.newConversation();
  }, [authReady, page, authConfigured, user]);

  const signOut = async () => {
    try {
      await axios.post('/api/auth/signout', {}, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      useAppStore.getState().setAccountSyncEnabled(false);
      useAppStore.getState().activateAccountStorage(null);
      useAppStore.getState().setTokenBalance(null);
      setUser(null);
      navigate('signin');
    } catch {
      setAuthNotice(language === 'ar' ? 'تعذّر تسجيل الخروج بأمان. حاول مجدداً.' : 'Could not sign out securely. Please try again.');
    }
  };
  const deleteAccount = async () => {
    if (!window.confirm(language === 'ar' ? 'حذف الحساب نهائياً؟ لا يمكن التراجع عن هذا الإجراء.' : 'Permanently delete your account? This can’t be undone.')) return;
    const password = window.prompt(language === 'ar' ? 'أدخل كلمة المرور الحالية لحذف الحساب.' : 'Enter your current password to delete the account.');
    if (!password) return;
    try {
      await axios.delete('/api/auth/account', { data: { password }, headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      useAppStore.getState().setAccountSyncEnabled(false);
      useAppStore.getState().removeActiveAccountStorage();
      useAppStore.getState().setTokenBalance(null);
      clearConversations(); setUser(null); setAuthSetupRequired(authMode === 'local' && user?.role === 'owner');
      window.alert(language === 'ar' ? 'تم حذف الحساب.' : 'Your account has been deleted.');
      navigate(authMode === 'local' ? (user?.role === 'owner' ? 'setup' : 'signin') : 'setup');
    } catch { window.alert(language === 'ar' ? 'تعذّر حذف الحساب. يرجى المحاولة لاحقاً.' : 'We could not delete your account. Please try again later.'); }
  };

  if (!authReady) return <div className="app-loading" role="status"><span className="brand-mark"><BookOpen size={20} /></span></div>;
  const requiresAuthentication = authConfigured && !user && ['chat', 'settings', 'admin'].includes(page);
  if (!user && (requiresAuthentication || ['signin', 'signup', 'forgot', 'reset', 'setup'].includes(page))) {
    const authenticationPage: Page = authMode === 'local'
      ? authSetupRequired ? 'setup' : page === 'signup' ? 'signup' : 'signin'
      : requiresAuthentication ? 'signin' : page;
    return <AuthPage
      page={authenticationPage}
      copy={c}
      configured={authConfigured}
      localMode={authMode === 'local'}
      externalNotice={authNotice}
      onNavigate={navigate}
      onSignedIn={(nextUser) => {
        useAppStore.getState().activateAccountStorage(nextUser.id, nextUser.role === 'owner');
        useAppStore.getState().setTokenBalance(nextUser.tokenBalance ?? null);
        setUser(nextUser);
        setAuthSetupRequired(false);
        setAuthNotice('');
        navigate('chat');
      }}
      onGuest={() => navigate('chat')}
    />;
  }

  const isChat = page === 'chat';
  const pageTitle = page === 'settings' ? t.settings : page === 'admin' ? (language === 'ar' ? 'لوحة الإدارة' : 'Admin panel') : page === 'about' ? t.about : page === 'privacy' ? t.privacy : page === 'terms' ? c.termsTitle : page === 'help' ? t.help : 'Karar';
  return <div className={`app-shell ${!isChat ? 'document-app' : ''}`}>
    <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} onNavigate={(target) => navigate(target)} page={page} isAdmin={user?.role === 'owner' && authMode === 'local'} />
    <section className="main-column">
      <header className="topbar">
        <button className="icon-button mobile-menu-button" onClick={() => setMobileOpen(true)} aria-label={c.close}><Menu size={20} /></button>
        <button className="topbar-brand" onClick={() => navigate('chat')}><span className="brand-mark"><BookOpen size={16} /></span><span>karar<span className="brand-dot">.</span></span></button>
        <div className="topbar-title">{isChat && page === 'chat' ? <span className="chat-mode">{language === 'ar' ? 'رفيق الدراسة' : 'Study space'}<ChevronDown size={14} /></span> : <span>{pageTitle}</span>}</div>
        <div className="topbar-actions">
          <button className={`icon-button ${language === 'ar' ? 'lang-selected' : ''}`} aria-label="Switch language" title={t.language} onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}><span>{language === 'en' ? 'ع' : 'EN'}</span></button>
          <button className="icon-button topbar-new-chat" onClick={() => { useAppStore.getState().newConversation(); navigate('chat'); }} aria-label={t.newChat}><Sparkles size={17} /></button>
          {user && <button className="user-chip" onClick={() => navigate('settings')}><span>{(user.user_metadata?.display_name ?? user.email ?? 'K').slice(0, 1).toUpperCase()}</span><span className="user-chip-name">{user.user_metadata?.display_name || user.email?.split('@')[0]}</span><ChevronDown size={13} /></button>}
        </div>
      </header>
      {authNotice && <div className="inline-notice"><CheckCircle2 size={16} />{authNotice}<button onClick={() => setAuthNotice('')} aria-label="Dismiss"><X size={14} /></button></div>}
      {isChat ? <>
        <div className="chat-content"><ChatArea /></div>
        <MessageComposer tokenBalance={tokenBalance} isOwner={user?.role === 'owner'} canUseDocuments={Boolean(user)} />
        <footer className="content-footer"><span>{language === 'ar' ? 'لأصحاب الفضول' : 'Built for curious minds'}</span><span><a href="#/privacy" onClick={() => navigate('privacy')}>{t.privacy}</a><span className="footer-dot">·</span><a href="#/about" onClick={() => navigate('about')}>{t.about}</a></span></footer>
      </> : <main className={`page-content ${page === 'privacy' ? 'policy-page' : ''}`}>
        <button className="back-to-chat" onClick={() => navigate('chat')}><ArrowLeft size={15} />{t.back}</button>
        {page === 'settings' && <SettingsPage c={c} user={user} localAccount={authMode === 'local'} onDeleteAccount={deleteAccount} onSignOut={() => void signOut()} onProfileUpdated={setUser} />}
        {page === 'admin' && authMode === 'local' && user?.role === 'owner' && <AdminPage language={language} />}
        {page === 'admin' && authMode === 'local' && user?.role !== 'owner' && <section className="settings-section" role="alert"><h1>{language === 'ar' ? 'غير مصرح' : 'Access restricted'}</h1><p>{language === 'ar' ? 'لوحة الإدارة متاحة لمالك قرار فقط.' : 'Only the Karar owner can access the admin panel.'}</p><button className="secondary-button" onClick={() => navigate('chat')}>{language === 'ar' ? 'العودة إلى المحادثة' : 'Back to chat'}</button></section>}
        {page === 'about' && <div className="about-content"><span className="about-icon"><BookOpen size={24} /></span><p className="eyebrow">{language === 'ar' ? 'عن قرار' : 'MEET YOUR STUDY COMPANION'}</p><h1>{c.aboutTitle}</h1><p className="about-body">{c.aboutBody}</p><section className="contact-card"><div className="contact-icon"><Mail size={18} /></div><div><span>{c.contact}</span><a href="tel:+96181693429">+961 81693429</a></div><a className="call-link" href="tel:+96181693429" aria-label="Call Karar at +961 81693429">{language === 'ar' ? 'اتصل' : 'Call'}<ArrowRight size={14} /></a></section><p className="about-footnote">{c.aboutContact} <a href="tel:+96181693429">+961 81693429</a>.</p></div>}
        {page === 'privacy' && <Policy c={c} localAccount={authMode === 'local'} language={language} />}
        {page === 'terms' && <><div className="draft-badge"><span />{c.draft}</div><h1>{c.termsTitle}</h1><p className="page-subtitle">{c.termsBody}</p><p className="terms-owner-placeholder">{c.pending}</p></>}
        {page === 'help' && <><div className="page-icon"><HelpCircle size={21} /></div><h1>{c.helpTitle}</h1><p className="page-subtitle">{c.helpBody}</p><ul className="help-list">{c.helpList.map((item) => <li key={item}>{item}</li>)}</ul><a className="help-contact-link" href="tel:+96181693429">{c.contact}: +961 81693429</a></>}
      </main>}
    </section>
  </div>;
}
