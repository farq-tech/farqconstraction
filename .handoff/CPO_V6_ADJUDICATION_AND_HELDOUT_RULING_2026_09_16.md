# حكم `cpo-v6` + قرار الفيلق المحجوز — 2026-09-16

**المُقاس:** `payload cpo-v6 = 1483e668f2d3012f` ✅ **مطابق للمُعلن** · 102 عائلة ✅ · 218 نية ✅ (عبر `listIntentIds()`)
**تنبيه تسجيل:** قاعدة «عبارة الصفة» تعيش في **كود غير مُودَع** `src/lib/procurementOntology.ts` = `1afda36e09723d11`، لا في الحمولة.
كل رقم أدناه هو رقم **زوج (حمولة، كود)**، وليس رقم حمولة. إن أُودع الكود منفصلًا عن الحمولة تصبح الأرقام غير قابلة لإعادة الإنتاج.
**تعذّر التحقق من «26 معرّفًا جديدًا، 0 محذوف»:** `cpo-v5` لم يبقَ في أي مكان — حتى نسخة الـAPI المُوَرَّدة صارت v6. لا توجد أرشفة حمولات مُجمّدة.

---

## 0) الاتفاق المُسجَّل
`poolable` على 3–10 تحت v5 = **71,467** بالضبط في قياسي. ✅ مطابق. الفجوة 45.97% مقابل 99.60% كانت **تركيب فيلق، لا قياس**.
وقاعدة اللجنة — *إعادة القياس تُنطَّق على **اتحاد** خلايا التقرير* — **أُقرّها وألتزم بها**، وطبّقتها هنا: 7 خلايا محكومة + 4 خلايا حساسية + كل الأسطر الصائرة `poolable`.

---

## 1) هل تُصفَّر الخلايا فعلًا، أم أن الأخطاء **تنتقل**؟

قِسْتُ الحركة **صفًا بصف** بضمّ ثلاثي موضعي (v5 + أعمدة الأرشيف `section`/`src_cat` + v6)، `line_mismatch = 0` في الفيلقين.

| | 11–20 | 3–10 |
|---|---|---|
| خلايا متحرّكة | **18** | **14** |
| هبوط A ← غير A | **0** | **0** |
| هبوط B ← C | **0** | **0** |
| فقدان `poolable` | **0** | **0** |

**حكمتُ الحركات الـ32 كلها مقابل عمود الأرشيف نفسه: لا واحدة في الاتجاه الخاطئ.** ادعاء اللجنة **مؤكَّد استقلاليًا**.

**الخلايا السبع المحكومة على 11–20 (5,464 صفًا) — كلها انتقلت إلى عمود الأرشيف حرفيًا:**

| ن | v5 (خطأ) | v6 | عمود الأرشيف | الحكم |
|---|---|---|---|---|
| 1,984 | `lubricants_chemicals` | `pipes_fittings/pipe_fitting` | سباكة / Plastic Fittings | ✅ |
| 1,449 | `floor_tiling` | `movement_joint_systems/expansion_joint_cover` | معماري / Expansion Joint Covers | ✅ |
| 991 | `acoustic_ceiling_tile` | `interior_systems/metal_ceiling` | معماري / Metal Ceilings | ✅ |
| 720 | `interior_systems` | `expansion_joint_cover` | معماري / Expansion Joint Covers | ✅ |
| 166 | `metal_sheet_coil` | `floor_tiling/resilient_flooring` | معماري / Resilient Flooring | ✅ |
| 90 | `aluminium_systems` | `hvac_equipment/volume_control_damper` | تكييف / Duct Accessories | ✅ |
| 64 | `cable_termination` | `valves/backflow_preventer` | ميكانيكا / Valves | ✅ |

**41.85% → 0.00% مؤكَّد.** وخلية الحساسية التي أعلنتُها (241 صفًا `aluminium_systems ← Expansion Joint Covers`) صارت `expansion_joint_cover` بلا لبس — **الحساسية أُغلقت في الاتجاه المُواتي**، فالحدّ 5.84% كان محافظًا كما وصفته.

---

## 2) الأسطر الصائرة `poolable`: **0 من 6,514 خطأ واثق**

**تصحيح رقم:** الـ33,565 كان قفزة v4→v5. قفزة v5→v6 هي **6,514** سطرًا (2,649 على 11–20 + 3,865 على 3–10) في **13 خلية فقط**.
حكمتُ **كل الخلايا الثلاثة عشر — تعدادًا كاملًا، لا معاينة** — مقابل أعمدة الأرشيف:

| ن | v6 | عمود الأرشيف | الحكم |
|---|---|---|---|
| 1,955 | `pipes_fittings/pipe_fitting` A@0.90 | ميكانيكا / وصلات مواسير بلاستيكية | ✅ |
| 960 | `valves/backflow_preventer` A@0.90 | ميكانيكا / Valves | ✅ |
| 972 | `expansion_joint_cover` A@0.90 | معماري / Expansion Joint Covers | ✅ |
| 680 | `pipes_fittings` B@0.82 | ميكانيكا / Steel Fittings | ✅ |
| 481 | `expansion_joint_cover` A@0.90 | معماري / Expansion Joint Covers | ✅ |
| 448 | `valves/backflow_preventer` A@0.90 | ميكانيكا / صمامات | ✅ |
| 228 | `pipes_fittings` B@0.82 | ميكانيكا / وصلات مواسير معدنية | ✅ |
| 224 · 76 | `pipes_fittings/pipe_fitting` A@0.90 | ميكانيكا / Steel Fittings · معدنية | ✅ |
| 180 · 60 | `volume_control_damper` A@0.90 | تكييف / Duct Accessories | ✅ |
| 126 · 124 | `floor_tiling/resilient_flooring` A@0.90 | معماري / Resilient Flooring | ✅ |

**الجواب: صفر انحدار متنكّر في هيئة تغطية.** (الجولة الماضية: 184 من 33,889.)
**حساسية معلنة:** `resilient_flooring` مُعلَّق تحت عائلة `floor_tiling` — الفينيل والسيراميك تجارتان مختلفتان. النية صحيحة ومفتاح التجميع هو النية، فلم أحكمها خطأً؛ لكنها رائحة تصنيف.

---

## 3) تأكيد الادعاءين

**المجرى (conduit): ✅ مؤكَّد.** الـ90 صفًا صارت `precast_drainage/buried_drainage_pipe` وعمود الأرشيف **«بنية تحتية / HDPE Corrugated»** — تصريف أرضي مدفون كما قالت اللجنة تمامًا. تفسيرها صحيح وادعاؤها الأول كان خطأ تنطيق لا خطأ قياس.

**الرشاش: ✅ نصفه فقط.**
- عربيًا مُصلَح: «رشاش حريق» → `fire_fighting/fire_sprinkler` A@0.90 ✅ · «رشاش ري» → `irrigation_systems/irrigation_emitter` A@0.90 ✅ · «رشاش مياه ري» → `irrigation_systems` B ✅
- **إنجليزيًا لا يزال مقلوبًا:** «**Irrigation Sprinkler Head**» → `fire_fighting/fire_sprinkler` **A@0.90 · poolable** ✗
`sprinkler` مصطلح قوي للإطفاء و`irrigation` لا يحرسه. **الإصلاح غير متماثل لغويًا**، والأرشيف مليء بالأسماء الإنجليزية.

---

## 4) صنف «ألياف معدنية» — وجدتُ حالة ثانية **لم تُعلَن**

مسحتُ العبارات المادية المجرّدة: **سبع عبارة مادة تصل A@0.90 وحدها**، أي أن المادة تصلح اسمًا لمنتج — وهو نفس العلة التي بُني v6 لإزالتها، عائدةً **داخل الإصلاح نفسه**.

| السطر | v6 | الحكم |
|---|---|---|
| «عزل ألياف معدنية» · «عزل حراري ألياف معدنية» · «ألياف معدنية للعزل الحراري» | `interior_systems/acoustic_ceiling_tile` A@0.90 | ✗ **خطأ** — الصواب `mineral_wool_insulation`. كلمة «عزل» صريحة وتُهمَل |
| «عزل ألياف زجاجية» | `concrete_admixtures/concrete_fiber` A@0.90 | ✗ **خطأ غير مُعلَن** |
| «خزان ألياف زجاجية» | `concrete_admixtures/concrete_fiber` A@0.90 | ✗ **أسوأ** — خزان GRP يذهب لمورّد إضافات خرسانة |
| «صوف صخري» | `thermal_insulation/mineral_wool_insulation` | ✅ |
| «بلاطة سقف صوف صخري» · «تكسية جدران رخام» | `acoustic_ceiling_tile` · `surface_cladding` | ✅ الرأس غلب المادة |

**الدليل على أنه بنيوي لا فرديّ:** «ألياف معدنية» تُفترض **سقفًا**، و«صوف صخري» تُفترض **عزلًا** — والمادتان تخدمان الغرضين. التعارض يثبت أن الربط اجتهادي.
**نطاق أمين:** صفر ورود في الفيلقين (خلية Rockwool الوحيدة، 387 صفًا، صحيحة ✅ — وفيها «وجه Aluminium Foil» رُفض كحاسم، برهان أن القاعدة تعمل). **أثر مقيس = 0، خطر حقيقي على الكراسات > 0.**

---

## 5) 🔴 أهم نتيجة: العلة **لم تُغلَق** — أُغلقت لصياغة الأرشيف فقط

الكراسة الحقيقية تُدخِل الصفة **بحرف جرّ**، لا بكلمة مفتاحية. وقاعدة v6 تُطلق على كلمات مفتاحية صريحة («مادة»، «ربط»، «توصيل») فقط:

| السطر | v6 | الحكم |
|---|---|---|
| «حديد تسليح» | `rebar_mesh` B@0.82 | ✅ |
| «حديد تسليح **للخرسانة المسلحة**» | `ready_mix_concrete/structural_ready_mix` **A@0.90** | ✗ **خطأ** — حديد يذهب لمحطة خرسانة |
| «حديد تسليح **مادة** الخرسانة المسلحة» | `rebar_mesh` B@0.82 | ✅ **إدخال كلمة الأرشيف يُصلحه** |

**هذا برهان قاطع:** القاعدة سليمة، لكن مفرداتها مُشتقّة من الأرشيف المُولَّد ومُتحقَّقة فيه وحده. استبدل «مادة» بحرف الجرّ «لـ» — كما تكتب الكراسة فعلًا — فيعود الخطأ ذاته عند A@0.90.
ونفس الشكل: «هيكل **لألواح الجبس**» → `gypsum_board` A@0.90 ✗ (و`drywall_framing` **موجود**) · «خرسانة **أرضيات**» → `floor_tiling` ✗ مقابل «خرسانة مسلحة للأرضيات» → `ready_mix_concrete` ✅.

---

## 6) الكراسة الحقيقية (68 بندًا) — الأرقام تتكرّر، والحكم يختلف

A **23 = 33.82%** · B **45 = 66.18%** · C **0 = 0%** · poolable **67/68 = 98.53%** — ✅ **الثلاثة تتكرّر حرفيًا**.

**لكن اللجنة لم تُبلّغ الخطأ الواثق على الكراسة. حكمتُ الـ68 كلها:**

| # | السطر | v6 | الحكم |
|---|---|---|---|
| 33 | حديد تسليح للخرسانة المسلحة | `ready_mix_concrete/structural_ready_mix` A@0.90 | ✗ خطأ |
| 20 | هيكل لألواح الجبس | `interior_systems/gypsum_board` A@0.90 | ✗ خطأ (`drywall_framing` موجود) |
| 34 | خرسانة أرضيات | `floor_tiling` B poolable | ✗ خطأ عائلة |
| 63 | نظام التحكم بالأبواب | `physical_security/turnstile_gate` A@0.90 | ⚠️ قابل للجدل |

**الخطأ الواثق على الكراسة = 3 من 68 = 4.41%** (5.88% لو حُكم #63 خطأً). **هذا الرقم أهم من 33.82%، وهو غائب عن تقرير اللجنة.**

---

## 7) حكمي على مقياس المستوى A: **أوافق جزئيًا — ولا يكفي للتوقف عن قياسه**

فحصتُ الـ45 سطر B: **هل توجد نية أعمق فعلًا في الأنطولوجيا يسمّيها السطر؟**

- **~37 سطرًا: اللجنة محقّة.** «صمام» وحدها، «دهان بلاستيك» (لا توجد أي نية دهانات)، «بورسلان أرضيات» (لا توجد نية بورسلان/سيراميك)، «خزان مياه» (لا نية خزانات). العائلة **هي** الجواب الكامل، وطلبُ A منها طلبُ عمق غير موجود.
- **8 أسطر: اللجنة مخطئة — النية موجودة وقد سمّاها السطر:**

| السطر | v6 | النية الموجودة والمفقودة |
|---|---|---|
| باب خشب | `wood_panels_joinery` B | **`wooden_door`** |
| قاطع 32 امبير · قاطع 32 · قاطع 100 امبير | `switchgear_panels` B | **`mcb` · `mccb`** |
| كابلات الجهد المتوسط | `power_cables` B | **`mv_power_cable`** |
| خرسانة للأعمدة والكمرات · خرسانة قواعد | `ready_mix_concrete` B | **`structural_ready_mix`** |
| عزل حرارى لمجاري التكييف | `thermal_insulation` B | **`pipe_duct_insulation`** |

**والدليل الحاسم:** «باب خشب» → B · «**باب خشبي**» → **A@0.90 `wooden_door`**. المنتج ذاته، بحرف واحد.
إذن الفجوة **نقص مفردات، لا انعدام عمق** — وحجّة «سطران يُحَلّان صحيحًا عند العائلة» تنهار في هذه الثمانية.

**الحكم:** لا نكتفي بإلغاء A، ولا نستمر في اقتباسه كما هو. نستبدله بـ**«اكتمال الحلّ» = نسبة الأسطر التي بلغت أعمق نية موجودة لها**:
**(23 + 37) / 68 = 88.2%** · نقص حقيقي **8/68 = 11.8%**.
وهذا صادق، بخلاف 33.82% (يبخس) و«لا نقص» (يبالغ). ويجب أن يُقتبس **مع** الخطأ الواثق على الكراسة (4.41%) كعنوان مزدوج — فالتغطية بلا خطأ واثق نصف صورة.

---

## 8) قرار الفيلق المحجوز — وهو حكم على **منهجنا** لا على الأنطولوجيا

نعم: 11–20 لم تبقَ محجوزة، لأن v6 بُني على الخلايا التي حكمتُها فيها. **لم يبقَ فيلق محجوز.**

**لكن التشخيص الصحيح ليس «نفدت البيانات».** مرّتان تواليًا أُعلن إصلاح كاملًا ثم ظهر ناقصًا (نقل الرشاش، ثم خلية المجرى)، والآن ثالثة أقيسها في §5: الإصلاح **يُتحقَّق داخل السجل الذي اشتُقّ منه**. البيانات الأكثر من نفس السجل ما كانت ستكشف أيًّا من الثلاث. فالحجب المطلوب **حجب سجل، لا حجب صفوف**.

**ما أدافع عنه — الخيار الثالث، مُعدَّلًا:**
**تُحكَم الإصدارات على كراسات اعتماد حقيقية، وتُشترط قاعدة: إصلاح مُشتقّ من سجل X يُتحقَّق على سجل Y.** الأرشيف المُولَّد يبقى أداة انحدار (رخيص، ضخم، يمسك الأخطاء الفادحة)، لا أداة إجازة.

**ثمنه، صريحًا:**
1. **القدرة الإحصائية.** 68 سطرًا لا تقيس معدلًا دون ~1.5%. يلزم **10–20 كراسة (~1,000 سطر)** ليكون 4.41% ذا معنى.
2. **متوقّف على المحلّل.** `parseBoq` يُسقط **54.4%** من الكراسة المرجعية صمتًا (1 من 68 صحيحًا تمامًا). **بوابة على الكراسات مستحيلة قبل إصلاح المحلّل** — وهذا يقدّم لجنة `countdown` على توسيع الأنطولوجيا.
3. **بطء الدورة.** الحكم يصبح بشريًا لكل بند، لا آليًا لكل 100 ألف صف.
4. **قدرة أقل على أخطاء الذيل.** خلية 64 صفًا في الأرشيف لا نظير لها في كراسة.

ولذلك **أرفض «تجزئة ما لدينا وتجميد جزء»**: التجزئة تحجب صفوفًا من **نفس السجل**، فتُنتج ثقة كاذبة بالضبط كما فعلت مرّتين. وأرفض الاعتماد على دفعة جديدة وحدها للسبب ذاته — دفعة 21–30 مُولَّدة بنفس القالب ستُعاد استهلاكها في أسبوع.

---

## 9) على قرار إعادة بناء الخريطة

**لا أوصي ببناء الخريطة على v6 الآن.** ليس لأن v6 أسوأ — هو **أفضل بوضوح ومقيس** (32 حركة كلها في الاتجاه الصحيح، 0 من 6,514 خطأ واثق، 0 فقدان تغطية). بل لأن **كل تحقّقه في سجل واحد**، و§5 تُظهر أن العلة الجامعة تعود عند حرف جرّ. بناء خريطة 218 نية يدفع المفردات الجديدة إلى جانب العرض؛ فإن نُقلت معها هذه الثلاث (حديد→خرسانة، هيكل→ألواح، ألياف→سقف) تُثبَّت في جهة المورّدين حيث تكلفة التراجع أعلى.

**كافٍ لفتح البوابة:** تمديد قاعدة عبارة الصفة إلى **الجرّ العربي** («لـ»، «للـ»، «من») مع تحقّق على الكراسة، وفكّ ربط عبارات المادة السبع عن نيّات منتج مفردة، وحرس `irrigation` على `sprinkler`. الثلاثة صغيرة ومقيسة.

---

# English summary

**Payload verified:** `cpo-v6 = 1483e668f2d3012f` ✅, 102 families ✅, 218 intents ✅. **But the attribute-clause rule lives in uncommitted code** (`procurementOntology.ts = 1afda36e09723d11`) — every number is a (payload, code) pair. "26 new / 0 removed" is **unverifiable**: v5 no longer exists anywhere, including the vendored API copy.

**1. Do the cells reach zero, or do errors move?** They genuinely close. I diffed row-by-row against the archive's own labels: 32 moved cells (18 on 11–20, 14 on 3–10), and **all 32 go the right way**. Zero A→non-A, zero B→C, zero lost poolable. The seven adjudicated cells (5,464 rows) all land on the archive's own column — **41.85% → 0.00% confirmed**. My disclosed sensitivity cell (241 rows) closed favourably.

**2. Newly-poolable confidently wrong: 0 of 6,514** (full population, all 13 cells). Note the 33,565 was the v4→v5 jump; v5→v6 moved 6,514. Last round 184, this round zero.

**3. Conduit ✅ confirmed** — the 90 rows are `buried_drainage_pipe` and the archive labels them «بنية تحتية / HDPE Corrugated». **Sprinkler only half fixed:** Arabic is correct both ways, but «Irrigation Sprinkler Head» still resolves `fire_sprinkler` at **A@0.90, poolable**. The fix is language-asymmetric.

**4. The mineral-fibre shape: I found a second, undisclosed case.** Seven bare material phrases reach A@0.90 alone. «عزل ألياف معدنية» → `acoustic_ceiling_tile`, and «عزل/خزان ألياف زجاجية» → `concrete_fiber` (a GRP tank going to an admixture supplier). It's structural, not incidental: mineral fibre defaults to *ceiling* while rock wool defaults to *insulation*, though both serve both. Zero occurrences in the archives, so measured impact 0 — real booklet risk non-zero.

**5. Most important: the defect is not closed, only closed for the archive's phrasing.** Real booklets introduce attributes with a **preposition**, not a keyword. «حديد تسليح» → `rebar_mesh` B ✅; «حديد تسليح **للخرسانة المسلحة**» → `structural_ready_mix` **A@0.90 ✗**; «حديد تسليح **مادة** الخرسانة المسلحة» → `rebar_mesh` B ✅. Inserting the archive's keyword fixes it. Same shape sends «هيكل لألواح الجبس» to `gypsum_board` though `drywall_framing` exists.

**6. Booklet:** 33.82% / 66.18% / 0% and 98.53% poolable all reproduce exactly. But **confident-wrong on the booklet is 3 of 68 = 4.41%**, unreported by the ontology lane.

**7. Level A ruling — partly agree, not enough to stop quoting it.** For ~37 of the 45 B lines the lane is right: no deeper intent exists (no paint, porcelain or tank intents at all), so family is the complete answer. But **8 lines name an intent that does exist** — `wooden_door`, `mcb`, `mccb`, `mv_power_cable`, `structural_ready_mix`, `pipe_duct_insulation`. And the decisive test: «باب خشب» → B while «**باب خشبي**» → A `wooden_door`. Same product, one letter apart — so the gap is **vocabulary, not depth**. Replace Level A with **completeness against the reachable ceiling: (23+37)/68 = 88.2%**, true shortfall 11.8%, quoted alongside booklet confident-wrong.

**8. Held-out ruling — I'd defend judging releases on real Etimad booklets, with one correction to the framing.** The problem is not that we ran out of data; it is that **each fix was verified inside the register it was derived from**. More rows of the same register would have caught none of the three failures. So the rule must be: *a fix derived from register X is verified on register Y*, and generated archives are demoted to regression tooling, not a release gate. I **reject splitting and freezing a portion** — it holds out rows from the same register and would manufacture the same false confidence twice over. Costs, stated plainly: 68 lines cannot measure a rate below ~1.5% (needs 10–20 booklets), human adjudication per item, weaker on tail cells — and critically **it is blocked on the parser**, which silently drops 54.4% of the reference booklet, so `countdown` now precedes ontology expansion.

**9. On the rebuild:** I would **not** build the 218-intent map against v6 yet — not because v6 is worse (it is measurably better) but because all of its verification lives in one register, and §5 shows the unifying defect returns at a preposition. Three small measured fixes would open the gate: extend the clause rule to Arabic prepositions («لـ/للـ/من»), unbind the seven material phrases from single product intents, and guard `irrigation` against `sprinkler`.

Nothing committed. Held-out discipline kept: no booklet wording entered the ontology; probe strings were used only to measure.
