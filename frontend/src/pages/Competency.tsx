import { useEffect, useMemo, useState } from 'react';
import api, { downloadBlob, errorMessage } from '../services/api';
import Icon from '../components/Icons';
import { useFeedback } from '../components/Feedback';
import { useAuth } from '../components/Auth';

type Cell = 'ok' | 'expiring' | 'expired' | 'missing';
interface Req { id: number; type: 'course' | 'card' | 'document'; label: string }
interface Member { id: number; name: string; jobNumber: string; branch: string; cells: Cell[]; satisfied: number; total: number; qualified: boolean }
interface RoleMatrix { id: number; name: string; requirements: Req[]; employees: Member[] }
interface Matrix { alertDays: number; unmappedEmployees: number; roles: RoleMatrix[] }
interface Opt { id: number; name: string }

const cellMeta: Record<Cell, { label: string; icon: string; cls: string }> = {
  ok: { label: 'مستوفى', icon: '✓', cls: 'cell-ok' },
  expiring: { label: 'ينتهي قريباً', icon: '!', cls: 'cell-soon' },
  expired: { label: 'منتهي', icon: '✕', cls: 'cell-expired' },
  missing: { label: 'ناقص', icon: '—', cls: 'cell-missing' },
};

export default function Competency() {
  const { showToast, confirm } = useFeedback();
  const { canWrite, canExport } = useAuth();
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [roleId, setRoleId] = useState<number | null>(null);
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState<Opt[]>([]);
  const [courses, setCourses] = useState<Opt[]>([]);
  const [cards, setCards] = useState<Opt[]>([]);
  const [categories, setCategories] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRole, setNewRole] = useState('');
  const [reqKind, setReqKind] = useState<'course' | 'card' | 'document'>('course');
  const [reqId, setReqId] = useState('');
  const [onlyGaps, setOnlyGaps] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/competency', { params: { branchId: branchId || undefined } });
      setMatrix(res.data);
      setRoleId((cur) => (cur && res.data.roles.some((r: RoleMatrix) => r.id === cur) ? cur : res.data.roles[0]?.id ?? null));
    } catch { setMatrix(null); } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [branchId]);
  useEffect(() => {
    Promise.all([api.get('/branches'), api.get('/courses'), api.get('/qualification-cards'), api.get('/document-categories')])
      .then(([b, c, k, d]) => { setBranches(b.data); setCourses(c.data); setCards(k.data); setCategories(d.data); }).catch(() => undefined);
  }, []);

  const role = matrix?.roles.find((r) => r.id === roleId) || null;
  const members = useMemo(() => (role?.employees || []).filter((m) => !onlyGaps || !m.qualified), [role, onlyGaps]);
  const options = reqKind === 'course' ? courses : reqKind === 'card' ? cards : categories;

  const addRole = async () => {
    if (!newRole.trim()) return;
    try { const r = await api.post('/job-roles', { name: newRole }); setNewRole(''); setRoleId(r.data.id); showToast('تمت إضافة الوظيفة', 'success'); load(); }
    catch (e: any) { showToast(e?.response?.data?.message || 'تعذر إضافة الوظيفة', 'error'); }
  };

  const syncRoles = async () => {
    try { const r = await api.post('/job-roles/sync-from-employees'); showToast(r.data.message, 'success'); load(); }
    catch { showToast('تعذر إنشاء الوظائف', 'error'); }
  };

  const deleteRole = async () => {
    if (!role) return;
    if (!(await confirm({ message: `سيتم حذف الوظيفة "${role.name}" وكل متطلباتها. هل تريد المتابعة؟` }))) return;
    await api.delete(`/job-roles/${role.id}`);
    showToast('تم حذف الوظيفة', 'success'); setRoleId(null); load();
  };

  const addReq = async () => {
    if (!role || !reqId) return;
    try {
      await api.post(`/job-roles/${role.id}/requirements`, { [reqKind === 'course' ? 'courseId' : reqKind === 'card' ? 'cardId' : 'categoryId']: Number(reqId) });
      setReqId(''); showToast('تمت إضافة المتطلب', 'success'); load();
    } catch (e: any) { showToast(e?.response?.data?.message || 'تعذر إضافة المتطلب', 'error'); }
  };

  const removeReq = async (id: number) => { await api.delete(`/job-requirements/${id}`); load(); };

  const exportXlsx = async () => {
    try { await downloadBlob(() => api.get('/reports/competency', { params: { format: 'xlsx', branchId: branchId || undefined }, responseType: 'blob' }), 'مصفوفة-الكفاءة.xlsx'); }
    catch (e) { showToast(await errorMessage(e, 'تعذر التصدير'), 'error'); }
  };

  const qualified = role?.employees.filter((m) => m.qualified).length || 0;

  return (
    <div className="module-page">
      <div className="page-toolbar">
        <div>
          <span className="section-kicker">الكفاءة والتأهيل</span>
          <h1>مصفوفة الكفاءة</h1>
          <p>مقارنة متطلبات كل وظيفة بمؤهلات العامل الفعلية. لا يُعتبر العامل مؤهلاً إلا إذا كان كل متطلب لديه <b>ساري الصلاحية</b>.</p>
        </div>
        <div className="filters-inline no-print" style={{ margin: 0 }}>
          {canExport && <button className="ghost-button" onClick={exportXlsx}><Icon name="download" size={16} /> Excel</button>}
          <button className="ghost-button" onClick={() => window.print()}><Icon name="report" size={16} /> طباعة / PDF</button>
        </div>
      </div>

      <section className="panel-card" style={{ padding: 18 }}>
        <div className="filters-inline">
          <select value={roleId ?? ''} onChange={(e) => setRoleId(Number(e.target.value))}>
            {!matrix?.roles.length && <option value="">لا توجد وظائف</option>}
            {matrix?.roles.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.employees.length})</option>)}
          </select>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">كل الفروع</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}><input type="checkbox" checked={onlyGaps} onChange={(e) => setOnlyGaps(e.target.checked)} /> إظهار غير المؤهلين فقط</label>
          {canWrite && <button className="ghost-button" onClick={syncRoles} title="ينشئ وظيفة لكل مهنة موجودة لدى العاملين"><Icon name="users" size={16} /> إنشاء الوظائف من مهن العاملين</button>}
        </div>

        {canWrite && (
          <div className="filters-inline no-print">
            <input placeholder="اسم وظيفة جديدة..." value={newRole} onChange={(e) => setNewRole(e.target.value)} />
            <button className="ghost-button" onClick={addRole}><Icon name="plus" size={16} /> إضافة وظيفة</button>
            {role && <button className="ghost-button" style={{ color: '#d3394c' }} onClick={deleteRole}><Icon name="trash" size={16} /> حذف الوظيفة الحالية</button>}
          </div>
        )}

        {role && canWrite && (
          <div className="req-box no-print">
            <strong>متطلبات «{role.name}»:</strong>
            <div className="req-chips">
              {role.requirements.map((r) => (
                <span key={r.id} className="selected-chip">{r.type === 'course' ? 'دورة' : r.type === 'card' ? 'كرت' : 'مستند'}: {r.label}
                  <button onClick={() => removeReq(r.id)} title="إزالة"><Icon name="close" size={13} /></button></span>
              ))}
              {!role.requirements.length && <span style={{ color: '#8a99ab', fontSize: 12 }}>لا توجد متطلبات بعد — أضف أول متطلب.</span>}
            </div>
            <div className="filters-inline" style={{ marginTop: 10, marginBottom: 0 }}>
              <select value={reqKind} onChange={(e) => { setReqKind(e.target.value as any); setReqId(''); }}>
                <option value="course">دورة تدريبية</option><option value="card">كرت اختبار/تأهيل</option><option value="document">نوع مستند</option>
              </select>
              <select value={reqId} onChange={(e) => setReqId(e.target.value)}>
                <option value="">اختر...</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <button className="primary-button" onClick={addReq} disabled={!reqId}><Icon name="plus" size={16} /> إضافة متطلب</button>
            </div>
          </div>
        )}
      </section>

      {role && (
        <section className="panel-card" style={{ marginTop: 16 }}>
          <div className="summary-tiles" style={{ padding: '16px 18px 0' }}>
            <div className="summary-tile"><span>عاملون بهذه الوظيفة</span><strong>{role.employees.length}</strong></div>
            <div className="summary-tile"><span>مؤهلون بالكامل</span><strong style={{ color: '#1f8b5f' }}>{qualified}</strong></div>
            <div className="summary-tile"><span>غير مؤهلين</span><strong style={{ color: '#d3394c' }}>{role.employees.length - qualified}</strong></div>
            {!!matrix?.unmappedEmployees && <div className="summary-tile"><span>مهنتهم بلا وظيفة معرّفة</span><strong>{matrix.unmappedEmployees}</strong></div>}
          </div>
          <div className="matrix-legend no-print">
            {(Object.keys(cellMeta) as Cell[]).map((c) => <span key={c}><i className={`matrix-cell ${cellMeta[c].cls}`}>{cellMeta[c].icon}</i> {cellMeta[c].label}</span>)}
          </div>
          <div className="table-wrap">
            <table className="data-table matrix-table">
              <thead>
                <tr><th>الرقم الوظيفي</th><th>العامل</th><th>الفرع</th>{role.requirements.map((r) => <th key={r.id} className="matrix-th" title={r.label}>{r.label}</th>)}<th>الاستيفاء</th></tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={5 + role.requirements.length}><div className="empty-state">جاري التحميل...</div></td></tr>
                  : members.length ? members.map((m) => (
                    <tr key={m.id}>
                      <td>{m.jobNumber}</td><td><strong>{m.name}</strong></td><td>{m.branch}</td>
                      {m.cells.map((c, i) => <td key={i} style={{ textAlign: 'center' }}><i className={`matrix-cell ${cellMeta[c].cls}`} title={cellMeta[c].label}>{cellMeta[c].icon}</i></td>)}
                      <td><span className={`status-badge ${m.qualified ? 'green' : 'red'}`}>{m.total ? `${m.satisfied}/${m.total}` : 'بلا متطلبات'}{m.qualified ? ' · مؤهل' : ''}</span></td>
                    </tr>
                  )) : <tr><td colSpan={5 + role.requirements.length}><div className="empty-state">لا يوجد عاملون مطابقون لهذه الوظيفة (تتم المطابقة بين اسم الوظيفة وحقل «المهنة» عند العامل)</div></td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {!loading && !matrix?.roles.length && (
        <div className="empty-state" style={{ marginTop: 16 }}>لا توجد وظائف معرّفة بعد. اضغط «إنشاء الوظائف من مهن العاملين» أو أضف وظيفة يدوياً ثم حدّد متطلباتها.</div>
      )}
    </div>
  );
}
