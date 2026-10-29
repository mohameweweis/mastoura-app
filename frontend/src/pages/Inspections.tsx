import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Icon from '../components/Icons';

interface Inspection {
  id: number;
  inspectionType: string;
  inspectionDate: string;
  expiryDate: string;
  certificateNumber: string | null;
  result: string;
}
interface Equipment {
  id: number;
  equipmentNumber: string;
  type: { name: string };
  branch: { name: string };
  inspections: Inspection[];
}

function daysLeft(date: string) {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

export default function Inspections() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'expired' | 'soon' | 'valid'>('all');

  useEffect(() => {
    api.get('/equipment').then((res) => setEquipment(res.data)).catch(() => setEquipment([])).finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    const all = equipment.flatMap((eq) => eq.inspections.map((insp) => ({ ...insp, equipmentNumber: eq.equipmentNumber, typeName: eq.type.name, branchName: eq.branch.name })));
    return all
      .filter((r) => {
        const days = daysLeft(r.expiryDate);
        if (filter === 'expired') return days < 0;
        if (filter === 'soon') return days >= 0 && days <= 30;
        if (filter === 'valid') return days > 30;
        return true;
      })
      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
  }, [equipment, filter]);

  const counts = useMemo(() => {
    const all = equipment.flatMap((eq) => eq.inspections);
    return {
      total: all.length,
      expired: all.filter((r) => daysLeft(r.expiryDate) < 0).length,
      soon: all.filter((r) => { const d = daysLeft(r.expiryDate); return d >= 0 && d <= 30; }).length,
    };
  }, [equipment]);

  return (
    <div className="module-page">
      <div className="page-toolbar">
        <div>
          <span className="section-kicker">السلامة والامتثال</span>
          <h1>فحوصات المعدات</h1>
          <p>نظرة شاملة على كل سجلات الفحص الدوري لكل المعدات المسجلة في النظام.</p>
        </div>
        <Link to="/equipment" className="ghost-button"><Icon name="truck" size={17} /> إدارة المعدات</Link>
      </div>

      <div className="summary-tiles">
        <div className="summary-tile"><span>إجمالي الفحوصات</span><strong>{counts.total}</strong></div>
        <div className="summary-tile"><span>فحوصات منتهية</span><strong>{counts.expired}</strong></div>
        <div className="summary-tile"><span>تنتهي خلال 30 يوم</span><strong>{counts.soon}</strong></div>
      </div>

      <section className="panel-card">
        <div className="pill-tabs">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>الكل</button>
          <button className={filter === 'expired' ? 'active' : ''} onClick={() => setFilter('expired')}>منتهية</button>
          <button className={filter === 'soon' ? 'active' : ''} onClick={() => setFilter('soon')}>تنتهي قريباً</button>
          <button className={filter === 'valid' ? 'active' : ''} onClick={() => setFilter('valid')}>سارية</button>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>رقم المعدة</th><th>النوع</th><th>الفرع</th><th>نوع الفحص</th><th>تاريخ الانتهاء</th><th>النتيجة</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}><div className="empty-state">جاري التحميل...</div></td></tr>
              ) : rows.length > 0 ? rows.map((r) => {
                const days = daysLeft(r.expiryDate);
                const tone = days < 0 ? 'red' : days <= 30 ? 'orange' : 'green';
                return (
                  <tr key={r.id}>
                    <td><span className="code-pill">{r.equipmentNumber}</span></td>
                    <td>{r.typeName}</td>
                    <td>{r.branchName}</td>
                    <td><strong>{r.inspectionType}</strong></td>
                    <td><span className={`status-badge ${tone}`}><span className="status-dot" />{new Date(r.expiryDate).toLocaleDateString('ar-SA')}</span></td>
                    <td><span className={`status-badge ${r.result === 'pass' ? 'green' : 'red'}`}>{r.result === 'pass' ? 'ناجح' : 'راسب'}</span></td>
                  </tr>
                );
              }) : <tr><td colSpan={6}><div className="empty-state">لا توجد فحوصات مسجلة</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
