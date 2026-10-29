import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Icon from '../components/Icons';
import { useFeedback } from '../components/Feedback';

interface Branch {
  id: number;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  status: string;
  employees?: { id: number }[];
}

export default function Branches() {
  const { confirm, showToast } = useFeedback();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [employeeCounts, setEmployeeCounts] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ open: boolean; data: Branch | null }>({ open: false, data: null });
  const [search, setSearch] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [branchesRes, employeesRes] = await Promise.all([api.get('/branches'), api.get('/employees')]);
      setBranches(branchesRes.data);
      const counts: Record<number, number> = {};
      for (const emp of employeesRes.data) {
        const id = emp.branch?.id;
        if (id) counts[id] = (counts[id] || 0) + 1;
      }
      setEmployeeCounts(counts);
    } catch (error) {
      console.error('Error loading branches', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = useMemo(
    () => branches.filter((b) => !search || b.name.includes(search) || b.code.includes(search)),
    [branches, search]
  );

  const deleteBranch = async (branch: Branch) => {
    const ok = await confirm({ message: `سيتم حذف الفرع "${branch.name}" نهائياً. هل تريد المتابعة؟` });
    if (!ok) return;
    try {
      await api.delete(`/branches/${branch.id}`);
      showToast('تم حذف الفرع بنجاح', 'success');
      loadData();
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'تعذر حذف الفرع', 'error');
    }
  };

  return (
    <div className="module-page">
      <div className="page-toolbar">
        <div>
          <span className="section-kicker">إدارة الشركة</span>
          <h1>الفروع</h1>
          <p>إدارة فروع الشركة والموقع الجغرافي وبيانات التواصل الخاصة بكل فرع.</p>
        </div>
        <button className="primary-button" onClick={() => setForm({ open: true, data: null })}>
          <Icon name="plus" size={18} /> إضافة فرع جديد
        </button>
      </div>

      <div className="summary-tiles">
        <div className="summary-tile"><span>إجمالي الفروع</span><strong>{branches.length}</strong></div>
        <div className="summary-tile"><span>إجمالي العاملين</span><strong>{Object.values(employeeCounts).reduce((a, b) => a + b, 0)}</strong></div>
        <div className="summary-tile"><span>الفروع النشطة</span><strong>{branches.filter((b) => b.status === 'active').length}</strong></div>
      </div>

      <section className="panel-card">
        <div className="filters-inline">
          <input placeholder="بحث بالاسم أو الرمز..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>اسم الفرع</th>
                <th>الرمز</th>
                <th>العنوان</th>
                <th>الجوال</th>
                <th>عدد العاملين</th>
                <th>الحالة</th>
                <th className="actions-head">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7}><div className="empty-state">جاري التحميل...</div></td></tr>
              ) : filtered.length > 0 ? filtered.map((branch) => (
                <tr key={branch.id}>
                  <td><strong>{branch.name}</strong></td>
                  <td><span className="code-pill">{branch.code}</span></td>
                  <td>{branch.address || '—'}</td>
                  <td>{branch.phone || '—'}</td>
                  <td>{employeeCounts[branch.id] || 0} عامل</td>
                  <td><span className={`status-badge ${branch.status === 'active' ? 'green' : 'gray'}`}><span className="status-dot" />{branch.status === 'active' ? 'نشط' : 'غير نشط'}</span></td>
                  <td>
                    <div className="row-actions">
                      <button className="action-btn blue" title="تعديل" onClick={() => setForm({ open: true, data: branch })}><Icon name="edit" size={16} /></button>
                      <button className="action-btn danger" title="حذف" onClick={() => deleteBranch(branch)}><Icon name="trash" size={16} /></button>
                    </div>
                  </td>
                </tr>
              )) : <tr><td colSpan={7}><div className="empty-state">لا توجد فروع مطابقة</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {form.open && <BranchFormModal initialData={form.data} onClose={() => setForm({ open: false, data: null })} onSaved={loadData} />}
    </div>
  );
}

function BranchFormModal({ initialData, onClose, onSaved }: { initialData: Branch | null; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useFeedback();
  const isEdit = Boolean(initialData);
  const [form, setForm] = useState({
    name: initialData?.name || '',
    code: initialData?.code || '',
    address: initialData?.address || '',
    phone: initialData?.phone || '',
    status: initialData?.status || 'active',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (isEdit && initialData) await api.put(`/branches/${initialData.id}`, form);
      else await api.post('/branches', form);
      onSaved();
      showToast(isEdit ? 'تم حفظ تعديلات الفرع بنجاح' : 'تم إضافة الفرع بنجاح', 'success');
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'تعذر حفظ بيانات الفرع.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay">
      <button className="overlay-dismiss" onClick={onClose} />
      <section className="modal-card">
        <div className="drawer-head">
          <div><h2>{isEdit ? 'تعديل بيانات الفرع' : 'إضافة فرع جديد'}</h2></div>
          <button className="icon-button" onClick={onClose}><Icon name="close" size={20} /></button>
        </div>
        <form onSubmit={submit} className="form-grid">
          <label className="form-field"><span>اسم الفرع</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label className="form-field"><span>رمز الفرع</span><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required /></label>
          <label className="form-field"><span>العنوان</span><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
          <label className="form-field"><span>رقم الجوال</span><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          {isEdit && (
            <label className="form-field">
              <span>الحالة</span>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">نشط</option>
                <option value="inactive">غير نشط</option>
              </select>
            </label>
          )}
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions"><button type="button" className="ghost-button" onClick={onClose}>إلغاء</button><button className="primary-button" disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ'}</button></div>
        </form>
      </section>
    </div>
  );
}
