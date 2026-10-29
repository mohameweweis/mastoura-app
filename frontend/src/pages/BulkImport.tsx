import { useEffect, useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import api from '../services/api';
import Icon from '../components/Icons';
import { useFeedback } from '../components/Feedback';

interface ExcelEmployeeRow {
  name: string;
  iqamaNumber: string;
  jobNumber: string;
  nationality: string;
  profession: string;
  branchName: string;
  status: string;
  courseName: string;
  expiryDate: string;
  notes: string;
}

interface ImportPreview {
  employeesCount: number;
  coursesCount: number;
  branchesToCreate: string[];
  parsedData: ExcelEmployeeRow[];
}

export default function BulkImport() {
  const { showToast, confirm } = useFeedback();
  const excelRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [report, setReport] = useState<{ importedEmp: number; importedCourses: number; failed: number; errors: string[] } | null>(null);

  // 1. قراءة ملف الإكسيل وتحليله محلياً قبل الإرسال
  const handleExcelChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelFile(file);
    setBusy(true);
    setPreview(null);
    setReport(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawJson = XLSX.utils.sheet_to_json(worksheet);

      const parsedData: ExcelEmployeeRow[] = rawJson.map((row: any) => ({
        name: String(row['اسم العامل'] || '').trim(),
        iqamaNumber: String(row['رقم الإقامة'] || '').trim(),
        jobNumber: String(row['الرقم الوظيفي'] || '').trim(),
        nationality: String(row['الجنسية'] || '').trim(),
        profession: String(row['المسمى الوظيفي'] || '').trim(),
        branchName: String(row['الفرع'] || '').trim(),
        status: String(row['الحالة'] || '').trim(),
        courseName: String(row['اسم الدورة'] || '').trim(),
        expiryDate: String(row['تاريخ الانتهاء'] || '').trim(),
        notes: String(row['ملاحظات'] || '').trim(),
      })).filter(r => r.name && r.iqamaNumber); // تجاهل الصفوف الفارغة

      // استخراج إحصائيات المعاينة
      const uniqueEmployees = new Set(parsedData.map(r => r.iqamaNumber));
      const validCourses = parsedData.filter(r => r.courseName && r.courseName !== 'لا توجد دورات مسجلة' && r.courseName !== '-');
      const uniqueBranches = Array.from(new Set(parsedData.map(r => r.branchName).filter(Boolean)));

      setPreview({
        employeesCount: uniqueEmployees.size,
        coursesCount: validCourses.length,
        branchesToCreate: uniqueBranches,
        parsedData
      });

    } catch (error) {
      showToast('تعذر قراءة ملف الإكسيل. تأكد من تطابق أسماء الأعمدة.', 'error');
    } finally {
      setBusy(false);
    }
  };

  // 2. إرسال البيانات إلى الخادم
  const commit = async () => {
    if (!preview || preview.parsedData.length === 0) return;
    
    const ok = await confirm({ 
      title: 'تأكيد الاستيراد', 
      message: `سيتم تأسيس بيانات ${preview.employeesCount} عامل و ${preview.coursesCount} دورة تدريبية. هل تريد المتابعة؟`, 
      confirmLabel: 'بدء الاستيراد', 
      danger: false 
    });
    
    if (!ok) return;
    
    setBusy(true);
    setReport(null);
    try {
      // إرسال بيانات الإكسيل مع ملف الـ ZIP إن وجد
      const formData = new FormData();
      formData.append('excelData', JSON.stringify(preview.parsedData));
      if (zipFile) {
        formData.append('zipFile', zipFile);
      }

      // سنحتاج لإنشاء مسار جديد في الباك إند لاستقبال هذه البيانات
      const res = await api.post(`/bulk-imports/import-excel-with-attachments`, formData, { timeout: 0 });
      
      setReport(res.data);
      setPreview(null);
      setExcelFile(null);
      setZipFile(null);
      showToast('تمت عملية الاستيراد', 'success');

    } catch (e: any) {
      showToast(e?.response?.data?.message || 'حدث خطأ أثناء الاستيراد في الخادم', 'error');
    } finally { 
      setBusy(false); 
    }
  };

  const cancel = () => {
    setPreview(null);
    setExcelFile(null);
    setZipFile(null);
    setReport(null);
  };

  return (
    <div className="module-page">
      <div className="page-toolbar">
        <div>
          <span className="section-kicker">إدارة البيانات الشاملة</span>
          <h1>الاستيراد الجماعي للعمال والدورات</h1>
          <p>قم برفع ملف Excel الخاص بسجل العمال لإنشاء الحسابات وتحديث الدورات، واختيارياً ارفع ملف ZIP يحتوي على مجلدات المرفقات بصيغة <b>الاسم_رقم الإقامة</b>.</p>
        </div>
      </div>

      {!preview && (
        <section className="panel-card" style={{ padding: 22 }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
            {/* بطاقة الإكسيل */}
            <div className="bulk-drop" onClick={() => excelRef.current?.click()} style={{ borderColor: '#10b981', background: '#ecfdf5' }}>
              <Icon name="report" size={30} />
              <strong style={{ color: '#047857' }}>{excelFile ? excelFile.name : '1. اضغط لاختيار ملف الإكسيل (مطلوب)'}</strong>
              <small>سجل_العمال.xlsx</small>
              <input ref={excelRef} type="file" accept=".xlsx,.xls" hidden onChange={handleExcelChange} />
            </div>

            {/* بطاقة الـ ZIP */}
            <div className="bulk-drop" onClick={() => zipRef.current?.click()}>
              <Icon name="upload" size={30} />
              <strong>{zipFile ? zipFile.name : '2. اضغط لاختيار ملف ZIP (اختياري للمرفقات)'}</strong>
              <small>{zipFile ? `${(zipFile.size / 1048576).toFixed(1)} ميجابايت` : 'مجلدات العمال المجمعة'}</small>
              <input ref={zipRef} type="file" accept=".zip" hidden onChange={(e) => setZipFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          
          {busy && <div style={{ marginTop: 20, textAlign: 'center' }}><Icon name="spinner" size={24} className="spin" /> جاري معالجة الملف...</div>}
        </section>
      )}

      {preview && (
        <section className="panel-card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 16px' }}>معاينة البيانات قبل الحفظ</h3>
          <div className="summary-tiles">
            <div className="summary-tile"><span>العمال المراد استيرادهم</span><strong style={{ color: '#1f8b5f' }}>{preview.employeesCount}</strong></div>
            <div className="summary-tile"><span>الدورات المراد تسجيلها</span><strong style={{ color: '#2563eb' }}>{preview.coursesCount}</strong></div>
            <div className="summary-tile"><span>الفروع المكتشفة</span><strong>{preview.branchesToCreate.length}</strong></div>
            <div className="summary-tile"><span>ملف المرفقات (ZIP)</span><strong style={{ color: zipFile ? '#1f8b5f' : '#94a3b8' }}>{zipFile ? 'مرفق ومقترن' : 'لم يتم إرفاقه'}</strong></div>
          </div>
          
          <div className="table-wrap" style={{ maxHeight: 300, overflowY: 'auto', marginTop: '20px' }}>
            <table className="data-table">
              <thead><tr><th>العامل</th><th>الإقامة / الوظيفي</th><th>المهنة</th><th>الفرع</th><th>الدورة</th></tr></thead>
              <tbody>
                {preview.parsedData.slice(0, 100).map((row, idx) => (
                  <tr key={idx}>
                    <td><strong>{row.name}</strong></td>
                    <td>{row.iqamaNumber} / {row.jobNumber}</td>
                    <td>{row.profession}</td>
                    <td>{row.branchName}</td>
                    <td style={{ fontSize: '12px' }}>{row.courseName !== 'لا توجد دورات مسجلة' && row.courseName !== '-' ? row.courseName : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.parsedData.length > 100 && <div style={{ textAlign: 'center', padding: '10px', color: '#64748b' }}>تم إخفاء باقي الصفوف لتسريع العرض...</div>}
          </div>
          
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button className="ghost-button" onClick={cancel} disabled={busy}>إلغاء</button>
            <button className="primary-button" onClick={commit} disabled={busy}>
              {busy ? 'جارٍ الاستيراد في قاعدة البيانات...' : `تأكيد واستيراد ${preview.employeesCount} عامل`}
            </button>
          </div>
        </section>
      )}

      {report && (
        <section className="panel-card" style={{ padding: 20, marginTop: 16 }}>
          <h3 style={{ margin: '0 0 10px' }}>نتيجة الاستيراد النهائي</h3>
          <div className="summary-tiles">
            <div className="summary-tile"><span>عمال تم حفظهم/تحديثهم</span><strong style={{ color: '#1f8b5f' }}>{report.importedEmp}</strong></div>
            <div className="summary-tile"><span>دورات تم تسجيلها</span><strong style={{ color: '#2563eb' }}>{report.importedCourses}</strong></div>
            <div className="summary-tile"><span>فشلت</span><strong style={{ color: '#d3394c' }}>{report.failed}</strong></div>
          </div>
          {report.errors && report.errors.length > 0 && <ul style={{ color: '#b45a64', fontSize: 12, marginTop: 10 }}>{report.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}</ul>}
        </section>
      )}
    </div>
  );
}