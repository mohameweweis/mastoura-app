import { useEffect, useState } from 'react';
import api from '../services/api';

interface Log { id: number; username: string; action: string; entity: string; entityId: string | null; details: string | null; createdAt: string }

export default function AuditLog() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    const t = window.setTimeout(() => {
      setLoading(true);
      api.get('/audit', { params: { q: q || undefined, limit: 500 } }).then((r) => setLogs(r.data)).catch(() => setLogs([])).finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const tone = (a: string) => (a.includes('حذف') || a.includes('فاشلة') ? 'red' : a.includes('إضافة') || a.includes('دخول') ? 'green' : a.includes('تصدير') || a.includes('تنزيل') || a.includes('نسخ') || a.includes('استعادة') ? 'orange' : 'gray');

  return (
    <div className="module-page">
      <div className="page-toolbar">
        <div>
          <span className="section-kicker">الأمان والمراجعة</span>
          <h1>سجل العمليات</h1>
          <p>من قام بأي عملية (إضافة، تعديل، حذف، تنزيل، تصدير) ومتى — آخر 500 عملية.</p>
        </div>
      </div>
      <section className="panel-card">
        <div className="filters-inline"><input placeholder="بحث بالمستخدم أو العملية أو التفاصيل..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>التاريخ والوقت</th><th>المستخدم</th><th>العملية</th><th>الكيان</th><th>التفاصيل</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5}><div className="empty-state">جاري التحميل...</div></td></tr>
                : logs.length ? logs.map((l) => (
                  <tr key={l.id}>
                    <td>{new Date(l.createdAt).toLocaleString('ar-SA')}</td>
                    <td><strong>{l.username}</strong></td>
                    <td><span className={`status-badge ${tone(l.action)}`}>{l.action}</span></td>
                    <td>{l.entity}{l.entityId ? ` #${l.entityId}` : ''}</td>
                    <td style={{ whiteSpace: 'normal', maxWidth: 420 }}>{l.details || '—'}</td>
                  </tr>
                )) : <tr><td colSpan={5}><div className="empty-state">لا توجد عمليات مسجلة</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
