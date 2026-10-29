import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

export interface PickerEmployee {
  id: number; name: string; jobNumber: string; profession?: string | null; attendanceStatus?: string | null;
  branch?: { id: number; name: string } | null;
}

const attLabel: Record<string, string> = { present: 'حاضر', absent: 'متغيب', final_exit: 'خروج نهائي' };

// قائمة اختيار عمال متعددة مع بحث وفلتر فرع
export default function EmployeePicker({
  selected, onChange, allowedIds, hideFinalExit = true, height = 280,
}: { selected: number[]; onChange: (ids: number[]) => void; allowedIds?: number[]; hideFinalExit?: boolean; height?: number }) {
  const [all, setAll] = useState<PickerEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [branch, setBranch] = useState('all');

  useEffect(() => {
    api.get('/employees').then((r) => setAll(r.data)).catch(() => setAll([])).finally(() => setLoading(false));
  }, []);

  const pool = useMemo(
    () => all.filter((e) => (!allowedIds || allowedIds.includes(e.id)) && (!hideFinalExit || e.attendanceStatus !== 'final_exit')),
    [all, allowedIds, hideFinalExit],
  );
  const branches = useMemo(() => [...new Map(pool.filter((e) => e.branch).map((e) => [e.branch!.id, e.branch!.name])).entries()], [pool]);
  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return pool.filter((e) => (branch === 'all' || String(e.branch?.id) === branch)
      && (!term || e.name.toLowerCase().includes(term) || e.jobNumber.toLowerCase().includes(term) || (e.profession || '').toLowerCase().includes(term)));
  }, [pool, q, branch]);

  const set = new Set(selected);
  const toggle = (id: number) => onChange(set.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const allVisibleSelected = visible.length > 0 && visible.every((e) => set.has(e.id));
  const toggleVisible = () => onChange(allVisibleSelected ? selected.filter((id) => !visible.some((e) => e.id === id)) : [...new Set([...selected, ...visible.map((e) => e.id)])]);

  return (
    <div className="picker">
      <div className="filters-inline" style={{ marginBottom: 8 }}>
        <input placeholder="بحث بالاسم أو الرقم الوظيفي أو المهنة..." value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
        <select value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="all">كل الفروع</option>
          {branches.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>
      <div className="picker-bar">
        <label><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} /> تحديد الظاهر ({visible.length})</label>
        <strong>المحدد: {selected.length}</strong>
      </div>
      <div className="picker-list" style={{ maxHeight: height }}>
        {loading ? <div className="empty-state">جاري التحميل...</div>
          : visible.length ? visible.map((e) => (
            <label key={e.id} className={`picker-row ${set.has(e.id) ? 'on' : ''}`}>
              <input type="checkbox" checked={set.has(e.id)} onChange={() => toggle(e.id)} />
              <span className="picker-name">{e.name}</span>
              <small>{e.jobNumber} · {e.profession || '—'} · {e.branch?.name || '—'}</small>
              {e.attendanceStatus && e.attendanceStatus !== 'present' && <span className="status-badge orange">{attLabel[e.attendanceStatus] || e.attendanceStatus}</span>}
            </label>
          )) : <div className="empty-state">لا يوجد عاملون مطابقون</div>}
      </div>
    </div>
  );
}
