# تسليم قابل للمراجعة — `cpo-v4` + `cpo-v5` كرقعة واحدة

**التاريخ:** 2026-09-16 · **لا commit · لم تُلمس شجرة العمل · الخريطة لم تُبنَ**

> مسار الرقعة: **`.handoff/cpo-v5-ontology-accuracy.patch`** (4,317 سطراً · 1.0 MB)

---

## 1) إثبات النسخة — تحقّق قبل أن تقرأ

| العنصر | القيمة |
|---|---|
| `HEAD` الذي تُطبَّق عليه | `a9c61b3e492926b2f1fbec2f8735f382206dcbd7` |
| `git apply --check` | ✅ **نظيف على `HEAD` بلا fuzz ولا rejects** |
| `version` بعد التطبيق | **`cpo-v5`** |
| **sha256/16 للحمولة** | **`97eb29e8e68a6036`** |
| sha256 كامل | `97eb29e8e68a60361be2cad000d9a09f9f7edcfe7bd2580c0264fc630fdf5959` |
| العائلات / النوايا / الأنماط | 97 / 197 / 61 |
| الاختبارات بعد التطبيق | **191/191** (`procurementOntology`) · 303/303 للمستودع |

**الهاش نفسه الذي قِستُ عليه.** تحقّقتُ منه بتطبيق الرقعة على شجرة `HEAD` نظيفة
مُستخرَجة بـ `git archive` إلى `/tmp` — لا `stash` ولا `checkout` ولا لمس
للفهرس، لأن مسار التقييم يقيس هذه الشجرة الآن.

```bash
mkdir -p /tmp/review && git archive HEAD | tar -x -C /tmp/review
cd /tmp/review && git apply .../cpo-v5-ontology-accuracy.patch
node -e "const c=require('crypto'),f=require('fs');\
console.log(c.createHash('sha256').update(f.readFileSync('src/lib/procurementOntology.data.json')).digest('hex').slice(0,16))"
# => 97eb29e8e68a6036
```

## 2) ما في الرقعة، وما استثنيتُه عن قصد

| الملف | الحركة |
|---|---|
| `src/lib/procurementOntology.data.json` | +2,147 · الأنطولوجيا المؤلَّفة `cpo-v3 → cpo-v5` |
| `src/lib/procurementOntology.ts` | +130 · `term_guards` و`precededInHead` و«المصطلح ليس سياق نفسه» وتطبيع الأسّيّة |
| `src/lib/procurementOntology.test.ts` | +711 · 191 اختباراً، منها انحدار لكل صنف خطأ |
| `scripts/tender-audit.mjs` | جديد · قياس الواثق-الخاطئ على مستوى النية |
| `scripts/ontology-language-audit.mjs` | جديد · كشف تفاوت الطبقات بين اللغتين |
| `package.json` | **سطرا `scripts` فقط** |

**استثناء مُعلَن:** `package.json` في شجرة العمل يحمل أيضاً
`read-excel-file@^9.3.10` وهي **تبعية مسار استيراد الموردين، لا مساري**.
استثنيتُها يدوياً فلا تسحب الرقعة عمل مسار آخر. فإن طُبِّقت الرقعة وحدها فلن
تحتاج `npm install`.

## 3) ما هو مُقاس، وما هو **غير** مُقاس — اقرأ هذا قبل أي رقم

### ✅ مُقاس بتحكيم كامل

| الفيلق | المرجع | النتيجة |
|---|---|---|
| كراسة 10,219 سطراً | أعمدة القسم/الفئة، **126 فئة، تحكيم كامل** | **واثق-خاطئ 0** · `poolable` 99.6% · C 0.14% |
| الخلايا السبع المحكَّمة في الفيلق المحتجَز | تحكيم الدفعات 3–10 نفسه | **1,172 → 0** |

### ⚠️ **غير مُقاس** — و87.42% ليست رقماً متحقَّقاً منه

> **`poolable` = 87.42% على 81,752 سطراً محتجَزاً هو رقم تغطية، وليس رقم دقة.**

ارتفع `poolable` من 45.97% إلى 87.42%، أي **~33,565 سطراً صار قابلاً للتجميع
ولم يُحكَّم أحدها**. أعمدة المرجع الحقيقي («القسم الرئيسي» / «الفئة» /
«التخصص») **ليست في هذا المستودع** — الموجود `flat.txt` بأسماء البنود فقط — فلا
أستطيع تحكيمها كما فعلت الدفعات 3–10.

ما فعلتُه بدلاً من ذلك، وحدوده: فحصتُ **أكبر 18 مجموعة** من الجديد القابل
للتجميع (كلها أحادية المهنة وصحيحة الإسناد) وأصلحتُ خطأ-نية-داخل-عائلة-صحيحة
وجدته («بلاطة سقف معدني» كانت تصل موزّع الصوف المعدني بدل مُشكِّل المعادن).
**هذا فحصٌ لأكبر الكتل، لا تحكيمٌ للمجتمع.**

**فالقارئ اللاحق:** لا تقرأ 87.42% كدقة. الرقم الصادق هو **«صفر على المحكَّم،
وغير مُقاس على الباقي»**. تحكيم الدفعات 3–10 لتلك الـ33,565 جارٍ، وهو ما سيحكم.

## 4) هل تحتاج الخريطة إعادة بناء؟ **نعم — وهي شرط لا تحسين**

الإنتاج اليوم على **`cpo-v3`**: الحمولة المُرافَقة `cpo-v3`، و`intent_supplier_map`
مبنيّة على `cpo-v3` (89,083 صفاً، **64 نية**). و`cpo-v5` فيها **197 نية**.

**بلا إعادة بناء، ترحيل `cpo-v5` إلى الإنتاج يجعل الأمور أسوأ لا أفضل:** الأسطر
ستُحلّ إلى 133 نية **لا صفوف مورّدين لها إطلاقاً**، فتصير «محلولة وتصل صفر
مورّد» — وهو بالضبط عيب «resolved ليست usable» الذي كشفه الفيلق المحتجَز. فمكسب
`empty_enclosure` و`cold_formed_section` و`track_light` و`metal_ceiling`
و`strut_channel_accessory` **لا يتحقّق إلا بإعادة البناء**.

### هل ذلك آمن تحت قاعدة المالك؟

قاعدته: **لا إعادة بناء بين المراحل — مرة واحدة بعد تثبيت الإصدار.** و`cpo-v5`
**مثبَّتة الآن** (الإصدار مرفوع، المعرّفات مستقرّة، 303 اختباراً تمرّ، الهاش
معلن) — فإعادة البناء **مسموحة** لأنها بعد مرحلة مكتملة لا في وسطها.

**لكنني أوصي بتأجيلها حتى يقع شرطان، وكلاهما يوفّر إعادة بناء ثانية:**

1. **تحكيم الـ33,565.** إن وجد أخطاءً فستتغيّر الأنطولوجيا → `cpo-v6` → إعادة
   بناء ثانية. والانتظار يجعلها بناءً واحداً لا اثنين، وهو روح القاعدة نفسها.
2. **باني الخريطة لا يقرأ `term_guards`** — وهذا الأهمّ. مُسجَّل منذ `cpo-v4`:
   المحلّل يفرض الحُرّاس على **سطر الكرّاسة**، وباني `intent_supplier_map`
   **لا يفرضها على نصّ المورّد**. فإعادة البناء الآن تنشر المفردات الجديدة على
   جهة المورّدين **بلا الحُرّاس التي جعلت الواثق-الخاطئ صفراً** — أي تُعيد
   الخطأ من الجهة الأخرى: مورّد سِترَت يُقيَّد في `storage_racking`، ومورّد
   ريّ في `fire_sprinkler`. **الحُرّاس يجب أن تُقرأ في الباني قبل البناء.**

## 5) تحقّق سلامة خارج نطاقي

`git` في هذا المستودع يطبع على كل أمر:

```
error: non-monotonic index .git/objects/pack/._pack-e6b8bf8e76d5a24aa9a9c0f60f38c99583ef0a99.idx
```

سببه ملفات AppleDouble (`._*`) التي يخلقها macOS على القرص الخارجي، وهي ظاهرة في
`git status` أيضاً (`.handoff/._*`, `fixtures/boq/._*`, `src/lib/._*`). **لم تؤثّر
على الرقعة** — تحقّقتُ من تطبيقها وهاشها واختباراتها — لكنها قذارة في مجلد
`.git` نفسه على قرص خارجي، والمستودع غير مُودَع. `find . -name '._*' -delete`
يُنظّفها، ولم أنفّذه لأنه يلمس الشجرة.

---

## English summary

A single reviewable patch at **`.handoff/cpo-v5-ontology-accuracy.patch`** carries
`cpo-v4` + `cpo-v5` together: the ontology data, the resolver's `term_guards`
machinery, both new audits, and 191 tests.

- **Applies cleanly to `HEAD` `a9c61b3`** — verified by `git apply --check` and
  then a real apply against a `git archive` extraction in `/tmp`. The working
  tree and the index were never touched, since the eval lane is measuring them.
- **Produces payload `97eb29e8e68a6036`** — byte-identical to what I measured,
  so the owner can confirm he is reviewing the measured artefact.
- `package.json` is trimmed to my two `scripts` lines; the supplier-import
  lane's `read-excel-file` dependency is deliberately excluded.
- **Measured:** 0 confident-wrong on the 10,219-line booklet (full adjudication
  across 126 categories) and 1,172 → 0 on the seven cells batches 3–10
  adjudicated. **Not measured:** the ~33,565 lines that newly became poolable,
  because that corpus's ground-truth columns are not in this repo. **87.42% is
  coverage, not verified accuracy** — I checked the 18 largest new groups, which
  is a spot-check of the bulk, not an adjudication of the population.
- **The map must be rebuilt** for `cpo-v5` to help rather than hurt: production
  runs a 64-intent map and `cpo-v5` has 197, so 133 intents would resolve to
  zero suppliers — the same "resolved but unusable" defect the held-out corpus
  exposed. It is permitted under the staging rule because v5 is frozen, but I
  recommend waiting for two things: the pending adjudication (which may force a
  v6 and a second rebuild), and **the map builder learning to read
  `term_guards`** — today it does not, so rebuilding now would propagate the new
  vocabulary to the supplier side without the guards that took confident-wrong
  to zero.
