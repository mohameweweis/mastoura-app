// dashboard.js
import { auth, db } from "./firebase.js";
import { signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";

// عناصر HTML
const logoutBtn = document.getElementById("logoutBtn");
const addWorkerForm = document.getElementById("addWorkerForm");
const workersTableBody = document.querySelector("#workersTable tbody");
const searchInput = document.getElementById("searchInput");
const courseFilter = document.getElementById("courseFilter");
const addCourseBtn = document.getElementById("addCourseBtn");
const coursesContainer = document.getElementById("courses-container");

// تحقق تسجيل الدخول
auth.onAuthStateChanged(user => {
  if (!user) {
    window.location.href = "index.html";
  }
});

// تسجيل خروج
logoutBtn.addEventListener("click", () => {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
});

// إضافة حقل دورة جديدة
// إضافة دورة جديدة مع حقل رفع الملف
addCourseBtn.addEventListener("click", () => {
  const newCourseEntry = document.createElement("div");
  newCourseEntry.classList.add("course-entry");
  newCourseEntry.innerHTML = `
    <input type="text" name="courseName" placeholder="اسم الدورة" required />
    <input type="date" name="expiryDate" required />
    <label>ملف الدورة:</label>
    <input type="file" name="courseFile" accept=".pdf,image/*" required />
  `;
  coursesContainer.appendChild(newCourseEntry);
});

// جمع الدورات من النموذج
async function getCourses() {
  const storage = getStorage();
  const courses = [];
  const courseEntries = coursesContainer.querySelectorAll(".course-entry");

  for (const entry of courseEntries) {
    const courseName = entry.querySelector('input[name="courseName"]').value.trim();
    const expiryDate = entry.querySelector('input[name="expiryDate"]').value;
    const fileInput = entry.querySelector('input[name="courseFile"]');
    const file = fileInput.files[0];

    if (!courseName || !expiryDate || !file) {
      alert("يرجى تعبئة جميع حقول الدورة وتحميل الملف");
      return [];
    }

    // رفع الملف
    const fileRef = ref(storage, `courses/${Date.now()}_${file.name}`);
    await uploadBytes(fileRef, file);
    const fileURL = await getDownloadURL(fileRef);

    courses.push({
      courseName,
      expiryDate,
      fileURL,
    });
  }

  return courses;
}

// تنظيف النموذج بعد إضافة/تعديل
function clearForm() {
  addWorkerForm.reset();
  coursesContainer.innerHTML = `
    <div class="course-entry">
      <input type="text" name="courseName" placeholder="اسم الدورة" required />
      <input type="date" name="expiryDate" required />
    </div>
  `;
}

// تحميل العمال وعرضهم في الجدول مع تطبيق البحث والفلترة
async function loadWorkers() {
  workersTableBody.innerHTML = "";
  const searchTerm = searchInput.value.trim();
  const selectedCourse = courseFilter.value;

  // جلب كل العمال (يمكن تحسينه لاحقًا بالفلترة من قاعدة البيانات)
  const querySnapshot = await getDocs(collection(db, "workers"));
  let workers = [];
  querySnapshot.forEach(docSnap => {
    const w = docSnap.data();
    w.id = docSnap.id;
    workers.push(w);
  });

  // فلترة محلية حسب البحث
  if(searchTerm) {
    workers = workers.filter(w =>
      w.idNumber.includes(searchTerm) ||
      w.jobNumber.includes(searchTerm)
    );
  }

  // فلترة حسب الدورة
  if(selectedCourse) {
    workers = workers.filter(w => 
      w.courses.some(c => c.courseName === selectedCourse)
    );
  }

  // عرض كل عامل
  workers.forEach(worker => addWorkerToTable(worker));
}

// عرض عامل في الجدول
function addWorkerToTable(worker) {
  const tr = document.createElement("tr");

  // حساب الحالة: منتهية، قاربت على الانتهاء (قبل 30 يوم)، أو صالحة
  const today = new Date();
  let statusTexts = worker.courses.map(course => {
    const expiry = new Date(course.expiryDate);
    const diffDays = (expiry - today) / (1000 * 3600 * 24);
    if(diffDays < 0) return `${course.courseName}: منتهية`;
    if(diffDays <= 30) return `${course.courseName}: قاربت على الانتهاء`;
    return `${course.courseName}: صالحة`;
  }).join(" | ");

  // دمج الدورات وتواريخها
  const coursesList = worker.courses.map(c => `${c.courseName} (${c.expiryDate})`).join(", ");

  tr.innerHTML = `
    <td>${worker.name}</td>
    <td>${worker.idNumber}</td>
    <td>${worker.jobNumber}</td>
    <td>${worker.jobTitle}</td>
    <td>${coursesList}</td>
    <td></td>
    <td>${worker.branch}</td>
    <td>${statusTexts}</td>
    <td>
      <button class="editBtn" data-id="${worker.id}">✏️</button>
      <button class="deleteBtn" data-id="${worker.id}">🗑️</button>
    </td>
  `;

  workersTableBody.appendChild(tr);

  // ربط الأزرار
  tr.querySelector(".deleteBtn").addEventListener("click", () => deleteWorker(worker.id));
  tr.querySelector(".editBtn").addEventListener("click", () => editWorker(worker));
}

// حذف عامل
async function deleteWorker(id) {
  if(!confirm("هل أنت متأكد من حذف العامل؟")) return;
  await deleteDoc(doc(db, "workers", id));
  loadWorkers();
}

// تعديل عامل - عرض بياناته في النموذج
async function editWorker(worker) {
  document.getElementById("name").value = worker.name;
  document.getElementById("iqama").value = worker.idNumber;
  document.getElementById("jobNumber").value = worker.jobNumber;
  document.getElementById("jobTitle").value = worker.jobTitle;
  document.getElementById("branch").value = worker.branch;

  // مسح الدورات القديمة وإضافة دورات العامل
  coursesContainer.innerHTML = "";
  worker.courses.forEach(c => {
    const div = document.createElement("div");
    div.classList.add("course-entry");
    div.innerHTML = `
      <input type="text" name="courseName" placeholder="اسم الدورة" required value="${c.courseName}" />
      <input type="date" name="expiryDate" required value="${c.expiryDate}" />
    `;
    coursesContainer.appendChild(div);
  });

  // تعديل زر الإضافة ليصبح زر حفظ التعديل
  addWorkerForm.querySelector("button[type='submit']").textContent = "حفظ التعديل";

  // إلغاء المستمع السابق لتجنب التكرار
  addWorkerForm.removeEventListener("submit", addWorkerSubmitHandler);

  // أضف مستمع جديد لحفظ التعديل
  addWorkerForm.addEventListener("submit", updateWorkerSubmitHandler);

  // حافظ على ID العامل الجاري تعديله
  addWorkerForm.dataset.editingId = worker.id;
}

// معالج إرسال النموذج لإضافة عامل جديد
async function addWorkerSubmitHandler(e) {
  e.preventDefault();

  const name = document.getElementById("name").value.trim();
  const iqama = document.getElementById("iqama").value.trim();
  const jobNumber = document.getElementById("jobNumber").value.trim();
  const jobTitle = document.getElementById("jobTitle").value.trim();
  const branch = document.getElementById("branch").value.trim();
  const courses = await getCourses();

  const courseFile = document.getElementById("courseFile").files[0];
  const iqamaFile = document.getElementById("iqamaFile").files[0];

  if (!courseFile || !iqamaFile) {
    alert("يرجى اختيار صورة الدورة وصورة الإقامة");
    return;
  }

  if (!name || !iqama || !jobNumber || !jobTitle || !branch || courses.length === 0) {
    alert("يرجى تعبئة جميع الحقول وإضافة دورة واحدة على الأقل");
    return;
  }

  try {
    const storage = getStorage();

    // رفع صورة الدورة
    const courseFileRef = ref(storage, `courses/${Date.now()}_${courseFile.name}`);
    await uploadBytes(courseFileRef, courseFile);
    const courseFileURL = await getDownloadURL(courseFileRef);

    // رفع صورة الإقامة
    const iqamaFileRef = ref(storage, `iqama/${Date.now()}_${iqamaFile.name}`);
    await uploadBytes(iqamaFileRef, iqamaFile);
    const iqamaFileURL = await getDownloadURL(iqamaFileRef);

    // إنشاء بيانات العامل
    const newWorkerData = {
      name,
      idNumber: iqama,
      jobNumber,
      jobTitle,
      branch,
      courses,
      courseFileURL,
      iqamaFileURL
    };

    await addDoc(collection(db, "workers"), newWorkerData);
    alert("تم إضافة العامل بنجاح");
    clearForm();
    loadWorkers();
  } catch (error) {
    alert("خطأ في إضافة العامل: " + error.message);
  }
}

// معالج إرسال النموذج لحفظ تعديل عامل
async function updateWorkerSubmitHandler(e) {
  e.preventDefault();

  const editingId = addWorkerForm.dataset.editingId;
  if(!editingId) return;

  const name = document.getElementById("name").value.trim();
  const iqama = document.getElementById("iqama").value.trim();
  const jobNumber = document.getElementById("jobNumber").value.trim();
  const jobTitle = document.getElementById("jobTitle").value.trim();
  const branch = document.getElementById("branch").value.trim();

  const courses = getCourses();

  if(!name || !iqama || !jobNumber || !jobTitle || !branch || courses.length === 0) {
    alert("يرجى تعبئة جميع الحقول وإضافة دورة واحدة على الأقل");
    return;
  }

  const updatedWorkerData = {
    name,
    idNumber: iqama,
    jobNumber,
    jobTitle,
    branch,
    courses,
  };

  try {
    await updateDoc(doc(db, "workers", editingId), updatedWorkerData);
    alert("تم حفظ التعديل بنجاح");
    clearForm()
document.getElementById("courseFile").value = "";
document.getElementById("iqamaFile").value = "";
;
    loadWorkers();

    // إعادة زر الإضافة
    addWorkerForm.querySelector("button[type='submit']").textContent = "إضافة";

    // إزالة خاصية تعديل ID
    delete addWorkerForm.dataset.editingId;

    // استبدال المستمع ليعود لإضافة عامل جديد
    addWorkerForm.removeEventListener("submit", updateWorkerSubmitHandler);
    addWorkerForm.addEventListener("submit", addWorkerSubmitHandler);
  } catch (error) {
    alert("خطأ في حفظ التعديل: " + error.message);
  }
}

// ربط معالج الإضافة عند بدء التشغيل
addWorkerForm.addEventListener("submit", addWorkerSubmitHandler);

// ربط البحث والفلترة
searchInput.addEventListener("input", loadWorkers);
courseFilter.addEventListener("change", loadWorkers);

// تحميل العمال عند بدء التشغيل
loadWorkers();
// أزرار التصدير
const exportPDFBtn = document.getElementById("exportPDF");
const exportExcelBtn = document.getElementById("exportExcel");

// تصدير PDF باستخدام jsPDF + autotable
exportPDFBtn.addEventListener("click", () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // إعداد الأعمدة التي نريد عرضها
  const columns = [
    "الاسم",
    "رقم الإقامة",
    "الرقم الوظيفي",
    "الوظيفة",
    "الدورات",
    "الفرع",
    "الحالة",
  ];

  // جمع بيانات الصفوف من الجدول
  const rows = [];
  document.querySelectorAll("#workersTable tbody tr").forEach(tr => {
    const row = [];
    tr.querySelectorAll("td").forEach((td, i) => {
      // استثناء عمود الإجراءات (آخر عمود)
      if(i < columns.length) {
        row.push(td.innerText.trim());
      }
    });
    rows.push(row);
  });

  doc.text("تقرير بيانات العمال", 14, 15);
  doc.autoTable({
    head: [columns],
    body: rows,
    startY: 20,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [0, 76, 153] },
  });

  doc.save("workers_report.pdf");
});

// تصدير Excel باستخدام SheetJS
exportExcelBtn.addEventListener("click", () => {
  const wb = XLSX.utils.book_new();

  // جمع بيانات الجدول (رؤوس الأعمدة)
  const headers = [];
  document.querySelectorAll("#workersTable thead th").forEach((th, i) => {
    if(i < 7) headers.push(th.innerText.trim()); // نفس الأعمدة بدون إجراءات
  });

  // جمع بيانات الصفوف
  const data = [];
  document.querySelectorAll("#workersTable tbody tr").forEach(tr => {
    const row = [];
    tr.querySelectorAll("td").forEach((td, i) => {
      if(i < 7) row.push(td.innerText.trim());
    });
    data.push(row);
  });

  // إنشاء ورقة عمل
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  XLSX.utils.book_append_sheet(wb, ws, "العمال");

  // تنزيل ملف Excel
  XLSX.writeFile(wb, "workers_report.xlsx");
});
