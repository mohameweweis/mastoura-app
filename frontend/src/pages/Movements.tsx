import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Icon from '../components/Icons';
import { useFeedback } from '../components/Feedback';
import { useAuth } from '../components/Auth';

interface ProjectLite { id: number; name: string; code: string; status: string }
interface Movement { id: number; role: string | null; startDate: string; endDate: string | null; status: string; notes: string | null; employee: { id: number; name: string; jobNumber: string; profession: string | null }; project: { id: number; name: string; code: string } }
interface Free { id: number; name: string; jobNumber: string; profession: string | null; nationality: string | null; attendanceStatus: string | null; branch: { name: string } | null }
const dAr = (v: string | null) => (v ? new Date(v).toLocaleDateString('ar-SA') : '—');

export default function Movements() {
  const { showToast } = useFeedback();
  const { canWrite } = useAuth();
  const [tab, setTab] = useState<'log' | 'free'>('free');
  const [log, setLog] = useState<Movement[]>([]);
  const [free, setFree] = useState<Free[]>([]);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sel, setSel] = useState<number[]>([]);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [m, f, p] = await Promise.all([api.get('/movements'), api.get('/movements/unassigned'), api.get('/projects')]);
      setLog(m.data); setFree(f.data); setProjects(p.data.filter((x: ProjectLite) => x.status !== 'completed' && x.status !== 'cancelled')); setSel([]);
    } catch { /* ignore */ } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const rows = useMemo(() => log.filter((m) => (projectFilter === 'all' || String(m.project.id) === projectFilter) && (statusFilter === 'all' || m.status === statusFilter)
    && (!search || m.employee.name.toLowerCase().includes(search.toLowerCase()) || m.employee.jobNumber.includes(search))), [log, projectFilter, statusFilter, search]);
  const freeRows = useMemo(() => free.filter((e) => !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.jobNumber.includes(search)), [free, search]);
  const toggle = (id: number) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const assign = async () => {
    if (!target || !sel.length) return;
    setBusy(true);
    try { const r = await api.post(`/projects/${target}/assignments`, { employeeIds: sel }); showToast(r.data.message, 'success'); await load(); }
    catch (e: any) { showToast(e?.response?.data?.message || 'تعذر الإسناد', 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="module-page">
      <div className="page-toolbar">
        <div>
          <span className="section-kicker">حركة العمالة</span>
          <h1>حركة العمال</h1>
          <p>من يعمل أين ومنذ متى، وسجل النقل بين المشاريع، مع قائمة العمال الذين لا يتبعون أي مشروع حالياً.</p>
        </div>
      </div>

      <div className="summary-tiles">
        <div className="summary-tile"><span>على رأس العمل بمشاريع</span><strong style={{ color: '#1f8b5f' }}>{log.filter((m) => m.status === 'active').length}</strong></div>
        <div className="summary-tile"><span>بلا مشروع حالياً</span><strong style={{ color: '#b3740c' }}>{free.length}</strong></div>
        <div className="summary-tile"><span>سجلات الحركة</span><strong>{log.length}</strong></div>
      </div>

      <section className="panel-card">
        <div className="pill-tabs">
          <button className={tab === 'free' ? 'active' : ''} onClick={() => setTab('free')}><Icon name="users" size={16} /> بلا مشروع <span className="pill-tab-count">{free.length}</span></button>
          <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}><Icon name="clock" size={16} /> سجل الحركة <span className="pill-tab-count">{log.length}</span></button>
        </div>

        <div className="filters-inline" style={{ padding: '0 20px' }}>
          <input placeholder="بحث بالاسم أو الرقم الوظيفي..." value={search} onChange={(e) => setSearch(e.target.value)} />
          {tab === 'log' && (
            <>
              <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}><option value="all">كل المشاريع</option>{[...new Map(log.map((m) => [m.project.id, m.project.name])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">الكل</option><option value="active">على رأس العمل</option><option value="ended">منتهٍ</option></select>
            </>
          )}
          {tab === 'free' && canWrite && (
            <>
              <select value={target} onChange={(e) => setTarget(e.target.value)}><option value="">إسناد المحددين إلى مشروع...</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              <button className="primary-button" disabled={!target || !sel.length || busy} onClick={assign}>{busy ? 'جارٍ الإسناد...' : `إسناد ${sel.length} عامل`}</button>
            </>
          )}
        </div>

        <div className="table-wrap">
          {tab === 'free' ? (
            <table className="data-table">
              <thead><tr>{canWrite && <th></th>}<th>الرقم الوظيفي</th><th>العامل</th><th>المهنة</th><th>الجنسية</th><th>الفرع</th><th>الحالة</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={7}><div className="empty-state">جاري التحميل...</div></td></tr>
                  : freeRows.length ? freeRows.map((e) => (
                    <tr key={e.id}>
                      {canWrite && <td><input type="checkbox" checked={sel.includes(e.id)} onChange={() => toggle(e.id)} /></td>}
                      <td>{e.jobNumber}</td><td><strong>{e.name}</strong></td><td>{e.profession || '—'}</td><td>{e.nationality || '—'}</td><td>{e.branch?.name || '—'}</td>
                      <td><span className={`status-badge ${e.attendanceStatus === 'absent' ? 'orange' : 'green'}`}>{e.attendanceStatus === 'absent' ? 'متغيب' : 'حاضر'}</span></td>
                    </tr>
                  )) : <tr><td colSpan={7}><div className="empty-state">كل العمال موزعون على مشاريع 👍</div></td></tr>}
              </tbody>
            </table>
          ) : (
            <table className="data-table">
              <thead><tr><th>الرقم الوظيفي</th><th>العامل</th><th>المشروع</th><th>الدور</th><th>من</th><th>إلى</th><th>الحالة</th><th>ملاحظات</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={8}><div className="empty-state">جاري التحميل...</div></td></tr>
                  : rows.length ? rows.map((m) => (
                    <tr key={m.id}>
                      <td>{m.employee.jobNumber}</td><td><strong>{m.employee.name}</strong></td><td>{m.project.name}</td><td>{m.role || '—'}</td>
                      <td>{dAr(m.startDate)}</td><td>{dAr(m.endDate)}</td>
                      <td><span className={`status-badge ${m.status === 'active' ? 'green' : 'gray'}`}>{m.status === 'active' ? 'على رأس العمل' : 'منتهٍ'}</span></td>
                      <td style={{ whiteSpace: 'normal' }}>{m.notes || '—'}</td>
                    </tr>
                  )) : <tr><td colSpan={8}><div className="empty-state">لا توجد حركات مسجلة</div></td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
