# حكم `cpo-v8`: جدول التحكيم المشترك · اختبار جانب العرض · حكم السقّاطة — 2026-09-16

**التحقق:** `payload = 03fc7b2251bd6762` ✅ · `resolver = ad285bc1b648b3a7` ✅ · `cpo-v8` · سكربت الأصل يعيد بناء النسختين ويثبّت الشجرة على v8.
**الأرشيفات المحجوزة:** تطابق **SHA256 لكامل الملف** v7 → v8 على الفيلقين (`6b36a5f38fed9008` و `58e6be7dbffa7579`) — **183,942 صفًا، صفر سطر مختلف**. فصفر انحدار على امتداد v6→v7→v8، بالهوية لا بالادعاء.
**الكراسة:** A **38 = 55.88%** · B **30** · C **0**. تغيّرت **أربعة أسطر فقط** عن v7، وهي **بالضبط** الأربعة التي اعترضتُ عليها، وثلاثتها الأولى إلى النية التي سمّيتها. **الخطأ الواثق 0.00% ✅ مؤكَّد بحكمي المستقل.**

---

## 1) جدول التحكيم المشترك — والخلاف **سطرٌ واحد مُسمّى**

الخلاف كله (64/68 مقابل 63/68 في v7، و100% مقابل قياسي في v8) يرجع إلى **سطر واحد بعينه**: **#22**. فلا فجوتان مجهولتان، بل واحدة مُسمّاة.

### جانبي من الجدول: **v7 = 63/68 · v8 = 67/68 = 98.53%** (لا 100%)

| # | السطر | v8 | حكمي | سببي |
|---|---|---|---|---|
| 31 | بلوك اسمني مفرغ | `concrete_block` A | ✅ مكتمل (كان نقصًا في v7) | النية موجودة وصار يبلغها |
| 32 · 44 | قاطع 32 امبير | `mcb` A | ✅ مكتمل (كان نقصًا) | 32A داخل 60898 |
| 43 | قاطع 100 امبير | `mccb` A | ✅ مكتمل (كان نقصًا) | 100A داخل 60947-2 |
| **22** | **خشب لعزل جدران** | **`None/None` B@0.4 · `poolable=false`** | 🔴 **نقص، لا سقف** | أدناه |
| 12 · 13–17 · 19 | دهان · سيراميك/بورسلان/تيرازو/وزرة | عائلة فقط | ✅ سقف حقيقي | **لا توجد أي نية** دهانات ولا بورسلان ولا سيراميك ولا تيرازو |
| 59 | صمام | `valves` | ✅ سقف | السطر عام؛ الموجود `control_valve` وليس المقصود |
| 64 | خزان مياه | `water_tanks` | ✅ سقف | لا نية خزانات |
| 57 | صندوق حريق | `fire_fighting` | ✅ سقف | لا نية خزانة خرطوم |
| 46 · 47 | نظام تأريض · وحدات إنارة | عائلة | ✅ سقف | السطر يسمّي نظامًا/فئة، لا جهازًا |
| 2 · 3 · 7 | بوابات · باب معدني | `industrial_doors` | ✅ سقف | لا نية أخصّ |
| 4 · 10 | باب زجاجي سحاب · منور سقفي | عائلة | ✅ سقف | — |
| 23 · 24 · 25 | البيتومين ×3 | `waterproofing` | ✅ سقف | لا نية بيتومين |
| 33 | حديد تسليح للخرسانة المسلحة | `rebar_mesh` | ✅ سقف | العائلة صحيحة؛ `welded_mesh` ليس المقصود |
| 42 | كابلات نحاسية | `power_cables` | ✅ سقف | النحاس لا يحدّد الجهد |
| 50–52 · 55 · 58 | أنابيب ×5 | `pipes_fittings` | ✅ سقف | الخدمة ليست منتجًا مختلفًا |
| 65 · 66 | وحدات/قنوات التكييف | `hvac_equipment` | ✅ سقف | — |
| 1 · 5 · 6 · 8 · 9 · 11 · 18 · 20 · 21 · 26–30 · 34–41 · 45 · 48 · 49 · 53 · 54 · 56 · 60–63 · 67 · 68 | — | نية A | ✅ مكتمل | 38 سطرًا بلغت نيّتها |

**المجموع: 38 A + 29 سقفًا = 67 · النقص = #22 وحده.**

### حكمي على #22، بالبيّنة لا بالرأي
«خشب لعزل جدران» → **بلا عائلة، وهو السطر الوحيد غير القابل للتجميع في الكراسة كلها.**
وليس سطرًا مستحيلًا: **كلمةٌ واحدة تفصله عن عائلتين في اتجاهين**:
- «**الواح** خشب» → `wood_panels_joinery` ✅ قابل للتجميع
- «عزل **حراري** للجدران» → `thermal_insulation` ✅ قابل للتجميع
- «خشب» وحدها و«عزل جدران» وحدها → كلتاهما بلا عائلة

**لذلك أُحكِمه نقصًا:** المقياس يخبر المالك عن **الحصة التي يستطيع المحرّك أن يعمل بها**، وسطرٌ لا يُنتج عائلة ولا تجميعة هو سطرٌ **لم يُجَب**، بصرف النظر عن حصافة الامتناع.
**ولكن أُقرّ صراحة أنه أفضل أنواع الفشل:** الامتناع بين `thermal_insulation` و`wood_panels_joinery` — تجارتان مختلفتان — أشرف من التخمين، والتخمين كان سيولّد خطأً واثقًا. فالخلاف **تعريفي لا قياسي**: اللجنة تحسب «امتنع بحكمة» اكتمالًا، وأنا أحسب «قابل للتجميع» اكتمالًا.
**اقتراحي للجدول المشترك:** يُقتبَس رقمان لا رقم واحد — **«اكتمال قابل للعمل» 67/68** و**«امتناع صحيح» 1**، فيسقط الخلاف من أصله لأن الطرفين يقيسان شيئين مختلفين وكلاهما حقيقي.

---

## 2) اختبار جانب العرض — بالطريقة التي وجدتُ بها الثقب

### ✅ ما صحّ
- **هجومَا v7 مُغلقان:** «مادة رشاش حريق» → NO_MATCH · «تصنيف رشاش حريق» → HARD_VETO.
- **مسار الاستثناء المتروك خامًا **بقصد**: الغرض يتحقّق — مؤكَّد.** حاولتُ دفن المُسقِط ثلاث مرات وفشلت كلها:
  «مؤسسة توريد عامة **مادة** حديد تسليح» → HARD_VETO · «شركة معدات **تصنيف** حديد تسليح» → HARD_VETO · «مورد **من** حديد تسليح» → HARD_VETO.
  **قرار صحيح، وأُثبته.** لا يستطيع مورّد أن يشتري طريقه إلى ما بعد استثناء بدفن الكلمة في عبارة.
- **إصلاح الالتصاق طبقي لا فرديّ ✅:** «بلوك **[أي صفة]** مفرغ» يعمل — اسمني، اسمنتي، خرساني، اسمنى، «ثقيل مسلح»، وبلا صفة — و«بلوك **خفيف** مفرغ» يبقى `lightweight_block`، فلم يُسطَّح تمييز الأشقّاء.

### 🔴 ثقب جديد: **الإعفاء عند الموضع 0**
قاعدة العبارة لا تفتح عبارة عند الفهرس 0. وهذا **صحيح لسطر مناقصة** (سطر يبدأ بـ«مقاس 100» ليس وصفًا لشيء) — لكن نصّ المورّد **لا رأس منتج له**، فالإعفاء يصير بابًا:

| نصّ المورّد | الحكم |
|---|---|
| «**تصنيف** رشاش حريق - مؤسسة الري الحديث للزراعة» | **PREFERRED · auto_tick=true** ✗ |
| «**مادة** رشاش حريق - مصنع دهانات وبويات» | **PREFERRED · auto_tick=true** ✗ |

نفس الهجوم الذي أُغلق، **بإزاحة الكلمة إلى أول السطر**. يمرّ من `bestHit` فعلًا، لكن منطق العبارة داخله **خامد عند الموضع 0**.

### 🔴 الأخطر: **مفردات المناقصة طُبِّقت على نثر المورّدين**، فصارت تُسقِط الموردين الشرفاء
حروف الجرّ التي أضافها v7 لسطور الكراسة («من»، «في») تُطبَّق الآن على أوصاف الشركات، وهي من أكثر كلمات النثر التجاري السعودي:

| نصّ المورّد | النتيجة |
|---|---|
| «مؤسسة الحماية **من** الحريق - رشاشات حريق ومضخات» | **NO_MATCH · score 0** 🔴 |
| «مؤسسة الحماية **ضد** الحريق - رشاشات حريق ومضخات» | PREFERRED · score 23 |
| «مؤسسة الحماية الحريق - رشاشات حريق ومضخات» | PREFERRED · score 23 |
| «شركة مكافحة الحرائق **في** الرياض - رشاشات حريق» | **NO_MATCH · score 0** 🔴 |
| «رشاشات حريق ومضخات - مؤسسة الحماية **من** الحريق» | PREFERRED · score 23 |

**مورّد حماية من الحريق مؤهَّل يُصفَّر لأن اسمه يحتوي «من»، أو لأنه ذكر أنه «في الرياض».** خمس مطابقات تصير صفرًا.
وهذا **بعينه الشكل الذي كُلِّفتُ برصده**: جانب الطلب متطابق بايتيًا — الرقم لم يسوء — وجانب العرض يُسقِط المؤهَّلين صامتًا. **ويصيب سلوك اليوم**، لأن `evaluateSupplier` يُقيّم مسار البحث الكلمي أيضًا، فلا ينتظر رفع الراية.

### 🔴 `extractFacets` انتقل إلى التطرّف المضاد
| السطر | وجه يشقّ التجميع |
|---|---|
| «مواسير حديد مقاس 100 مم» | `material=steel` |
| «مواسير **مادة** حديد مقاس 100 مم» | **(لا شيء)** |

السطر الذي **يصرّح** بمادته يُشقّ أقلّ من الذي يُلمّح بها. والأوجه **وصفٌ بطبيعتها** — تمامًا كـ`context_terms` التي أذن لها الكود صراحةً بقراءة العبارات — فحقّها `allowAttributeText = true`. الحالي يجعل **هوية التجميعة تابعة للصياغة**.

**حصيلة ثقوبي الأربعة:** اثنان أُغلقا صحيحًا (الأنماط + المطالبات) · واحد أُغلق **فزاد تطرّفًا** (الأوجه) · واحد خام **بقصد ومؤكَّد الصحة** (الاستثناءات) — **زائدًا ثقبًا جديدًا (الموضع 0) وصنف إسقاط جديدًا (حروف الجرّ).**

---

## 3) حكم السقّاطة

### التمييز **حقيقي**، وأُثبته من مضمون الحرس نفسه لا من وصفه
| الحرس | `block_any` يشير إلى | فمعنى فشله | فالهبوط للعائلة |
|---|---|---|---|
| `sprinkler` | ري · irrigation · lawn · garden · turf · landscape | «هذا منتج **ريّ**» | ❌ خطأ — تجارة أخرى، فوجب حرس الأصل (وقد حُرس) |
| `قاطع` | rcd · rcbo · elcb · acb · isolator · changeover · ats · mcb/mccb · جهد متوسط | «جهاز **آخر في نفس التجارة**» | ✅ صحيح — كلها من مورّد لوحات |

فالفرق **بنيوي**: حرس العمق يمنع التعمّق، وحرس التجارة يمنع التسرّب. و«قاطع 80 امبير» يبقى عند `switchgear_panels`، وهو مورّده الصحيح فعلًا. **التمييز ليس فئةً مريحة.**

### لكن السقّاطة نفسها **بطلت**، وأقولها صريحة
**قائمةٌ «لا تكبر إلا نقصانًا» كبرت، فهي ليست سقّاطة بل تعليق.** لم يكن يحرسها إلا حسن النية، فانكسرت عند أول حجّة جيّدة — وسينكسر ما بعدها بحجّة أجود. الوعد الذي يُنقَض بتبرير مقبول لا يبقى وعدًا؛ يصبح إجراءً احتفاليًا.

### ما أستبدله به: **احذف القائمة واحسب الشرط**
> المخالفة (مصطلح محروس عند الفرع، حرّ عند الأصل) **حميدةٌ إن وإن فقط** لم يكن أيٌّ من مصطلحات `block_any`/`blocked_by_head` مملوكًا لمفردات عائلة **أخرى**.

- ثقب الرشاش يُلتقَط تلقائيًا (مصطلحات الريّ تعود لـ`irrigation_systems`).
- هبوطات القواطع تمرّ تلقائيًا (rcd · acb · isolator · ats كلها في `switchgear_panels`).
- **ولا يحتاج بشرٌ أن يضيف سطرًا** — وهو بيت الداء.

**وأُعلن تحفّظًا يخدم الحجّة:** المسند الساذج سيُبلِّغ عن حرس القواطع، لأن «**عزل**» المجرّدة في `block_any` مملوكة لـ`thermal_insulation`. وهذا **ليس عيبًا في المسند بل التقاطًا لعيب حقيقي قِسته**: «قاطع 32 امبير **عزل مزدوج**» (قاطع مزدوج العزل) يفقد نيّته ويهبط للعائلة. اضبط المصطلح إلى «قاطع عزل»/`isolator` فيصفو المسند. أي أن المسند **يُصلح نفسه**: يحوّل ترهّل المفردات إلى اختبار فاشل بدل مدخل في قائمة سماح.

**وإن أبقيتم القائمة**، فأضعف المطلوب: اجعل الاختبار يؤكّد **طولها** مقابل ثابت مُودَع، حتى يصير النموّ تعديلًا لرقم يظهر في المراجعة **ككسر سقّاطة**، لا سطرًا معقولًا آخر في كتلة تعليق.

---

## 4) قاعدة التصنيف الأمبيري — **متحقّقة، وأُثني عليها**

| السطر | v8 | |
|---|---|---|
| قاطع **6** امبير · **32** · **63** | `mcb` A@0.90 | ✅ حدود 60898 |
| قاطع **64** امبير · **80** | `switchgear_panels` B | ✅ **الفجوة المقصودة** |
| قاطع **100** · **800** | `mccb` A@0.90 | ✅ حدود 60947-2 |
| قاطع **1000** · **1600** | B | ✅ فوق 800 لا تُنتحل |
| «قاطع **امبير**» (بلا رقم) | B | ✅ **`require_any` يطلب تقديرًا فعليًا لا الكلمة** |
| قاطع تسرب ارضي 32 امبير | `residual_current_device` | ✅ لم يُنتحل `mcb` رغم أن 32A في مداه |
| قاطع هوائي 1600 · ACB 1600A | `acb` | ✅ |
| قاطع جهد متوسط 630 امبير | B | ✅ |

**وأوافق على ترك 63–100A فارغًا بقصد.** جهاز 80A هو فعلًا أيٌّ منهما، والامتناع عن الاختيار **مع بقاء التجميعة عند العائلة** هو الجواب الصحيح: لا خطأ واثق ولا سطر مهدور. أول فجوة تُترك عن عِلم في هذا التسلسل، وهي سابقة أحبّ أن تتكرّر.
**عيبان صغيران:** «عزل» المجرّدة تُفرِط في الحجب (أعلاه) · و`RCD 40A` الإنجليزية → **C غير محلول** بينما العربية تصل A — انعكاس اللاتماثل المعتاد، آمن الاتجاه لكنه يستحق التسجيل.

---

## 5) هل v8 قابل للإصدار؟ — **نعم على جانب الطلب، لا على جانب العرض بعد**

| | الحكم |
|---|---|
| **الحلّ (الطلب)** | ✅ **قابل للإصدار.** تطابق بايتي على 183,942 صفًا · خطأ واثق 0.00% على الكراسة مؤكَّد بحكمي · قاعدة التصنيف متحقّقة على الحدود · إصلاح الالتصاق طبقي · اكتمال 67/68 بتعريفي |
| **جانب العرض** | 🔴 **ليس بعد.** إسقاط الموردين بحرف الجرّ **انحدارٌ على سلوك اليوم** لا على المستقبل، لأن `evaluateSupplier` يُقيّم مسار البحث الكلمي أيضًا · زائدًا ثقب الموضع 0 · زائدًا تناقض الأوجه |

**التوصية:** أصدِروا الحمولة والمحلِّل للحلّ. **لا تُشغّلوا مَخنَق جانب العرض في الإنتاج ولا ترفعوا راية الخريطة** حتى يأخذ مطابِق الموردين **مفرداته الخاصة** بدل استعارة مفردات المناقصة: نصّ المورّد ليس سطر مناقصة، ولا رأس منتج له، فقاعدة «الرأس ثم الصفات» لا تنتقل إليه. الحدّ الأدنى: أسقِطوا حروف الجرّ من مسار العرض، وألغوا إعفاء الموضع 0 فيه، وأعطوا الأوجه `allowAttributeText = true`.

---

# English summary

**Verified:** payload `03fc7b2251bd6762` ✅, resolver `ad285bc1b648b3a7` ✅, provenance reconstructible. **Held-out corpora are byte-identical v7 → v8** — full-file SHA256 equality on both, 183,942 rows, zero differing lines, so zero regression across v6→v7→v8 by identity rather than assertion. Booklet: A 38 (55.88%), B 30, C 0; exactly four lines changed from v7, and they are exactly the four I objected to, each landing on the intent I named. **Confident-wrong 0.00% confirmed by my own adjudication.**

**1. The disagreement is one named line, and the same line explains both gaps.** My table gives **v7 = 63/68 and v8 = 67/68 (98.53%)**, not 100%. The residual is **#22 «خشب لعزل جدران»**, which yields no family and is the booklet's only non-poolable line. It is not intrinsically unresolvable — it sits one word from a family in two directions («الواح خشب» → `wood_panels_joinery`, «عزل حراري للجدران» → `thermal_insulation`), while «خشب» and «عزل جدران» alone reach neither. I score it a shortfall because the metric exists to tell the owner what share of his booklet the engine can act on, and a line with no family and no pool was not answered. **But I record that it is the best kind of miss:** abstaining between two different trades beats guessing, and guessing would have produced a confident error. The disagreement is definitional, not measurement, so my proposal for the shared table is to quote **two** numbers — "actionable completeness 67/68" and "correct abstentions 1" — which dissolves the gap because both sides are measuring something real.

**2. Supply side, attacked the way I found the hole.** The exclusion path that was **left raw on purpose holds — confirmed.** Three burial attempts all still HARD_VETO, including «مادة حديد تسليح», «تصنيف حديد تسليح» and «من حديد تسليح». That was the right call and it works. The v7 attacks are properly closed. But three problems remain:

- **A new bypass at position 0.** The clause rule never opens a clause at index 0 — correct for a BOQ line, wrong for supplier prose, which has no product head. Moving the keyword to the front revives the closed attack: «**تصنيف** رشاش حريق - مؤسسة الري الحديث للزراعة» and «**مادة** رشاش حريق - مصنع دهانات» both return **PREFERRED, auto_tick=true**.
- **The serious one: the BOQ clause vocabulary is now applied to supplier prose, and it silently zeroes qualified suppliers.** «مؤسسة الحماية **من** الحريق - رشاشات حريق ومضخات» → **NO_MATCH, score 0**, while the identical business written «الحماية **ضد** الحريق» → PREFERRED, score 23. «شركة مكافحة الحرائق **في** الرياض» → NO_MATCH. «من» and «في» are everywhere in Saudi company descriptions. This is precisely the shape I was asked to watch for — the demand-side number is byte-identical while the owner's pool quietly shrinks — and it **degrades today's behaviour**, not just the flagged future, because `evaluateSupplier` grades the keyword path too.
- **`extractFacets` overshot in the other direction.** «مواسير حديد مقاس 100 مم» yields pool facet `material=steel`; «مواسير **مادة** حديد مقاس 100 مم» yields none. The line that explicitly declares its material splits the pool *less*. Facets are description by definition, like `context_terms`, which the code deliberately lets read clauses — so facets should pass `allowAttributeText = true`. As it stands, pool identity depends on phrasing.

**3. Ratchet ruling — the distinction is real; the ratchet is not.** I verified the depth/trade split from the guards' own contents, not their description: the sprinkler guard blocks **irrigation** vocabulary, so failing it means "this is another trade" and demoting to the family is a leak; the breaker guard blocks **rcd, rcbo, elcb, acb, isolator, changeover, ats, mcb/mccb, medium voltage** — all siblings inside `switchgear_panels` — so failing it means "another device, same trade" and the family is the honest answer. An 80A breaker really is bought from a breaker supplier. So it is not a convenient category.

**But I will say plainly what you asked: a may-only-shrink list that grew is not a ratchet, it is a comment.** Nothing enforced it but goodwill, and it broke at the first well-argued case, which guarantees the next one. **Replace it with a computed predicate:** an offence is benign iff none of the guard's `block_any`/`blocked_by_head` terms belong to another family's vocabulary. That catches the sprinkler hole automatically, passes the breaker demotions automatically, and needs no human to add an entry. Disclosed caveat that helps the argument: a naive predicate would flag the breaker guards, because bare «عزل» in `block_any` belongs to `thermal_insulation` — and that is the predicate catching a real defect I measured, since «قاطع 32 امبير **عزل مزدوج**» loses its intent. Tighten the term to `isolator` and it goes clean; the predicate turns vocabulary sloppiness into a failing test instead of an allowlist entry. If the list must survive, at minimum assert its **length** against a committed constant, so growth appears in review as a ratchet break rather than one more plausible comment line.

**4. The rating rule verifies, and I endorse the deliberate gap.** 6/32/63A → `mcb`; 64A and 80A → family (the intended gap); 100A and 800A → `mccb`; 1000A and 1600A → family, correctly refusing to claim above 800. Bare «قاطع امبير» with no number stays at family, so `require_any` demands an actual rating — the inheritance concern is answered. RCD and ACB are properly excluded: «قاطع تسرب ارضي 32 امبير» → `residual_current_device` despite 32A being in MCB range, «قاطع هوائي 1600 امبير» and `ACB 1600A` → `acb`, «قاطع جهد متوسط 630 امبير` → family. Leaving 63–100A open is right: an 80A device genuinely is either, and the family fallback still pools it with breaker suppliers. Two small defects: bare «عزل» over-blocks, and English `RCD 40A` → C unresolved while the Arabic reaches A — the usual asymmetry, mirrored.

**Releasable?** **Yes on the demand side, not yet on the supply side.** Ship the payload and resolver for resolution: byte-identical archives, booklet confident-wrong 0.00% independently confirmed, rating boundaries verified, and the adjacency fix is genuinely class-level («بلوك [any adjective] مفرغ» works, while «بلوك خفيف مفرغ» still reaches `lightweight_block`). But do not enable the supply-side chokepoint in production and do not flip the map flag until the supplier matcher gets **its own** clause vocabulary instead of borrowing the BOQ one — supplier text has no product head, so the "head then attributes" premise does not transfer. Minimum fix: drop the prepositions from the supply path, remove the position-0 exemption there, and give facets `allowAttributeText = true`.

Measured, not tuned. Nothing committed; payload and resolver unchanged.
