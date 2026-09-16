# مسار الرفع في الإنتاج، والبند الضائع، والمواصفات المفقودة — 16 سبتمبر 2026

## الخلاصة أولًا

**شاشة المالك ليست هذا المستودع.** `farq.sa` يقدّم `~/farq/Frontend`
(`src/pages/ConstructionPage.tsx`)، لا `UploadView.tsx` الذي أصلحناه. فإطلاق
رقعتنا وحدها **لا يغيّر شيئًا في ما يراه**.

ثلاث حقائق مقيسة على نفس الكراسة المرجعية (حفر الباطن، 47 صفحة، 68 بندًا):

| القارئ | البنود | الكمية والوحدة | نص المواصفات | الزمن |
|---|---|---|---|---|
| قارئ الإنتاج المحلي (`constructionBoqLocalPdf.ts`) | **67 من 68** | صحيحة في الـ67 كلها | **صفر من 67** | 320 مللي |
| قارئ الأعمدة (هذه الرقعة) | **68 من 68** | صحيحة في الـ68 كلها | 66 من 68 (من الـAPI) | 248 مللي |
| قارئ الخادم `POST /boq/parse-pdf` | 69 صفًا | صحيحة، لكن أرقام البنود تنزاح +1 | **69 من 69** | 11 مللي |

## 1. الإنتاج يقرأ الأعمدة بالفعل — لكنه يُسقط بندًا واحدًا بصمت

قارئ الإنتاج ليس فيه العطل الذي أصلحناه: هو يقرأ الأعمدة بالإحداثيات، ويطبّع
النص العربي، ويقرأ الرمز الإنشائى. الاسم والكمية والوحدة **ورقم البند** صحيحة
في الـ67 صفًا التي يخرجها — تحقّقنا صفًا صفًا مقابل قارئ الأعمدة.

لكنه يُسقط بندًا واحدًا بلا أي إشارة:

```
#23 «طبقة عازلة للرطوبة أفقية ورأسية من البيتومين الساخن» = 110 م²
```

وهذه بالضبط حالة **الخلية الملتفّة**: البند يمتد على ثلاثة صفوف بصرية وكميته في
الصف الأوسط. قارئ الأعمدة في هذه الرقعة يقرأها؛ قارئ الإنتاج يتخطّاها.

الضرر ليس في قيمة خاطئة — لا توجد قيمة خاطئة — بل في أن **قراءة ناقصة تُعرض
كاملة**: 67 من 68 بلا أي عدّاد نقص، وهو المحظور الذي حوّل هذا العطل أصلًا إلى
طلبات شراء خاطئة بدل خطأ ظاهر. المالك لن يشتري عزل البيتومين لأنه لا يعرف أنه
سقط.

## 2. «لا توجد مواصفات إضافية» — الكراسة فيها مواصفات، والإنتاج لا يقرأها

الجملة التي رآها المالك على كل صف موجودة في
`Frontend/src/pages/ConstructionPage.tsx` كنص بديل حين تكون المواصفة فارغة. وهي
فارغة في **كل** صفوف الإنتاج (صفر من 67).

والكراسة **ليست** بلا مواصفات. جدول الكميات لا يطبع عمود مواصفات — النص الفني في
قسم منفصل بعده بصفحات (صفحات 36–43) — والخادم يقرأ ذلك القسم ويربطه بالبند:

```
«بوابة لمدخل الافراد»        → بوابة لمدخل الافراد مقاس 2×1.50متر
«باب زجاجي سحاب (منزلق)»     → باب سحاب من الزجاج نموذج (ب1) مقاس 1.50 × 3.00 م
«قواطع زجاج سيكوريت»         → زجاج سكوريت لزوم الاقواطع الزجاجية الداخلية
```

فهذه خسارة حقيقية، لأن المواصفة هي ما يجعل المطابقة محدّدة — ولاحقة الأداء أثبتت
أن إسقاطها يحوّل `ppr-pipes` إلى `pvc-pipe`: مادة أخرى وموردون آخرون.

في هذه الرقعة صار نص المواصفات يُلحق بصفوف قارئ الأعمدة (66 من 68)، ويُرسل مع
طلب المطابقة (`spec: line.spec`). الصفّان الباقيان اسمهما واحد
(«بردورات خرسانة» بكميتين مختلفتين)، فرفض الدمج التخمين.

## 3. البطء ليس في القراءة

القراءة المحلية في الإنتاج **320 مللي ثانية** لكراسة 47 صفحة. وطلب الخادم لا
يحجب الشاشة: الإنتاج يقرأ محليًا أولًا ويبثّ البنود إلى السلة أثناء القراءة
(«أُضيف N بند من القراءة المحلية…»)، ولا يلجأ إلى الخادم إلا إذا لم يجد شيئًا أو
بدت الكراسة ممسوحة — وحينها في الخلفية بـ`void`.

فمصدر البطء الذي أبلغ عنه المالك في مكان آخر من ذلك الملف — أرجح المرشّحين
`enrichBoqRowsInBackground` و`searchFarqDirectoryForLines` بعد القراءة. لم نفحصه:
الملف ليس في نطاقنا، ونرفع هذا لصاحب اللاحقة بدل تخمين السبب.

## 4. قارئ الخادم لا يحمل العطل — لكن أرقام بنوده تنزاح

`POST /api/construction/boq/parse-pdf` صار يقرأ الكراسة قراءة صحيحة في **11 مللي
ثانية**، مع نص المواصفات وموقع التوريد ومراجع الصفحات. وتحقّقنا أنه يقرأ فعلًا
ولا يطابق ملفًا محفوظًا: بحذف الصفحة 30 هبط العدد من 69 إلى 52 وانزاحت أرقام صفحات
المواصفات بواحد.

لذلك **لا حاجة لإصلاح قارئ الخادم** — وهذا يوفّر يومًا كاملًا كان سيُصرف عليه.

عيبه الوحيد أن صفوفه تضم صفًا تجميعيًا من صفحة 27 يحمل رقم البند 1، فيتعارض مع
«درابزين حديدي» ويزيح كل بند بعده بواحد داخل `rowsToLines`. لذلك هذه الرقعة تأخذ
**الأرقام والكميات من قارئ الأعمدة** و**النص من الخادم**، ولا تعتمد على أرقام
الخادم إطلاقًا. القارئان يتفقان على **الكميات الـ68 كلها**، وهو تحقّق متبادل
مستقل.

## ما نوصي به للإنتاج

1. **عدّاد نقص في `ConstructionPage.tsx`**: أي قراءة تُخرج عددًا أقل من الترقيم
   المطبوع في الكراسة يجب أن تقول ذلك برقم. هذا أهم من إصلاح البند نفسه.
2. **حالة الخلية الملتفّة** في `constructionBoqLocalPdf.ts` — البند #23 حالة
   اختبار جاهزة، والمنطق في `src/lib/boqPdfTable.ts` في هذه الرقعة.
3. **نص المواصفات**: الخادم يعيده في العمود الرابع؛ الإنتاج يطرحه. إلحاقه بشرط
   اتفاق الاسم والكمية (كما في `withApiSpecs`) يعيد المواصفة إلى 66 من 68 صفًا.

الملفان `src/lib/boqPdfTable.ts` و`src/lib/parseBoq.ts` في الرقعة يحملان المنطق
جاهزًا للنقل؛ والحالات المسمّاة (#23 الملتفّ، #43/#44 المدموجان مع الأمبير،
الترويسة المكرّرة) مغطاة في `src/lib/boqPdfTable.test.ts`.

---

# English summary

**The owner's production upload does not run this repository's code.** `farq.sa`
serves `~/farq/Frontend` (`ConstructionPage.tsx`); the patch we are handing over
changes `UploadView.tsx`. Shipping it alone changes nothing on his screen.

Measured on the reference Etimad booklet (47 pages, 68 items):

- **Production's own local reader gets 67 of 68**, with name, quantity, unit and
  item number all correct. It silently drops item **#23**
  («طبقة عازلة للرطوبة أفقية ورأسية من البيتومين الساخن» = 110 م²) — the
  wrapped-cell case, quantity on the middle of three visual rows. No shortfall
  is reported, so a partial read presents as complete. That is the
  non-negotiable, violated in production today. It is a missing item, not a
  wrong value.
- **Production carries no specification text at all** (0 of 67), which is why
  every row reads «لا توجد مواصفات إضافية». The booklet does have technical
  specifications — in a separate section, pages 36–43 — and the API returns them
  for all 69 rows. This is a real loss: the specification is what makes matching
  specific.
- **Slowness is not the read.** Production's local read is 320ms. It parses
  locally first, streams items into the basket as it goes, and only calls the
  server for scans, in the background. The cost is downstream of parsing —
  `enrichBoqRowsInBackground` / `searchFarqDirectoryForLines` are the likely
  candidates. Not investigated: not our file.
- **The server parser does not have the defect.** 11ms, correct values, plus
  specification text and page cross-references. Confirmed to be genuinely
  parsing, not matching a stored fixture: removing page 30 drops it from 69 to
  52 items and shifts its specification page references by one. **No server-side
  fix is needed** — that day of work can be skipped. Its only flaw is that a
  page-27 aggregate row collides on item number 1 and shifts every later number
  by one, so the patch takes numbers and values from the column reader and only
  the text from the API. The two readers agree on all 68 quantities.

The owner's specific values are correct as printed in the booklet: item #6
«قواطع زجاج سيكوريت» = 480 م² and item #5 «باب سيكوريت» = 25 عدد — adjacent
rows, different units, independently confirmed by both readers.

Recommended for production, in order: a shortfall counter in
`ConstructionPage.tsx`; the wrapped-cell case in `constructionBoqLocalPdf.ts`;
and attaching the API's specification text under a name-and-quantity agreement
rule. The logic for all three is in `src/lib/boqPdfTable.ts` and
`src/lib/parseBoq.ts` in the patch, with the named hazards covered in
`src/lib/boqPdfTable.test.ts`.
