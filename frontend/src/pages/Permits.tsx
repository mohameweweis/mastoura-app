import { useEffect, useMemo, useRef, useState } from 'react';
import api, { fileUrl } from '../services/api';
import Icon from '../components/Icons';
import EmployeePicker from '../components/EmployeePicker';
import { useFeedback } from '../components/Feedback';
import { useAuth } from '../components/Auth';
import { PERMIT_STATE } from './Projects';

interface ProjectLite { id: number; name: string; code: string; status?: string }
interface Permit {
  id: number; permitNumber: string; projectId: number; type: string; issuer: string | null; location: string | null;
  issueDate: string; expiryDate: string; status: string; notes: string | null; attachment: string | null;
  project: ProjectLite; state: string; workersCount: number;
}

const PERMIT_TYPES = ['أعمال كهربائية', 'أعمال حفر', 'أعمال على الساخن', 'أعمال في المرتفعات', 'دخول حيز مغلق', 'رفع ومعدات ثقيلة', 'قطع تيار / عزل', 'أخرى'];
const d10 = (v: string) => v.slice(0, 10);
const dAr = (v: string) => new Date(v).toLocaleDateString('ar-SA');
const daysLeft = (v: string) => Math.ceil((new Date(v).getTime() - Date.now()) / 86400000);

export default function Permits() {
  const { confirm, showToast } = useFeedback();
  const { canWrite } = useAuth();
  const [permits, setPermits] = useState<Permit[]>([]);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState('all');
  const [projectId, setProjectId] = useState('all');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<{ open: boolean; data: Permit | null }>({ open: false, data: null });
  const [workersFor, setWorkersFor] = useState<Permit | null>(null);

  const load = async () => {
    setLoading(true);
    try { const [a, b] = await Promise.all([api.get('/permits'), api.get('/projects')]); setPermits(a.data); setProjects(b.data); }
    catch { setPermits([]); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => permits.filter((p) => (state === 'all' || p.state === state) && (projectId === 'all' || String(p.projectId) === projectId)
    && (!search || [p.permitNumber, p.type, p.project.name, p.issuer].some((v) => (v || '').toLowerCase().includes(search.toLowerCase())))), [permits, state, projectId, search]);

  const remove = async (p: Permit) => {
    if (!(await confirm({ message: `سيتم حذف التصريح "${p.permitNumber}" نهائياً. هل تريد المتابعة؟` }))) return;
    try { await api.delete(`/permits/${p.id}`); showToast('تم حذف التصريح', 'success'); load(); }
    catch (e: any) { showToast(e?.response?.data?.message || 'تعذر الحذف', 'error'); }
  };

  const count = (s: string) => permits.filter((p) => p.state === s).length;

  return (
    <div className="module-page">
      <div className="page-toolbar">
        <div>
          <span className="section-kicker">السلامة والامتثال</span>
          <h1>تصاريح العمل</h1>
          <p>تصاريح العمل الصادرة لكل مشروع، تواريخ انتهائها، والعمال المشمولين بها مع تنبيهات الأهلية.</p>
        </div>
        {canWrite && <button className="primary-button" onClick={() => setForm({ open: true, data: null })}><Icon name="plus" size={18} /> تصريح جديد</button>}
      </div>

      <div className="summary-tiles">
        <div className="summary-tile"><span>سارية</span><strong style={{ color: '#1f8b5f' }}>{count('valid')}</strong></div>
        <div className="summary-tile"><span>تنتهي قريباً</span><strong style={{ color: '#b3740c' }}>{count('soon')}</strong></div>
        <div className="summary-tile"><span>منتهية</span><strong style={{ color: '#d3394c' }}>{count('expired')}</strong></div>
        <div className="summary-tile"><span>إجمالي التصاريح</span><strong>{permits.length}</strong></div>
      </div>

      <section className="panel-card">
        <div className="filters-inline" style={{ padding: '16px 20px 0' }}>
          <input placeholder="بحث برقم التصريح أو النوع أو المشروع..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="all">كل المشاريع</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <select value={state} onChange={(e) => setState(e.target.value)}>
            <option value="all">كل الحالات</option>{Object.entries(PERMIT_STATE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>رقم التصريح</th><th>المشروع</th><th>النوع</th><th>الجهة المصدرة</th><th>الإصدار</th><th>الانتهاء</th><th>الحالة</th><th>العمال</th><th className="actions-head">الإجراءات</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={9}><div className="empty-state">جاري التحميل...</div></td></tr>
                : filtered.length ? filtered.map((p) => {
                  const left = daysLeft(p.expiryDate);
                  return (
                    <tr key={p.id}>
                      <td><span className="code-pill">{p.permitNumber}</span></td>
                      <td>{p.project.name}</td><td><strong>{p.type}</strong></td><td>{p.issuer || '—'}</td>
                      <td>{dAr(p.issueDate)}</td><td>{dAr(p.expiryDate)}</td>
                      <td><span className={`status-badge ${PERMIT_STATE[p.state]?.tone}`}><span className="status-dot" />{PERMIT_STATE[p.state]?.label}{p.state === 'soon' ? ` (${left} يوم)` : ''}</span></td>
                      <td><strong>{p.workersCount}</strong></td>
                      <td><div className="row-actions">
                        {p.attachment && <button className="action-btn blue" title="عرض المرفق" onClick={() => window.open(fileUrl(`/permits/${p.id}/file`), '_blank')}><Icon name="eye" size={16} /></button>}
                        {canWrite && <button className="action-btn" title="العمال المشمولون" onClick={() => setWorkersFor(p)}><Icon name="users" size={16} /></button>}
                        {canWrite && <button className="action-btn blue" title="تعديل" onClick={() => setForm({ open: true, data: p })}><Icon name="edit" size={16} /></button>}
                        {canWrite && <button className="action-btn danger" title="حذف" onClick={() => remove(p)}><Icon name="trash" size={16} /></button>}
                      </div></td>
                    </tr>
                  );
                }) : <tr><td colSpan={9}><div className="empty-state">لا توجد تصاريح مطابقة</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {form.open && <PermitForm initialData={form.data} projects={projects} onClose={() => setForm({ open: false, data: null })} onSaved={load} />}
      {workersFor && <PermitWorkers permit={workersFor} onClose={() => setWorkersFor(null)} onSaved={load} />}
    </div>
  );
}

function PermitForm({ initialData, projects, onClose, onSaved }: { initialData: Permit | null; projects: ProjectLite[]; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useFeedback();
  const fileRef = useRef<HTMLInputElement>(null);
  const isEdit = Boolean(initialData);
  const [f, setF] = useState({
    permitNumber: initialData?.permitNumber || '', projectId: initialData ? String(initialData.projectId) : '', type: initialData?.type || '',
    issuer: initialData?.issuer || '', location: initialData?.location || '', issueDate: initialData ? d10(initialData.issueDate) : new Date().toISOString().slice(0, 10),
    expiryDate: initialData ? d10(initialData.expiryDate) : '', status: initialData?.status || 'active', notes: initialData?.notes || '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      const body = new FormData();
      Object.entries(f).forEach(([k, v]) => body.append(k, v));
      if (file) body.append('file', file);
      if (isEdit && initialData) await api.put(`/permits/${initialData.id}`, body, { timeout: 0 }); else await api.post('/permits', body, { timeout: 0 });
      onSaved(); showToast(isEdit ? 'تم حفظ التصريح' : 'تم إضافة التصريح', 'success'); onClose();
    } catch (err: any) { setError(err?.response?.data?.message || 'تعذر الحفظ'); } finally { setSaving(false); }
  };

  return (
    <div className="overlay"><button className="overlay-dismiss" onClick={onClose} />
      <section className="modal-card wide">
        <div className="drawer-head"><div><h2>{isEdit ? 'تعديل التصريح' : 'تصريح عمل جديد'}</h2></div><button className="icon-button" onClick={onClose}><Icon name="close" size={20} /></button></div>
        <form onSubmit={submit} className="form-grid">
          <label className="form-field"><span>رقم التصريح</span><input value={f.permitNumber} onChange={(e) => set('permitNumber', e.target.value)} required /></label>
          <label className="form-field"><span>المشروع</span>
            <select value={f.projectId} onChange={(e) => set('projectId', e.target.value)} required><option value="">اختر المشروع</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="form-field"><span>نوع العمل</span><input list="permit-types" value={f.type} onChange={(e) => set('type', e.target.value)} required /></label>
          <datalist id="permit-types">{PERMIT_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
          <label className="form-field"><span>الجهة المصدرة</span><input value={f.issuer} onChange={(e) => set('issuer', e.target.value)} placeholder="مثال: شركة الكهرباء - منطقة القصيم" /></label>
          <label className="form-field"><span>موقع العمل</span><input value={f.location} onChange={(e) => set('location', e.target.value)} /></label>
          <label className="form-field"><span>الحالة</span><select value={f.status} onChange={(e) => set('status', e.target.value)}><option value="active">فعّال</option><option value="cancelled">ملغى</option></select></label>
          <label className="form-field"><span>تاريخ الإصدار</span><input type="date" value={f.issueDate} onChange={(e) => set('issueDate', e.target.value)} required /></label>
          <label className="form-field"><span>تاريخ الانتهاء</span><input type="date" value={f.expiryDate} onChange={(e) => set('expiryDate', e.target.value)} required /></label>
          <label className="form-field" style={{ gridColumn: '1 / -1' }}><span>ملاحظات</span><textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></label>
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="button" className="ghost-button" onClick={() => fileRef.current?.click()}><Icon name="upload" size={16} /> {file ? file.name : isEdit && initialData?.attachment ? 'استبدال مرفق التصريح' : 'إرفاق صورة / PDF التصريح'}</button>
            <input ref={fileRef} type="file" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions"><button type="button" className="ghost-button" onClick={onClose}>إلغاء</button><button className="primary-button" disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ'}</button></div>
        </form>
      </section>
    </div>
  );
}

function PermitWorkers({ permit, onClose, onSaved }: { permit: Permit; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useFeedback();
  const [ids, setIds] = useState<number[]>([]);
  const [allowed, setAllowed] = useState<number[] | undefined>(undefined);
  const [projectOnly, setProjectOnly] = useState(true);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([api.get(`/permits/${permit.id}`), api.get(`/projects/${permit.projectId}`)]).then(([p, pr]) => {
      setIds(p.data.workers.map((w: any) => w.employee.id));
      setAllowed(pr.data.assignments.filter((a: any) => a.status === 'active').map((a: any) => a.employee.id));
    }).catch(() => undefined).finally(() => setReady(true));
  }, [permit.id, permit.projectId]);

  const save = async () => {
    setBusy(true);
    try {
      const r = await api.put(`/permits/${permit.id}/workers`, { employeeIds: ids });
      showToast(r.data.message, 'success'); setWarnings(r.data.warnings || []); onSaved();
      if (!r.data.warnings?.length) onClose();
    } catch (e: any) { showToast(e?.response?.data?.message || 'تعذر الحفظ', 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="overlay overlay-center"><button className="overlay-dismiss" onClick={onClose} />
      <section className="modal-card wide">
        <div className="drawer-head"><div><span className="section-kicker">{permit.project.name}</span><h2>عمال التصريح {permit.permitNumber}</h2></div><button className="icon-button" onClick={onClose}><Icon name="close" size={20} /></button></div>
        <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', margin: '10px 0' }}>
          <input type="checkbox" checked={projectOnly} onChange={(e) => setProjectOnly(e.target.checked)} /> عمال هذا المشروع فقط ({allowed?.length ?? 0})
        </label>
        {ready ? <EmployeePicker selected={ids} onChange={setIds} allowedIds={projectOnly ? allowed : undefined} /> : <div className="empty-state">جاري التحميل...</div>}
        {warnings.length > 0 && <div className="permit-warnings"><strong>تنبيهات أهلية (تم الحفظ):</strong><br />{warnings.map((w, i) => <div key={i}>• {w}</div>)}</div>}
        <div className="form-actions" style={{ marginTop: 12 }}>
          <button className="ghost-button" onClick={onClose}>{warnings.length ? 'إغلاق' : 'إلغاء'}</button>
          <button className="primary-button" onClick={save} disabled={busy}>{busy ? 'جارٍ الحفظ...' : `حفظ (${ids.length} عامل)`}</button>
        </div>
      </section>
    </div>
  );
}
