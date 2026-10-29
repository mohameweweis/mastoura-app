import { useEffect, useState } from 'react';
import api, { downloadBlob, errorMessage } from '../services/api';
import Icon from '../components/Icons';
import { useFeedback } from '../components/Feedback';
import { useAuth } from '../components/Auth';

interface ReportInfo { key: string; title: string; description: string }
interface ReportData { title: string; columns: { key: string; label: string }[]; rows: Record<string, any>[] }
interface Branch { id: number; name: string }

export default function Reports() {
  const { showToast } = useFeedback();
  const { canExport } = useAuth();
  const [list, setList] = useState<ReportInfo[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [active, setActive] = useState<ReportInfo | null>(null);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/reports').then((r) => setList(r.data)).catch(() => undefined);
    api.get('/branches').then((r) => setBranches(r.data)).catch(() => undefined);
  }, []);

  const open = async (info: ReportInfo, branch = branchId) => {
    setActive(info); setLoading(true); setData(null); setSearch('');
    try { setData((await api.get(`/reports/${info.key}`, { params: { branchId: branch || undefined } })).data); }
    catch (e: any) { showToast(e?.response?.data?.message || 'تعذر تحميل التقرير', 'error'); }
    finally { setLoading(false); }
  };

  const exportXlsx = async () => {
    if (!active) return;
    try { await downloadBlob(() => api.get(`/reports/${active.key}`, { params: { format: 'xlsx', branchId: branchId || undefined }, responseType: 'blob' }), `${active.title}.xlsx`); showToast('تم تنزيل ملف Excel', 'success'); }
    catch (e) { showToast(await errorMessage(e, 'تعذر التصدير'), 'error'); }
  };

  const exportAll = async () => {
    try { await downloadBlob(() => api.get('/reports/comprehensive', { responseType: 'blob' }), 'تقرير-شامل.xlsx'); showToast('تم تنزيل التقرير الشامل', 'success'); }
    catch (e) { showToast(await errorMessage(e, 'تعذر التصدير'), 'error'); }
  };

  const rows = (data?.rows || []).filter((r) => !search || Object.values(r).some((v) => String(v).includes(search)));

  return (
    <div className="module-page">
      <div className="page-toolbar">
        <div>
          <span className="section-kicker">التقارير والتحليلات</span>
          <h1>التقارير</h1>
          <p>اعرض أي تقرير على الشاشة، ثم صدّره إلى Excel أو اطبعه / احفظه PDF.</p>
        </div>
        <div className="filters-inline" style={{ margin: 0 }}>
          <select value={branchId} onChange={(e) => { setBranchId(e.target.value); if (active) open(active, e.target.value); }}>
            <option value="">كل الفروع</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {canExport && <button className="primary-button" onClick={exportAll}><Icon name="download" size={17} /> التقرير الشامل (4 صفحات)</button>}
        </div>
      </div>

      <div className="report-grid no-print">
        {list.map((r) => (
          <button key={r.key} className={`report-card ${active?.key === r.key ? 'active' : ''}`} onClick={() => open(r)}>
            <Icon name="report" size={20} />
            <strong>{r.title}</strong>
            <small>{r.description}</small>
          </button>
        ))}
      </div>

      {active && (
        <section className="panel-card" style={{ marginTop: 18 }}>
          <div className="panel-head">
            <div><span className="section-kicker">{rows.length} سجل</span><h2>{active.title}</h2></div>
            <div className="filters-inline no-print" style={{ margin: 0 }}>
              <input placeholder="بحث داخل التقرير..." value={search} onChange={(e) => setSearch(e.target.value)} />
              {canExport && <button className="ghost-button" onClick={exportXlsx}><Icon name="download" size={16} /> Excel</button>}
              <button className="ghost-button" onClick={() => window.print()}><Icon name="report" size={16} /> طباعة / PDF</button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr>{data?.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={9}><div className="empty-state">جاري تجهيز التقرير...</div></td></tr>
                  : rows.length ? rows.map((r, i) => <tr key={i}>{data!.columns.map((c) => <td key={c.key}>{String(r[c.key] ?? '')}</td>)}</tr>)
                    : <tr><td colSpan={9}><div className="empty-state">لا توجد بيانات في هذا التقرير</div></td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
