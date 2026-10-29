import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Icon from '../components/Icons';

interface AlertItem {
  key: string; type: string; typeLabel: string; title: string; owner: string; expiryDate: string; daysLeft: number; status: 'expired' | 'soon';
}

export default function Alerts() {
  const [items, setItems] = useState<AlertItem[]>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'all' | 'expired' | 'soon'>('all');
  const [type, setType] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get('/alerts').then((res) => { setItems(res.data.items); setDays(res.data.days); }).catch(() => setItems([])).finally(() => setLoading(false));
  }, []);

  const types = useMemo(() => [...new Map(items.map((i) => [i.type, i.typeLabel])).entries()], [items]);
  const filtered = useMemo(
    () => items.filter((i) => (status === 'all' || i.status === status) && (type === 'all' || i.type === type) && (!search || i.owner.includes(search) || i.title.includes(search))),
    [items, status, type, search],
  );
  const expired = items.filter((i) => i.status === 'expired').length;

  return (
    <div className="module-page">
      <div className="page-toolbar">
        <div>
          <span className="section-kicker">المتابعة الاستباقية</span>
          <h1>تنبيهات انتهاء الصلاحية</h1>
          <p>الدورات والكروت والرخص والإقامات والتصاريح والفحوصات المنتهية أو التي تنتهي خلال {days} يوماً (يمكن تغيير المدة من الإعدادات).</p>
        </div>
        <button className="ghost-button no-print" onClick={() => window.print()}><Icon name="report" size={17} /> طباعة / PDF</button>
      </div>

      <div className="summary-tiles">
        <div className="summary-tile"><span>إجمالي التنبيهات</span><strong>{items.length}</strong></div>
        <div className="summary-tile"><span>منتهية</span><strong style={{ color: '#d3394c' }}>{expired}</strong></div>
        <div className="summary-tile"><span>تنتهي خلال {days} يوم</span><strong style={{ color: '#b3740c' }}>{items.length - expired}</strong></div>
      </div>

      <section className="panel-card">
        <div className="filters-inline no-print">
          <input placeholder="بحث بالاسم أو البند..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">كل الأنواع</option>
            {types.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
            <option value="all">كل الحالات</option>
            <option value="expired">منتهية</option>
            <option value="soon">تنتهي قريباً</option>
          </select>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>النوع</th><th>البند</th><th>صاحب البند</th><th>تاريخ الانتهاء</th><th>الأيام المتبقية</th><th>الحالة</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6}><div className="empty-state">جاري التحميل...</div></td></tr>
                : filtered.length ? filtered.map((i) => (
                  <tr key={i.key}>
                    <td><span className="code-pill">{i.typeLabel}</span></td>
                    <td><strong>{i.title}</strong></td>
                    <td>{i.owner}</td>
                    <td>{new Date(i.expiryDate).toLocaleDateString('ar-SA')}</td>
                    <td>{i.daysLeft < 0 ? `منذ ${Math.abs(i.daysLeft)} يوم` : `${i.daysLeft} يوم`}</td>
                    <td><span className={`status-badge ${i.status === 'expired' ? 'red' : 'orange'}`}><span className="status-dot" />{i.status === 'expired' ? 'منتهي' : 'ينتهي قريباً'}</span></td>
                  </tr>
                )) : <tr><td colSpan={6}><div className="empty-state">لا توجد تنبيهات 🎉</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
