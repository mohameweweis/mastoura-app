import { useEffect, useState } from 'react';
import api from '../services/api';
import Icon from '../components/Icons';
import { useAuth } from '../components/Auth';

interface AuthConfig { allowSignup: boolean; single: { name: string; slug: string } | null }

export default function Login() {
  const { login, registerCompany } = useAuth();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [company, setCompany] = useState(localStorage.getItem('hr_company') || '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [reg, setReg] = useState({ companyName: '', slug: '', adminUsername: 'admin', adminPassword: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/auth/config').then((r) => setConfig(r.data)).catch(() => setConfig(null));
  }, []);

  const showCompanyField = !config?.single;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') await login(username.trim(), password, showCompanyField ? company.trim().toLowerCase() : config?.single?.slug);
      else await registerCompany({ ...reg, slug: reg.slug.trim().toLowerCase() });
    } catch (err: any) {
      setError(err?.response?.data?.message || 'تعذر الاتصال بالخادم، تأكد من تشغيله');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page" dir="rtl">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo"><Icon name="building" size={30} /></div>
        <h1>{mode === 'register' ? 'تسجيل شركة جديدة' : config?.single?.name || 'نظام إدارة العاملين والمعدات'}</h1>
        <p>{mode === 'register' ? 'أنشئ حساب شركتك ومدير النظام' : 'سجّل الدخول للمتابعة'}</p>

        {mode === 'login' ? (
          <>
            {showCompanyField && (
              <label className="form-field"><span>رمز الشركة</span><input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="مثال: acme" dir="ltr" required /></label>
            )}
            <label className="form-field"><span>اسم المستخدم</span><input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required /></label>
            <label className="form-field"><span>كلمة المرور</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          </>
        ) : (
          <>
            <label className="form-field"><span>اسم الشركة</span><input value={reg.companyName} onChange={(e) => setReg({ ...reg, companyName: e.target.value })} required /></label>
            <label className="form-field"><span>رمز الشركة (إنجليزي، 3-30 حرفاً)</span><input value={reg.slug} onChange={(e) => setReg({ ...reg, slug: e.target.value })} dir="ltr" pattern="[a-zA-Z0-9-]{3,30}" required /></label>
            <label className="form-field"><span>اسم مستخدم المدير</span><input value={reg.adminUsername} onChange={(e) => setReg({ ...reg, adminUsername: e.target.value })} required /></label>
            <label className="form-field"><span>كلمة المرور (6 أحرف على الأقل)</span><input type="password" value={reg.adminPassword} onChange={(e) => setReg({ ...reg, adminPassword: e.target.value })} minLength={6} required /></label>
          </>
        )}

        {error && <div className="form-error">{error}</div>}
        <button className="primary-button" disabled={busy}>{busy ? 'جارٍ المعالجة...' : mode === 'login' ? 'تسجيل الدخول' : 'إنشاء الشركة'}</button>
        {config?.allowSignup && (
          <button type="button" className="ghost-button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
            {mode === 'login' ? 'تسجيل شركة جديدة' : 'لدي حساب بالفعل'}
          </button>
        )}
      </form>
    </div>
  );
}
