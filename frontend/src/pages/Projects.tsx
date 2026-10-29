import { useEffect, useMemo, useState } from 'react';
import api, { fileUrl } from '../services/api';
import Icon from '../components/Icons';
import EmployeePicker from '../components/EmployeePicker';
import { useFeedback } from '../components/Feedback';
import { useAuth } from '../components/Auth';

interface Branch { id: number; name: string }
interface EmpLite { id: number; name: string; jobNumber: string }
interface Project {
  id: number; code: string; name: string; client: string | null; contractNumber: string | null; location: string | null;
  branchId: number | null; managerId: number | null; startDate: string | null; endDate: string | null; status: string; budget: number | null; notes: string | null;
  branch?: Branch | null; manager?: { id: number; name: string } | null;
  workersCount: number; permitsCount: number; permitsExpired: number; permitsSoon: number;
}
interface Assignment { id: number; role: string | null; startDate: string; endDate: string | null; status: string; notes: string | null; employee: { id: number; name: string; jobNumber: string; profession: string | null } }
interface PermitRow { id: number; permitNumber: string; type: string; expiryDate: string; state: string; workersCount: number; attachment: string | null }
interface ProjectDetail extends Omit<Project, 'workersCount' | 'permitsCount' | 'permitsExpired' | 'permitsSoon'> { assignments: Assignment[]; permits: PermitRow[] }

export const PROJECT_STATUS: Record<string, { label: string; tone: string }> = {
  planned: { label: 'مخطط', tone: 'gray' }, active: { label: 'نشط', tone: 'green' }, on_hold: { label: 'متوقف', tone: 'orange' },
  completed: { label: 'منتهٍ', tone: 'gray' }, cancelled: { label: 'ملغى', tone: 'red' },
};
export const PERMIT_STATE: Record<string, { label: string; tone: string }> = {
  valid: { label: 'ساري', tone: 'green' }, soon: { label: 'ينتهي قريباً', tone: 'orange' }, expired: { label: 'منتهٍ', tone: 'red' }, cancelled: { label: 'ملغى', tone: 'gray' },
};
const d10 = (v: string | null) => (v ? v.slice(0, 10) : '');
const dAr = (v: string | null) => (v ? new Date(v).toLocaleDateString('ar-SA') : '—');

export default function Projects() {
  const { confirm, showToast } = useFeedback();
  const { canWrite } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [employees, setEmployees] = useState<EmpLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<{ open: boolean; data: Project | null }>({ open: false, data: null });
  const [detailId, setDetailId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [p, b, e] = await Promise.all([api.get('/projects'), api.get('/branches'), api.get('/employees')]);
      setProjects(p.data); setBranches(b.data); setEmployees(e.data);
    } catch { setProjects([]); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => projects.filter((p) => (status === 'all' || p.status === status)
    && (!search || [p.name, p.code, p.client, p.location].some((v) => (v || '').toLowerCase().includes(search.toLowerCase())))), [projects, status, search]);

  const remove = async (p: Project) => {
    if (!(await confirm({ message: `سيتم حذف المشروع "${p.name}" وكل تصاريحه وسجل حركته. هل تريد المتابعة؟` }))) return;
    try { await api.delete(`/projects/${p.id}`); showToast('تم حذف المشروع', 'success'); load(); }
    catch (e: any) { showToast(e?.response?.data?.message || 'تعذر الحذف', 'error'); }
  };

  return (
    <div className="module-page">
      <div className="page-toolbar">
        <div>
          <span className="section-kicker">إدارة المشاريع</span>
          <h1>المشاريع</h1>
          <p>مشاريع الشركة والجهات المالكة (مثل شركة الكهرباء)، والعمال المسندون لكل مشروع وتصاريح العمل الخاصة به.</p>
        </div>
        {canWrite && <button className="primary-button" onClick={() => setForm({ open: true, data: null })}><Icon name="plus" size={18} /> مشروع جديد</button>}
      </div>

      <div className="summary-tiles">
        <div className="summary-tile"><span>إجمالي المشاريع</span><strong>{projects.length}</strong></div>
        <div className="summary-tile"><span>مشاريع نشطة</span><strong style={{ color: '#1f8b5f' }}>{projects.filter((p) => p.status === 'active').length}</strong></div>
        <div className="summary-tile"><span>عمال على المشاريع</span><strong>{projects.reduce((a, p) => a + p.workersCount, 0)}</strong></div>
        <div className="summary-tile"><span>تصاريح منتهية / قريبة</span><strong style={{ color: '#d3394c' }}>{projects.reduce((a, p) => a + p.permitsExpired, 0)} / {projects.reduce((a, p) => a + p.permitsSoon, 0)}</strong></div>
      </div>

      <section className="panel-card">
        <div className="filters-inline" style={{ padding: '16px 20px 0' }}>
          <input placeholder="بحث بالاسم أو الرمز أو الجهة أو الموقع..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">كل الحالات</option>
            {Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>الرمز</th><th>المشروع</th><th>الجهة المالكة</th><th>الموقع</th><th>المدير</th><th>الحالة</th><th>العمال</th><th>التصاريح</th><th className="actions-head">الإجراءات</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={9}><div className="empty-state">جاري التحميل...</div></td></tr>
                : filtered.length ? filtered.map((p) => (
                  <tr key={p.id}>
                    <td><span className="code-pill">{p.code}</span></td>
                    <td><strong>{p.name}</strong></td>
                    <td>{p.client || '—'}</td>
                    <td>{p.location || '—'}</td>
                    <td>{p.manager?.name || '—'}</td>
                    <td><span className={`status-badge ${PROJECT_STATUS[p.status]?.tone || 'gray'}`}><span className="status-dot" />{PROJECT_STATUS[p.status]?.label || p.status}</span></td>
                    <td><strong>{p.workersCount}</strong></td>
                    <td>
                      {p.permitsCount}
                      {p.permitsExpired > 0 && <span className="status-badge red" style={{ marginInlineStart: 6 }}>{p.permitsExpired} منتهٍ</span>}
                      {p.permitsSoon > 0 && <span className="status-badge orange" style={{ marginInlineStart: 6 }}>{p.permitsSoon} قريب</span>}
                    </td>
                    <td><div className="row-actions">
                      <button className="action-btn blue" title="تفاصيل المشروع" onClick={() => setDetailId(p.id)}><Icon name="eye" size={16} /></button>
                      {canWrite && <button className="action-btn" title="تعديل" onClick={() => setForm({ open: true, data: p })}><Icon name="edit" size={16} /></button>}
                      {canWrite && <button className="action-btn danger" title="حذف" onClick={() => remove(p)}><Icon name="trash" size={16} /></button>}
                    </div></td>
                  </tr>
                )) : <tr><td colSpan={9}><div className="empty-state">لا توجد مشاريع. أضف أول مشروع للبدء.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {form.open && <ProjectForm initialData={form.data} branches={branches} employees={employees} onClose={() => setForm({ open: false, data: null })} onSaved={load} />}
      {detailId !== null && <ProjectDetailModal id={detailId} onClose={() => setDetailId(null)} onChanged={load} />}
    </div>
  );
}

function ProjectForm({ initialData, branches, employees, onClose, onSaved }: { initialData: Project | null; branches: Branch[]; employees: EmpLite[]; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useFeedback();
  const isEdit = Boolean(initialData);
  const [f, setF] = useState({
    code: initialData?.code || '', name: initialData?.name || '', client: initialData?.client || '', contractNumber: initialData?.contractNumber || '',
    location: initialData?.location || '', branchId: initialData?.branchId ? String(initialData.branchId) : '', managerId: initialData?.managerId ? String(initialData.managerId) : '',
    startDate: d10(initialData?.startDate || null), endDate: d10(initialData?.endDate || null), status: initialData?.status || 'active',
    budget: initialData?.budget != null ? String(initialData.budget) : '', notes: initialData?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      if (isEdit && initialData) await api.put(`/projects/${initialData.id}`, f); else await api.post('/projects', f);
      onSaved(); showToast(isEdit ? 'تم حفظ المشروع' : 'تم إضافة المشروع', 'success'); onClose();
    } catch (err: any) { setError(err?.response?.data?.message || 'تعذر الحفظ'); } finally { setSaving(false); }
  };

  return (
    <div className="overlay"><button className="overlay-dismiss" onClick={onClose} />
      <section className="modal-card wide">
        <div className="drawer-head"><div><h2>{isEdit ? 'تعديل المشروع' : 'مشروع جديد'}</h2></div><button className="icon-button" onClick={onClose}><Icon name="close" size={20} /></button></div>
        <form onSubmit={submit} className="form-grid">
          <label className="form-field"><span>اسم المشروع</span><input value={f.name} onChange={(e) => set('name', e.target.value)} required /></label>
          <label className="form-field"><span>رمز المشروع (يُولَّد تلقائياً إن تُرك فارغاً)</span><input value={f.code} onChange={(e) => set('code', e.target.value)} /></label>
          <label className="form-field"><span>الجهة المالكة / العميل</span><input value={f.client} onChange={(e) => set('client', e.target.value)} placeholder="مثال: شركة الكهرباء" /></label>
          <label className="form-field"><span>رقم العقد</span><input value={f.contractNumber} onChange={(e) => set('contractNumber', e.target.value)} /></label>
          <label className="form-field"><span>موقع المشروع</span><input value={f.location} onChange={(e) => set('location', e.target.value)} /></label>
          <label className="form-field"><span>الفرع المسؤول</span>
            <select value={f.branchId} onChange={(e) => set('branchId', e.target.value)}><option value="">—</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          <label className="form-field"><span>مدير المشروع</span>
            <select value={f.managerId} onChange={(e) => set('managerId', e.target.value)}><option value="">—</option>{employees.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.jobNumber})</option>)}</select></label>
          <label className="form-field"><span>الحالة</span>
            <select value={f.status} onChange={(e) => set('status', e.target.value)}>{Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
          <label className="form-field"><span>تاريخ البدء</span><input type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} /></label>
          <label className="form-field"><span>تاريخ الانتهاء المخطط</span><input type="date" value={f.endDate} onChange={(e) => set('endDate', e.target.value)} /></label>
          <label className="form-field"><span>قيمة العقد (اختياري)</span><input type="number" value={f.budget} onChange={(e) => set('budget', e.target.value)} /></label>
          <label className="form-field" style={{ gridColumn: '1 / -1' }}><span>ملاحظات</span><textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></label>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions"><button type="button" className="ghost-button" onClick={onClose}>إلغاء</button><button className="primary-button" disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ'}</button></div>
        </form>
      </section>
    </div>
  );
}

function ProjectDetailModal({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { confirm, showToast } = useFeedback();
  const { canWrite } = useAuth();
  const [p, setP] = useState<ProjectDetail | null>(null);
  const [tab, setTab] = useState<'workers' | 'permits'>('workers');
  const [showAssign, setShowAssign] = useState(false);
  const [showEnded, setShowEnded] = useState(false);

  const load = async () => { try { setP((await api.get(`/projects/${id}`)).data); } catch { setP(null); } };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const end = async (a: Assignment) => {
    if (!(await confirm({ title: 'إنهاء الإسناد', message: `إنهاء إسناد "${a.employee.name}" من هذا المشروع؟`, confirmLabel: 'إنهاء', danger: false }))) return;
    try { await api.post(`/assignments/${a.id}/end`, {}); showToast('تم إنهاء الإسناد', 'success'); await load(); onChanged(); }
    catch (e: any) { showToast(e?.response?.data?.message || 'تعذر الإنهاء', 'error'); }
  };

  if (!p) return <div className="overlay"><button className="overlay-dismiss" onClick={onClose} /><section className="modal-card wide"><div className="empty-state">جاري التحميل...</div></section></div>;
  const active = p.assignments.filter((a) => a.status === 'active');
  const ended = p.assignments.filter((a) => a.status !== 'active');

  return (
    <div className="overlay overlay-center"><button className="overlay-dismiss" onClick={onClose} />
      <section className="modal-card wide" style={{ maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="drawer-head">
          <div><span className="section-kicker">{p.code} · {p.client || 'بدون جهة مالكة'}</span><h2>{p.name}</h2></div>
          <button className="icon-button" onClick={onClose}><Icon name="close" size={20} /></button>
        </div>
        <div className="project-head">
          {([['الموقع', p.location || '—'], ['المدير', p.manager?.name || '—'], ['رقم العقد', p.contractNumber || '—'], ['الحالة', PROJECT_STATUS[p.status]?.label || p.status], ['البدء', dAr(p.startDate)], ['الانتهاء المخطط', dAr(p.endDate)], ['الفرع', p.branch?.name || '—'], ['العمال الحاليون', String(active.length)]] as [string, string][]).map(([k, v]) => (
            <div className="ep-field" key={k}><span>{k}</span><strong>{v}</strong></div>
          ))}
        </div>

        <div className="pill-tabs">
          <button className={tab === 'workers' ? 'active' : ''} onClick={() => setTab('workers')}><Icon name="users" size={16} /> العمال <span className="pill-tab-count">{active.length}</span></button>
          <button className={tab === 'permits' ? 'active' : ''} onClick={() => setTab('permits')}><Icon name="id" size={16} /> التصاريح <span className="pill-tab-count">{p.permits.length}</span></button>
        </div>

        {tab === 'workers' && (
          <>
            <div className="filters-inline">
              {canWrite && p.status !== 'completed' && p.status !== 'cancelled' && <button className="primary-button" onClick={() => setShowAssign(true)}><Icon name="plus" size={16} /> إسناد عمال</button>}
              <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} /> إظهار السجل المنتهي ({ended.length})</label>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>الرقم الوظيفي</th><th>العامل</th><th>المهنة</th><th>الدور</th><th>من</th><th>إلى</th><th>الحالة</th>{canWrite && <th className="actions-head">إجراء</th>}</tr></thead>
                <tbody>
                  {(showEnded ? p.assignments : active).length ? (showEnded ? p.assignments : active).map((a) => (
                    <tr key={a.id}>
                      <td>{a.employee.jobNumber}</td><td><strong>{a.employee.name}</strong></td><td>{a.employee.profession || '—'}</td><td>{a.role || '—'}</td>
                      <td>{dAr(a.startDate)}</td><td>{dAr(a.endDate)}</td>
                      <td><span className={`status-badge ${a.status === 'active' ? 'green' : 'gray'}`}>{a.status === 'active' ? 'على رأس العمل' : 'منتهٍ'}</span></td>
                      {canWrite && <td>{a.status === 'active' && <button className="ghost-button" onClick={() => end(a)}>إنهاء</button>}</td>}
                    </tr>
                  )) : <tr><td colSpan={8}><div className="empty-state">لا يوجد عمال مسندون لهذا المشروع</div></td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'permits' && (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>رقم التصريح</th><th>النوع</th><th>تاريخ الانتهاء</th><th>الحالة</th><th>العمال</th><th>المرفق</th></tr></thead>
              <tbody>
                {p.permits.length ? p.permits.map((x) => (
                  <tr key={x.id}>
                    <td><span className="code-pill">{x.permitNumber}</span></td><td><strong>{x.type}</strong></td><td>{dAr(x.expiryDate)}</td>
                    <td><span className={`status-badge ${PERMIT_STATE[x.state]?.tone}`}><span className="status-dot" />{PERMIT_STATE[x.state]?.label}</span></td>
                    <td>{x.workersCount}</td>
                    <td>{x.attachment ? <button className="action-btn blue" onClick={() => window.open(fileUrl(`/permits/${x.id}/file`), '_blank')}><Icon name="eye" size={16} /></button> : '—'}</td>
                  </tr>
                )) : <tr><td colSpan={6}><div className="empty-state">لا توجد تصاريح لهذا المشروع. أضفها من صفحة «تصاريح العمل».</div></td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {showAssign && <AssignModal projectId={p.id} projectName={p.name} onClose={() => setShowAssign(false)} onDone={async () => { await load(); onChanged(); }} />}
      </section>
    </div>
  );
}

export function AssignModal({ projectId, projectName, onClose, onDone }: { projectId: number; projectName: string; onClose: () => void; onDone: () => void | Promise<void> }) {
  const { showToast } = useFeedback();
  const [ids, setIds] = useState<number[]>([]);
  const [role, setRole] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/projects/${projectId}/assignments`, { employeeIds: ids, role, startDate });
      showToast(r.data.message, 'success');
      if (r.data.blocked?.length) showToast(`لم يُسنَد: ${r.data.blocked.join('، ')}`, 'info');
      await onDone(); onClose();
    } catch (e: any) { showToast(e?.response?.data?.message || 'تعذر الإسناد', 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="overlay overlay-center" style={{ zIndex: 60 }}><button className="overlay-dismiss" onClick={onClose} />
      <section className="modal-card wide">
        <div className="drawer-head"><div><span className="section-kicker">إسناد / نقل عمال</span><h2>{projectName}</h2></div><button className="icon-button" onClick={onClose}><Icon name="close" size={20} /></button></div>
        <p style={{ color: '#7b899a', fontSize: 12, margin: '10px 0' }}>العامل المسند لمشروع آخر يُنقل تلقائياً وتُسجَّل الحركة. لا يُسنَد العمال ذوو «الخروج النهائي».</p>
        <EmployeePicker selected={ids} onChange={setIds} />
        <div className="form-grid" style={{ marginTop: 12 }}>
          <label className="form-field"><span>الدور في المشروع (اختياري)</span><input value={role} onChange={(e) => setRole(e.target.value)} placeholder="مثال: فني كابلات" /></label>
          <label className="form-field"><span>تاريخ البدء</span><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
          <div className="form-actions"><button className="ghost-button" onClick={onClose}>إلغاء</button><button className="primary-button" disabled={busy || !ids.length} onClick={save}>{busy ? 'جارٍ الإسناد...' : `إسناد ${ids.length} عامل`}</button></div>
        </div>
      </section>
    </div>
  );
}
