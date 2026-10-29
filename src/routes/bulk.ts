import { Application, Router } from 'express';
import multer from 'multer';
import prisma from '../prisma';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { currentUser } from '../lib/auth';
import { tenantMulter } from '../lib/tenant';
import { TMP_DIR, ensureDir, tenantUploadDir, toRelative, safeFileName, mimeFromName } from '../lib/common';

export function registerBulk(app: Application) {
  const router = Router();

  // إعداد مسار مؤقت لرفع الملفات
  ensureDir(TMP_DIR);
  const upload = tenantMulter(multer({ dest: TMP_DIR }));

  // دالة مساعدة لتحويل حالة العامل من عربي إلى النظام
  const mapAttendanceStatus = (status: string) => {
    if (status === 'متغيب') return 'absent';
    if (status === 'خروج نهائي') return 'final_exit';
    return 'present'; // حاضر افتراضياً
  };

  router.post('/import-excel-with-attachments', upload.single('zipFile'), async (req, res) => {
    try {
      const excelData = JSON.parse(req.body.excelData || '[]');
      let importedEmpCount = 0;
      let importedCoursesCount = 0;
      const errors: string[] = [];

      // 1. التأكد من وجود فئة مستندات افتراضية لحفظ المرفقات فيها
      let defaultCategory = await prisma.documentCategory.findFirst();
      if (!defaultCategory) {
        defaultCategory = await prisma.documentCategory.create({
          data: { name: 'مرفقات عامة', groupName: 'عام' }
        });
      }

      // 2. معالجة الإكسيل (إنشاء/تحديث العمال والدورات)
      for (let i = 0; i < excelData.length; i++) {
        const row = excelData[i];
        try {
          // تخطي إذا لم يوجد اسم أو رقم إقامة
          if (!row.name || !row.iqamaNumber) continue;

          // البحث عن الفرع أو إنشاؤه
          const branchName = row.branchName || 'الفرع الرئيسي';
          let branch = await prisma.branch.findFirst({ where: { name: branchName } });
          if (!branch) {
            branch = await prisma.branch.create({
              data: { name: branchName, code: `BR-${Math.floor(Math.random() * 10000)}` }
            });
          }

          const jobNumber = row.jobNumber || row.iqamaNumber;

          // إنشاء أو تحديث بيانات العامل
          const empData = {
            name: row.name,
            jobNumber: jobNumber,
            nationality: row.nationality || null,
            profession: row.profession || null,
            attendanceStatus: mapAttendanceStatus(row.status),
            branchId: branch.id,
          };
          const existingEmp = await prisma.employee.findFirst({ where: { iqamaNumber: row.iqamaNumber } });
          const employee = existingEmp
            ? await prisma.employee.update({ where: { id: existingEmp.id }, data: empData })
            : await prisma.employee.create({ data: { ...empData, iqamaNumber: row.iqamaNumber, internalNumber: jobNumber, hireDate: new Date() } });
          importedEmpCount++;

          // معالجة الدورة التدريبية إن وجدت
          if (row.courseName && row.courseName !== 'لا توجد دورات مسجلة' && row.courseName !== '-') {
            let course = await prisma.course.findFirst({ where: { name: row.courseName } });
            if (!course) {
              course = await prisma.course.create({
                data: { name: row.courseName, code: `CRS-${Math.floor(Math.random() * 10000)}`, validityPeriod: 730 }
              });
            }

            let expDate = new Date();
            if (row.expiryDate && row.expiryDate !== '-') {
              // تحويل التاريخ من الإكسيل (قد يكون رقم أو نص)
              const parsedDate = new Date(row.expiryDate);
              if (!isNaN(parsedDate.getTime())) {
                expDate = parsedDate;
              }
            }

            const existingEmpCourse = await prisma.employeeCourse.findFirst({
              where: { employeeId: employee.id, courseId: course.id }
            });

            if (!existingEmpCourse) {
              await prisma.employeeCourse.create({
                data: {
                  employeeId: employee.id,
                  courseId: course.id,
                  courseDate: new Date(),
                  expiryDate: expDate,
                  notes: row.notes || null
                }
              });
              importedCoursesCount++;
            } else {
              await prisma.employeeCourse.update({
                where: { id: existingEmpCourse.id },
                data: { expiryDate: expDate, notes: row.notes || null }
              });
            }
          }
        } catch (rowErr: any) {
          errors.push(`خطأ في العامل ${row.name}: ${rowErr.message}`);
        }
      }

      // 3. معالجة ملف الـ ZIP إن وجد
      if (req.file) {
        const zipPath = req.file.path;
        
        try {
          const zip = new AdmZip(zipPath);
          const zipEntries = zip.getEntries();

          // إنشاء مجلد الوثائق الأساسي إذا لم يكن موجوداً
          const companyId = currentUser(req)!.companyId;

          for (const entry of zipEntries) {
            if (!entry.isDirectory) {
              const parts = entry.entryName.split('/'); // تقسيم المسار
              if (parts.length >= 2) {
                const folderName = parts[0]; 
                const fileName = parts[parts.length - 1];

                // استخراج رقم الإقامة من اسم المجلد
                const folderParts = folderName.split('_');
                const iqamaFromFolder = folderParts[folderParts.length - 1];

                if (iqamaFromFolder) {
                  const emp = await prisma.employee.findFirst({ where: { iqamaNumber: iqamaFromFolder } });
                  
                  if (emp) {
                    const fileData = entry.getData();
                    const ext = path.extname(fileName);
                    const savedFileName = `${emp.id}_${Date.now()}_${Math.floor(Math.random() * 1000)}${ext}`;
                    const savedFilePath = path.join(tenantUploadDir(companyId, 'employees', safeFileName(emp.jobNumber)), savedFileName);
                    
                    fs.writeFileSync(savedFilePath, fileData);

                    // ربط الملف بالعامل في قاعدة البيانات
                    await prisma.employeeDocument.create({
                      data: {
                        employeeId: emp.id,
                        categoryId: defaultCategory.id,
                        title: fileName,
                        filePath: toRelative(savedFilePath),
                        originalName: fileName,
                        mimeType: mimeFromName(fileName),
                        size: fileData.length,
                        uploadedBy: currentUser(req)?.username || null,
                      }
                    });
                  }
                }
              }
            }
          }
        } catch (zipErr: any) {
           errors.push(`خطأ أثناء معالجة ملف الـ ZIP: ${zipErr.message}`);
        } finally {
          // تنظيف الملف المؤقت
          if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
        }
      }

      res.json({
        importedEmp: importedEmpCount,
        importedCourses: importedCoursesCount,
        failed: errors.length,
        errors: errors
      });

    } catch (err: any) {
      console.error('Bulk Import Error:', err);
      res.status(500).json({ message: 'حدث خطأ داخلي في الخادم أثناء الاستيراد' });
    }
  });

  // مسار لتنظيف وترحيل الكروت المحفوظة بالخطأ كدورات في قاعدة البيانات
  router.post('/migrate-legacy-cards', async (req, res) => {
    try {
      // 1. جلب جميع الدورات المسجلة للعمال والتي كودها يبدأ بـ IMP_
      const legacyCourses = await prisma.employeeCourse.findMany({
        where: {
          course: {
            code: { startsWith: 'IMP_' }
          }
        },
        include: { course: true }
      });

      let migratedCount = 0;

      for (const ec of legacyCourses) {
        // 2. التحقق مما إذا كان الكرت موجوداً في جدول الكروت الأساسي
        let qualCard = await prisma.qualificationCard.findFirst({
          where: { code: ec.course.code }
        });

        // إذا لم يكن موجوداً، قم بإنشائه
        if (!qualCard) {
          qualCard = await prisma.qualificationCard.create({
            data: {
              code: ec.course.code,
              name: ec.course.name,
              description: 'تم ترحيله من الدورات'
            }
          });
        }

        // 3. إنشاء السجل الجديد في جدول كروت العمال
        await prisma.employeeCard.create({
          data: {
            employeeId: ec.employeeId,
            cardId: qualCard.id,
            cardNumber: ec.certificateNumber || '—',
            issueDate: ec.courseDate,
            expiryDate: ec.expiryDate,
            attachment: ec.attachment,
            notes: ec.notes,
          }
        });

        // 4. حذف السجل القديم من جدول الدورات
        await prisma.employeeCourse.delete({
          where: { id: ec.id }
        });

        migratedCount++;
      }

      res.json({ message: `تم ترحيل ${migratedCount} كرت بنجاح من قسم الدورات إلى قسم الكروت.` });
    } catch (error: any) {
      console.error('Migration Error:', error);
      res.status(500).json({ message: 'حدث خطأ أثناء ترحيل البيانات.', error: error.message });
    }
  });

  // الإبقاء على المسارات القديمة الخاصة بالاستيراد لكي لا يتعطل باقي النظام
  router.get('/', async (req, res) => {
    const jobs = await prisma.bulkImportJob.findMany({ orderBy: { id: 'desc' }, take: 10 });
    res.json(jobs);
  });

  router.delete('/:id', async (req, res) => {
    const id = Number(req.params.id);
    const job = await prisma.bulkImportJob.findUnique({ where: { id } });
    if (job?.zipPath && fs.existsSync(job.zipPath)) fs.unlinkSync(job.zipPath);
    await prisma.bulkImportJob.delete({ where: { id } });
    res.json({ message: 'Job canceled' });
  });

  // دمج الراوتر
  app.use('/api/bulk-imports', router);
}