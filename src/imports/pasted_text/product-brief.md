Design and build a complete end-to-end responsive product experience for:

فرق للبناء — Farq Construction

LANGUAGE:
Arabic first.
RTL throughout the entire application.
Desktop + mobile responsive.
All primary UI copy must be in Arabic.
Use English only for technical identifiers when unavoidable.

==================================================
PRODUCT VISION
==================================================

فرق للبناء is not a supplier directory.

It is an intelligent RFQ procurement system for contractors.

The core promise is:

"ارفع الكراسة، وفرق يجد الموردين، ثم أرسل طلب التسعير."

The contractor should NEVER feel they are operating a supplier database,
building packages,
configuring routing,
or manually constructing an RFQ.

Farq does the complexity in the background.

The contractor only makes decisions.

==================================================
NON-NEGOTIABLE PRIMARY FLOW
==================================================

Creating an RFQ must visibly contain ONLY 3 steps:

1. ارفع الكراسة
2. الموردون المقترحون
3. إرسال الطلب

Display these 3 steps in a very simple progress header.

DO NOT add a fourth step.

DO NOT create separate screens for:
- تجهيز الطلب
- تقسيم الحزم
- مراجعة الدعوة
- قائمة الموردين
- سجل الموردين
- قاعدة بيانات فرق
- اختيار القسم
- supplier directory
- package builder
- supplier-first selection
- RFQ configuration wizard

All those concepts, if technically needed, happen silently in the background.

==================================================
TARGET USER
==================================================

Primary user:
موظف مشتريات أو مهندس في شركة مقاولات.

The experience must work for someone who wants to:

1. Upload a tender / BOQ.
2. See what Farq understood.
3. Immediately see suppliers for every item.
4. Adjust only when necessary.
5. Send RFQs.
6. Wait for quotes.
7. Compare offers.
8. Approve an award.

The same employee should be able to complete the entire journey.

==================================================
DESIGN PRINCIPLES
==================================================

1. Decision-first, not database-first.
2. Product/BOQ line first, supplier second.
3. Automation by default.
4. Progressive disclosure.
5. Never show operational complexity unless required.
6. Every screen must have one obvious primary CTA.
7. Mobile must feel native and simple.
8. Avoid dashboards overloaded with cards.
9. Avoid dense enterprise ERP styling.
10. No visual clutter.
11. Arabic typography must be extremely readable.
12. Important data should be visible without opening drawers.
13. Use whitespace aggressively.
14. Do not make the user understand system terminology.

==================================================
BRAND / VISUAL LANGUAGE
==================================================

Use the existing Farq visual direction.

Brand feel:
- premium Saudi B2B technology
- calm
- trustworthy
- intelligent
- minimal

Primary dark green:
deep Farq green similar to #123F3A

Secondary mint:
soft Farq mint similar to #CFF5DC

Background:
white / very light warm neutral

Warning:
soft amber background

Error:
soft red / muted red

Success:
mint / green

Typography:
Arabic-first modern sans serif.
Strong hierarchy.
Large Arabic headings.
Comfortable line height.

Cards:
large radius
light borders
almost no shadows
generous padding

Avoid:
- excessive gradients
- heavy shadows
- neon styling
- generic SaaS blue
- tiny text
- excessive pills
- too many tabs

==================================================
GLOBAL APP SHELL
==================================================

Desktop:
Right-side or top-level navigation appropriate for RTL.

Mobile:
compact header.

Header contains:
فرق | بناء

Company/account icon.
الوارد / responses.
Optional notifications.

Main navigation after user has RFQs:
الرئيسية
طلبات التسعير
العروض
الموردون (management only, never part of RFQ creation flow)
الإعدادات

Do NOT expose "الموردون" as a step during RFQ creation.

==================================================
SCREEN 01 — HOME
==================================================

Create an extremely simple contractor home screen.

Hero:

"سوّم كراستك في دقائق"

Supporting text:

"ارفع كراسة الشروط والمواصفات، ونقرأ البنود ونقترح الموردين المناسبين لكل بند."

PRIMARY CTA:

"رفع كراسة جديدة"

Large upload zone:

PDF
Excel

Secondary area beneath:
آخر طلبات التسعير

Show a few recent RFQs:
- اسم المشروع
- عدد البنود
- عدد العروض
- الحالة
- آخر تحديث

Do not overload this screen.

==================================================
STEP 1 — UPLOAD BOQ
==================================================

Screen title:

"ارفع الكراسة"

Upload area should dominate the screen.

CTA:
"اختر ملفًا"

Support:
PDF / Excel

After selecting:

Show file:
كراسة مشروع مجمع الرياض.pdf

File size.

Immediate processing state:

"فرق يقرأ الكراسة…"

Use an elegant progress experience.

Show understandable stages, but not technical jargon:

✓ فتح الملف
✓ قراءة البنود
✓ فهم المواصفات
● البحث عن الموردين

Do NOT make the user wait on a blank spinner.

If some pages finish earlier, progressively show progress:

"تم التعرف على 37 من 65 بندًا"

Then:

"تمت قراءة الكراسة"

Example summary:

65 بندًا قابلًا للتوريد
4 بنود تحتاج مراجعة
بدأ فرق البحث عن الموردين

Primary action:

"عرض الموردين المقترحين"

Prefer automatic transition after a brief success state.

==================================================
BOQ EXTRACTION RULE
==================================================

Farq should extract and retain:

- رقم البند
- اسم البند
- الوصف
- الكمية
- الوحدة
- المواصفات
- البراند if specified
- model if specified
- category/family internally
- delivery requirements where available

BUT:

Do not force the user to review every extracted field before continuing.

Allow correction inline later.

==================================================
STEP 2 — SUPPLIER PROPOSALS
==================================================

This is the most important screen in the product.

Title:

"الموردون المقترحون"

Subtitle:

"قرأ فرق 65 بندًا واقترح الموردين المناسبين لكل بند."

Top summary:

65 بندًا
58 جاهزة للإرسال
7 يبحث فرق عنها

Optional filter row:

الكل
جاهز
يحتاج موردين

Search:
"ابحث في البنود…"

IMPORTANT:

The entire screen is PRODUCT-FIRST.

Never show a giant supplier list first.

==================================================
BOQ LINE CARD
==================================================

Every BOQ item gets one card.

Example:

13
بورسلان أرضيات
5,600 م²

Optional specification line:
60×60 سم · لون حسب اعتماد الاستشاري

Then:

"وجد فرق 14 موردًا"

Below show supplier recommendations.

Initially render the best 4–6 suppliers.

Example:

☑ الخزف السعودي
دليل مباشر
الرياض
بريد إلكتروني

☑ شركة البيت الحديث
نشاط ومادة متطابقان
واتساب

☑ مورد الخليج
دليل منتج

Then:

"عرض جميع الموردين (14)"

IMPORTANT:
The database may contain 100+ eligible suppliers.
Do NOT render 100 cards immediately.

Store and retain all qualified suppliers,
but progressively disclose them.

==================================================
SUPPLIER SELECTION BEHAVIOR
==================================================

All strongly qualified suppliers should be selected automatically.

The buyer can:
- uncheck one supplier
- select all
- clear selections for THIS item

Controls:

"تحديد الكل"

Never make supplier selection mandatory one-by-one.

==================================================
SUPPLIER EVIDENCE
==================================================

Show a small confidence/evidence label:

"دليل مباشر"
"مطابقة فئة محددة"
"اختيارك"

Do NOT show complex scores like:
83%
72 confidence
taxonomy grade

Hide internal ranking language.

If evidence is weak/review-only:
do not auto-select the supplier.

==================================================
SEARCH FOR A SPECIFIC SUPPLIER
==================================================

At the top of EVERY line card:

Search field:

"ابحث عن مورد لهذا البند…"

This search must remain INSIDE the BOQ item.

Typing:

"الخزف"

Results:

الخزف السعودي
الرياض
+ أضفه لهذا البند

If the supplier exists in Farq:
add it directly to the current line.

If Farq does not have evidence that the supplier sells the item:

show:

"اختيارك"

and small explanation:

"أضفته أنت لهذا البند."

Do NOT pretend Farq has verified that relationship.

==================================================
NO SUPPLIER FOUND
==================================================

If Farq has not found enough suppliers:

Card state:

"فرق يبحث عن موردين"

Example:

باب زجاجي سحاب
7 عدد

"وجدنا موردًا واحدًا حتى الآن"

Then:
search field remains available.

User does not have to fix it.

NEVER block the entire RFQ because one item lacks suppliers.

==================================================
GLOBAL SUPPLIER SUMMARY
==================================================

Sticky footer:

"58 بندًا جاهزًا · 92 موردًا"

Primary CTA:

"إرسال طلب التسعير"

If there are unresolved items:

"7 بنود سيواصل فرق البحث عنها ولن تُرسل الآن."

Do not use error styling for this.
It is an informational state.

==================================================
ABSOLUTELY REMOVE FROM THIS FLOW
==================================================

Never show:

"حسب المادة"
"قائمة الموردين"
"البحث في قاعدة بيانات فرق"
"سجل الموردين"
"استعراضهم"
"راجع تقسيم طلبك"
"تقسيم الحزم"
"مراجعة الدعوة"
"جهز الطلب"
"تحديد القسم الهندسي"
"Supplier Directory"
"Supplier Registry"
"SupplierMultiLineOffer"

There should never be a second mental model:

supplier → items

inside this flow.

Only:

item → suppliers.

==================================================
STEP 3 — SEND
==================================================

Clicking:

"إرسال طلب التسعير"

should NOT navigate to another giant review page.

Open a clean confirmation sheet/modal.

Title:

"جاهز للإرسال"

Summary:

58 بندًا
92 موردًا
7 بنود سيواصل فرق البحث عنها

Delivery:
الرياض

Quote deadline:
16 سبتمبر 2026

Tiny editable link:
"تعديل الموعد"

Primary CTA:

"إرسال الآن"

Secondary:
"إلغاء"

==================================================
SEND RULES
==================================================

Each supplier receives ONLY the BOQ lines assigned to them.

Supplier A must never see unrelated items.

Farq internally handles:
- line routing
- packages
- invitation generation
- communication channel
- supplier-specific BOQ

Do not expose these mechanics to the buyer.

==================================================
SUCCESS SCREEN
==================================================

After send:

Large success state.

"تم إرسال طلب التسعير"

Subtitle:

"أرسل فرق 58 بندًا إلى 92 موردًا."

Status summary:

تم الإرسال بالبريد: 61
جاهز للواتساب: 24
قيد الإرسال: 7

Primary CTA:

"متابعة العروض"

Secondary:
"العودة للرئيسية"

==================================================
POST-SEND — RFQ DETAIL
==================================================

After sending, creation flow is finished.

Now enter RFQ management.

Header:

طلب تسعير
مشروع مجمع الرياض

Status:
بانتظار العروض

Top metrics:

65 بندًا
92 موردًا
18 ردًا
7 عروض مكتملة

Deadline:
16 سبتمبر

Progress bar:

18 / 92 موردًا ردوا

==================================================
RFQ DETAIL TABS
==================================================

Only after sending, tabs are acceptable.

Use:

نظرة عامة
البنود
العروض
الموردون
السجل

==================================================
BIDS / QUOTES INBOX
==================================================

Create an "العروض" screen.

Show supplier responses:

الخزف السعودي
12 بندًا
إجمالي العرض: 184,500 ر.س
مدة التوريد: 14 يوم
الشحن: مشمول
الحالة: مكتمل

Supplier B:
10 من 12 بندًا
عرض جزئي

Supplier C:
بانتظار استكمال الأسعار

Primary action:

"مقارنة العروض"

==================================================
LINE-BY-LINE COMPARISON
==================================================

This is Farq's decision layer.

Header:

"مقارنة العروض"

For each BOQ item:

بورسلان أرضيات
5,600 م²

Offers:

الخزف السعودي
31.50 ر.س / م²
176,400 ر.س
14 يوم
التوصيل مشمول

شركة X
29.80 ر.س / م²
166,880 ر.س
21 يوم
التوصيل + 4,000

شركة Y
33.00 ر.س / م²
184,800 ر.س
7 أيام
التوصيل مشمول

Calculate:

السعر النهائي
الشحن
الضرائب when available
landed cost

Highlight:
"الأقل تكلفة"

but do NOT call it winner automatically.

==================================================
NORMALIZATION
==================================================

Comparison must normalize:

unit price
UOM
quantity
shipping
fees
tax if provided
delivery time

If quotes are not comparable:

show:

"العرض يحتاج مراجعة"

Do not fabricate comparison.

==================================================
AWARD WORKSPACE
==================================================

After comparison:

"اختيار العرض"

Allow contractor to award:
- all items to one supplier
OR
- different items to different suppliers

Show live summary:

القيمة الإجمالية
عدد الموردين
عدد البنود
التوفير مقابل أعلى عرض

Require award reason:

سبب الاختيار

Examples:
أفضل سعر
أسرع توريد
مورد معتمد
أفضل قيمة
سبب آخر

If only one quote exists:

show:

"عرض وحيد"

require:
"مبرر الترسية"

==================================================
AWARD APPROVAL
==================================================

Confirmation:

"اعتماد الترسية"

Supplier:
الخزف السعودي

Items:
12

Commitment:
184,500 ر.س

Reason:
أفضل قيمة

CTA:

"اعتماد الترسية"

==================================================
AWARD SUCCESS
==================================================

"تم اعتماد الترسية"

Show:

المورد
القيمة
البنود
سبب الاختيار
التاريخ
من اعتمد القرار

Maintain audit trail.

==================================================
AUDIT LOG
==================================================

Create simple timeline:

تم رفع الكراسة
قرأ فرق 65 بندًا
تم اختيار الموردين
تم إرسال RFQ
استلم عرض من المورد X
تم فتح العروض
تم اختيار المورد
تم اعتماد الترسية

Timestamp + user.

==================================================
SUPPLIER EXPERIENCE
==================================================

Create supplier-facing responsive page accessed through secure link.

NO ACCOUNT REQUIRED.

Header:
فرق للبناء

"طلب تسعير جديد"

Project:
مشروع مجمع الرياض

Deadline:
16 سبتمبر 2026

Show ONLY the items assigned to this supplier.

Table/card:

البند
الكمية
الوحدة
المواصفات
سعر الوحدة
مدة التوريد

Supplier can:

1. Enter prices directly.
2. Upload PDF.
3. Upload Excel.
4. Add notes.
5. Confirm delivery.
6. Submit.

CTA:

"إرسال العرض"

==================================================
SUPPLIER QUOTE FORM
==================================================

For each line:

بورسلان أرضيات
5,600 م²

سعر الوحدة:
[ ]

الضريبة:
[ ]

مدة التوريد:
[ ]

متوفر:
نعم / حسب الطلب

Optional:
ملاحظات

At bottom:

تكلفة التوصيل
مدة صلاحية العرض
شروط الدفع

==================================================
SUPPLIER SUBMIT SUCCESS
==================================================

"تم استلام عرضك"

Reference number.

"يمكنك العودة إلى هذا الرابط لتحديث العرض حتى موعد الإغلاق."

After deadline:
editing locked.

==================================================
RFQ DEADLINE
==================================================

Before close:
supplier can edit.

After close:
lock edits.

Show:

"أُغلق استقبال العروض"

Buyer can then open offers.

==================================================
MOBILE EXPERIENCE
==================================================

Design all screens for mobile first.

The BOQ supplier screen must work extremely well on an iPhone.

Do not create wide tables requiring horizontal scrolling.

Use cards.

Sticky CTA at bottom.

Example:

58 بندًا جاهزًا
[ إرسال طلب التسعير ]

The sticky area must never cover content.

==================================================
EMPTY STATES
==================================================

No RFQs:
"ابدأ بأول كراسة"

No supplier yet:
"فرق يبحث الآن عن موردين لهذا البند."

No quote:
"لم يصل عرض بعد."

No comparable quotes:
"نحتاج عرضين قابلين للمقارنة قبل إظهار فرق السعر."

==================================================
ERROR STATES
==================================================

Upload failed:
"تعذر قراءة الملف"
CTA:
"إعادة المحاولة"

One page failed:
do not discard the entire tender.

Supplier matching failed:
keep extracted BOQ visible.

Communication failed:
show exact supplier/channel failure,
do not pretend the RFQ was delivered.

==================================================
PERFORMANCE FEEL
==================================================

The UI must feel immediate.

Use:
skeleton states
progressive extraction
optimistic selection
background matching

Never show a dead spinner for a long operation.

==================================================
ACCESSIBILITY
==================================================

Minimum tap target:
44px

High contrast.

Correct RTL order.

Visible focus states.

No meaning conveyed by color alone.

==================================================
DEMO DATA
==================================================

Build the prototype using realistic Saudi construction examples:

Project:
تجديد مبنى إداري — الرياض

BOQ:

1. بورسلان أرضيات — 5,600 م²
2. سيراميك حوائط — 976 م²
3. حديد تسليح — 770 طن
4. كابلات نحاسية — 2,210 م ط
5. لوحات توزيع — 12 عدد
6. وحدات إنارة — 1,460 عدد
7. ألواح جبسوم بورد — 1,750 م²
8. عازل بيتومين — 2,100 م²
9. خرسانة جاهزة C40 — 4,265 م³
10. باب زجاجي سحاب — 7 عدد

Use realistic supplier examples:
الخزف السعودي
كابلات الرياض
سيكا
مصنع محلي للجبس
مورد الخرسانة
شركة لوحات كهربائية

==================================================
FIGMA MAKE OUTPUT
==================================================

Create an interactive clickable prototype.

Build reusable components for:

Button
Input
Upload zone
Step header
BOQ line card
Supplier row
Supplier evidence badge
Supplier search result
Status badge
RFQ card
Quote card
Comparison row
Award card
Empty state
Error state
Bottom sticky CTA
Modal
Toast

Use Auto Layout everywhere.

Create responsive variants:
Mobile 390px
Tablet
Desktop 1440px

==================================================
CORE SCREENS TO GENERATE
==================================================

Generate complete high-fidelity screens for:

01 Login / company access
02 Construction home
03 Upload BOQ
04 Parsing/progress
05 Supplier proposals by BOQ line
06 Expanded BOQ line with many suppliers
07 Search supplier inside a line
08 Item with no qualified supplier yet
09 Send confirmation
10 RFQ sent success
11 RFQ overview
12 Offers inbox
13 Offer detail
14 Line-by-line comparison
15 Award selection
16 Award approval
17 Award success
18 Audit log
19 Supplier secure RFQ link
20 Supplier quote entry
21 Supplier upload PDF/Excel
22 Supplier submitted success
23 RFQ closed state
24 Mobile versions of the key primary screens

==================================================
MOST IMPORTANT ACCEPTANCE TEST
==================================================

A new contractor must be able to do this without explanation:

Open Farq Construction
→ upload tender PDF
→ wait while Farq reads it
→ immediately see every BOQ item with suggested suppliers underneath
→ optionally search for a specific supplier inside a line
→ press "إرسال طلب التسعير"
→ confirm
→ done.

No supplier directory.
No package setup.
No extra review screen.
No database exploration.
No hidden mandatory step.

The creation journey must visually feel like:

الكراسة
↓
الموردون
↓
الإرسال

Everything else is automation.

==================================================
FINAL PRODUCT FEEL
==================================================

When a contractor sees the product for the first time, the reaction should be:

"أنا فقط أرفع الكراسة، وفرق يسوي الباقي."

Not:

"لازم أتعلم نظام مشتريات جديد."

Build the complete prototype around that principle.