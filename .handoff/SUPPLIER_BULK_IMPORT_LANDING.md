# رفع قائمة الموردين — ما الذي يجب أن ينزل معًا

للوكيل المسؤول عن **الإيداع والنشر**. لم أُودع شيئًا بنفسي.

---

## 0. خلاصة عاجلة

`main` (الإيداع `0ef8b2d`) يحمل نسخة **جزئية** من هذه الميزة، لكنها **خاملة تمامًا** — لا يصل إليها المستخدم ولا تُحمَّل في الحزمة. لا يوجد خطأ يظهر للمالك اليوم، ولا حاجة إلى إصلاح عاجل.

لكن **ترتيب النزول حرج**: إذا نزلت واجهة الرفع قبل الـ API، ستتحول شاشة «معاينة فقط — لم يُحفظ أي شيء بعد» إلى استيراد حقيقي صامت. التفاصيل في القسم 3.

---

## 1. ما الذي يحتويه `0ef8b2d` فعليًا

الإيداع التقط لقطة من ملفاتي أثناء العمل في 12:46. الملفات المكتملة فيه:

| الملف | الحالة في `0ef8b2d` |
|---|---|
| `src/lib/supplierImportCsv.ts` + `.test.ts` | كامل ويعمل |
| `src/components/SupplierImportModal.tsx` | كامل (CSV فقط) |
| `src/api/constructionClient.ts` | كامل — `dryRunSupplierImport` / `commitSupplierImport` / `listSupplierImportBatches` / `revertSupplierImportBatch` موجودة |
| `src/api/constructionSuppliers.ts` | كامل — `import_batch_id` مُمرَّر |
| `src/types.ts` | كامل |
| `src/views/SupplierManagementView.tsx` | **ناقص** — الاستيرادات موجودة في الأسطر 5-9، وجسم الواجهة غائب |

**الملف الناقص الوحيد هو `SupplierManagementView.tsx`**: يستورد `SupplierImportModal` و`listSupplierImportBatches` و`revertSupplierImportBatch` ثم لا يستعملها. الغائب: زر «رفع قائمة»، شرائح تصفية الدفعات، شارة «مرفوع» على الصفوف، زر التراجع، وعرض المكوّن نفسه.

### هل هو معطوب أم خامل فقط؟ — **خامل**، وقد تحققت من ذلك بالقياس:

- `npx tsc --noEmit` على الإيداع نفسه: **ينجح**. (`noUnusedLocals` غير مفعّل، فالاستيرادات غير المستعملة لا تكسر البناء.)
- `npx vite build` على الإيداع نفسه: **ينجح**.
- `<SupplierImportModal` لا يظهر في أي ملف في الشجرة المُودعة — المكوّن لا يُعرض أبدًا.
- نص الواجهة «رفع قائمة موردين» **غير موجود** في الحزمة المبنية من الإيداع، وموجود في حزمة شجرتي الكاملة. أي أن هزّ الشجرة أزاله بالكامل.
- لا يوجد نداء لـ `listSupplierImportBatches`، فلا طلبات 404 عند التحميل.

**الخلاصة: كود ميت يُبنى بنجاح ويُزال من الحزمة. لا يراه المالك ولا يؤثر على شيء.** مقبول أن يبقى حتى ينزل التغيير كاملًا.

---

## 2. ما الذي يجب أن ينزل معًا

### أ) الواجهة — مستودع Figma Make (هذا المستودع)

جديد:
- `src/lib/supplierImportSheet.ts` — مفردات الأعمدة وبناء الصفوف، مشتركة بين CSV و‏xlsx
- `src/lib/supplierImportSheet.test.ts` — 18 اختبارًا
- `src/lib/supplierImportExcel.ts` — قارئ `.xlsx` واختيار ورقة العمل
- `scripts/verify-supplier-import.mjs` — تحقق شامل (تطوير فقط)
- `scripts/make-supplier-xlsx-fixture.mjs` — توليد ملف الاختبار (تطوير فقط)
- `fixtures/suppliers/messy-supplier-list.csv` و‏`.xlsx` (تطوير فقط)

معدّل:
- `src/views/SupplierManagementView.tsx` — **جسم الواجهة الناقص. هذا هو الملف الحاسم.**
- `src/components/SupplierImportModal.tsx` — مسار xlsx، مُنتقي الأوراق، تمرير `row_number`
- `src/lib/supplierImportCsv.ts` — صار يفوّض إلى `supplierImportSheet`
- `src/api/constructionClient.ts` — **سطران فقط مني**: حقل `row_number?: number` في `SupplierImportInput`
- `package.json` — إضافة `read-excel-file@^9.3.10` (+ `package-lock.json`)

> **تنبيه:** شجرة العمل تحتوي أيضًا على عمل وكلاء آخرين غير تابع لي — حدّ المعدّل في `constructionClient.ts`، وتنحيف الحمولة في `constructionSuppliers.ts`، و`InboxView.tsx`، و`procurementOntology*`. لا تُدرجها ضمن هذه الميزة دون الرجوع إلى أصحابها.

### ب) الـ API — مستودع `~/farq` (كلها غير مُودعة)

جديد:
- `api/db/migrations/construction/20260916140000_construction_supplier_import_batches.sql`
- `supabase/migrations/20260916140000_construction_supplier_import_batches.sql` (نسخة)
- `api/lib/construction/supplier-import.js` — التطبيع والمطابقة والتخطيط
- `api/tests/construction-supplier-import.test.js` — 11 اختبارًا

معدّل:
- `api/lib/construction/supabase-repository.js` — `dry_run`، الدفعات، النتائج لكل صف
- `api/lib/construction/memory-repository.js` — نفس السلوك للاختبارات
- `api/lib/construction/repository-contract.js` — الطريقتان الجديدتان
- `api/routes/construction.js` — `GET /suppliers/import-batches` و`POST /suppliers/import-batches/:id/revert`

---

## 3. ترتيب النزول — غير قابل للتفاوض

```
1. ترحيل قاعدة البيانات   (supplier_import_batches + suppliers.import_batch_id)
2. الـ API                (المستودعات + المسارات)
3. الواجهة                (SupplierManagementView + البقية)
```

**السبب — وهذا ليس احتياطًا نظريًا، تحققت منه:**

الـ API المُودع حاليًا **لا يقرأ `dry_run` إطلاقًا** (`git show HEAD:api/lib/construction/supabase-repository.js | grep dry_run` ← لا شيء). فهو يتجاهل الحقل ويستورد فعليًا.

لو نزلت الواجهة قبل الـ API:

- المالك يختار ملفًا، فتعرض الشاشة «معاينة فقط — لم يُحفظ أي شيء بعد»، **بينما الصفوف تُكتب في الدليل فعلًا**. هذا بالضبط عكس الغرض الذي بُنيت الميزة من أجله.
- الصفوف المكتوبة **لن تحمل `import_batch_id`**، فلا يمكن التراجع عنها دفعةً واحدة — بين 11,737 موردًا.
- `GET /suppliers/import-batches` يعيد 404، فتختفي شرائح الدفعات بصمت.

النزول بالترتيب الصحيح يجعل كل ذلك غير ممكن. أما نزول الـ API قبل الواجهة فآمن تمامًا: نقاط النهاية الجديدة تبقى بلا مستدعٍ.

---

## 4. حالة الاختبارات عند التسليم

- الواجهة: `npx vitest run` ← **224/224 ناجح**، `tsc --noEmit` نظيف، `vite build` ينجح
- الـ API: `construction-supplier-import.test.js` ← **11/11**، `construction-local-runtime.test.js` ← **21/21**
- الإخفاقات الثماني السابقة في `construction-local-runtime.test.js` **لم تعد موجودة** — كانت بسبب بوابة الأدوار و`supplierScopeValidation`، وقد اكتمل عمل الوكيلين الآخرين
- تحقق حي مقابل API يعمل: نفس الصفوف التسعة بصيغتي CSV و‏xlsx ← **2 مُضاف / 3 مطابق / 4 مرفوض** في الحالتين، وحمولتا الطلب متطابقتان بايتًا ببايت
- بيانات الاختبار أُزيلت بالكامل من قاعدة البيانات الحية (0 دفعات، 0 موردين موسومين بدفعة)

---

## 5. إضافة لاحقة — إصلاح عرض حدّ المحاولات في `SupplierManagementView.tsx`

**ينزل مع دفعة بوابة حدّ السرعة، لا بعدها.** ملف واحد فقط: `src/views/SupplierManagementView.tsx`.
لا يعتمد على الـ API ولا على قاعدة البيانات — آمن في أي ترتيب، وكلما نزل أبكر كان أفضل.

### ما كان يحدث
حدّ سرعة مؤقّت (60 ثانية) كان يُعرض للمالك على أنه **قاعدة بيانات معطّلة وكتالوج فارغ**:
عنوان «تعذر الاتصال…»، فقرة تطلب ضبط `CONSTRUCTION_DB_URL`، وعدّاد «٠ مورد في كتالوج فرق».

### ما تغيّر
- `loadPage`: عند `constructionRateLimitSec(err) != null` لا نمسح `suppliers` / `total` — القائمة تبقى.
- صندوق الخطأ: عنوان «تجاوزنا حد المحاولات» بلون كهرماني، وإخفاء فقرة `CONSTRUCTION_DB_URL` (مطابقةً لما فُعل في `InboxView`).
- العدّاد: لم يعد يؤكد رقمًا لم يُقرأ. `totalKnown` جديد ← «تعذّرت قراءة عدد الموردين» بدل «٠ مورد»، وهذا يصلح **كل** أنواع الفشل لا حدّ السرعة وحده.
- قائمة الصفوف: كانت محجوبة بـ `!error`، فالصفوف المحفوظة لم تكن تُعرض. صارت `(!error || suppliers.length > 0)`.
- `loadBatches`: لم يعد يمسح شرائح الدفعات عند فشل القراءة.

### التحقق (متصفح حقيقي، لا استنتاج من الكود)
| الحالة | العدّاد | العنوان | `CONSTRUCTION_DB_URL` | الصفوف |
|---|---|---|---|---|
| طبيعي | ١١٬٧٢٧ مورد في كتالوج فرق | — | مخفي | 200 |
| حدّ سرعة والقائمة معروضة | ١١٬٧٢٧ … · آخر قراءة ناجحة | تجاوزنا حد المحاولات | مخفي | **200 (باقية)** |
| حدّ سرعة على تحميل بارد (429 من الخادم الحقيقي) | تعذّرت قراءة عدد الموردين | تجاوزنا حد المحاولات | مخفي | 0 |
| 503 `CONSTRUCTION_PERSISTENCE_UNAVAILABLE` | تعذّرت قراءة عدد الموردين | تعذر الاتصال ببيانات الموردين الحقيقية | **ظاهر** | 0 |

`npx vitest run` ← 259/259، `tsc --noEmit` نظيف.
