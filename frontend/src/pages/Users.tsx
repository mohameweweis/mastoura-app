import { useEffect, useState } from 'react';
import api from '../services/api';
import Icon from '../components/Icons';
import { useFeedback } from '../components/Feedback';

interface AppUser {
  id: number;
  username: string;
  role: 'ADMIN' | 'HR' | 'EQUIPMENT_MANAGER' | 'VIEWER';
  createdAt: string;
}

const roleLabels: Record<string, string> = {
  ADMIN: 'مدير النظام',
  HR: 'موارد بشرية',
  EQUIPMENT_MANAGER: 'مدير معدات',
  VIEWER: 'مشاهدة فقط',
};

export default function Users() {
  const { confirm, showToast } = useFeedback();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ open: boolean; data: AppUser | null }>({ open: false, data: null });

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/users');
      setUsers(res.data);
    } catch (error) {
      console.error('Error loading users', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const deleteUser = async (user: AppUser) => {
    const ok = await confirm({ message: `سيتم حذف المستخدم "${user.username}" نهائياً. هل تريد المتابعة؟` });
    if (!ok) return;
    try {
      await api.delete(`/users/${user.id}`);
      showToast('تم حذف المستخدم بنجاح', 'success');
      loadData();
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'تعذر حذف المستخدم', 'error');
    }
  };

  return (
    <div className="module-page">
      <div className="page-toolbar">
        <div>
          <span className="section-kicker">الأمان والصلاحيات</span>
          <h1>المستخدمون والصلاحيات</h1>
          <p>إدارة حسابات مستخدمي النظام والأدوار الممنوحة لكل حساب.</p>
        </div>
        <button className="primary-button" onClick={() => setForm({ open: true, data: null })}>
          <Icon name="plus" size={18} /> إضافة مستخدم جديد
        </button>
      </div>

      <section className="panel-card">
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>اسم المستخدم</th><th>الدور</th><th>تاريخ الإنشاء</th><th className="actions-head">الإجراءات</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4}><div className="empty-state">جاري التحميل...</div></td></tr>
              ) : users.length > 0 ? users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="person-cell">
                      <div className="person-mini-avatar">{user.username.charAt(0).toUpperCase()}</div>
                      <strong>{user.username}</strong>
                    </div>
                  </td>
                  <td><span className="status-badge green"><span className="status-dot" />{roleLabels[user.role] || user.role}</span></td>
                  <td>{new Date(user.createdAt).toLocaleDateString('ar-SA')}</td>
                  <td>
                    <div className="row-actions">
                      <button className="action-btn blue" title="تعديل" onClick={() => setForm({ open: true, data: user })}><Icon name="edit" size={16} /></button>
                      <button className="action-btn danger" title="حذف" onClick={() => deleteUser(user)}><Icon name="trash" size={16} /></button>
                    </div>
                  </td>
                </tr>
              )) : <tr><td colSpan={4}><div className="empty-state">لا يوجد مستخدمون مسجلون بعد</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {form.open && <UserFormModal initialData={form.data} onClose={() => setForm({ open: false, data: null })} onSaved={loadData} />}
    </div>
  );
}

function UserFormModal({ initialData, onClose, onSaved }: { initialData: AppUser | null; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useFeedback();
  const isEdit = Boolean(initialData);
  const [form, setForm] = useState({ username: initialData?.username || '', password: '', role: initialData?.role || 'VIEWER' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEdit && !form.password) { setError('كلمة المرور مطلوبة عند إنشاء مستخدم جديد'); return; }
    setSaving(true);
    setError('');
    try {
      if (isEdit && initialData) await api.put(`/users/${initialData.id}`, form);
      else await api.post('/users', form);
      onSaved();
      showToast(isEdit ? 'تم حفظ تعديلات المستخدم بنجاح' : 'تم إضافة المستخدم بنجاح', 'success');
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'تعذر حفظ بيانات المستخدم.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay">
      <button className="overlay-dismiss" onClick={onClose} />
      <section className="modal-card">
        <div className="drawer-head">
          <div><h2>{isEdit ? 'تعديل المستخدم' : 'إضافة مستخدم جديد'}</h2></div>
          <button className="icon-button" onClick={onClose}><Icon name="close" size={20} /></button>
        </div>
        <form onSubmit={submit} className="form-grid single">
          <label className="form-field"><span>اسم المستخدم</span><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /></label>
          <label className="form-field">
            <span>كلمة المرور {isEdit && '(اتركها فارغة للإبقاء على الحالية)'}</span>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={isEdit ? '••••••••' : ''} />
          </label>
          <label className="form-field">
            <span>الدور</span>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as AppUser['role'] })}>
              <option value="ADMIN">مدير النظام</option>
              <option value="HR">موارد بشرية</option>
              <option value="EQUIPMENT_MANAGER">مدير معدات</option>
              <option value="VIEWER">مشاهدة فقط</option>
            </select>
          </label>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions"><button type="button" className="ghost-button" onClick={onClose}>إلغاء</button><button className="primary-button" disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ'}</button></div>
        </form>
      </section>
    </div>
  );
}
