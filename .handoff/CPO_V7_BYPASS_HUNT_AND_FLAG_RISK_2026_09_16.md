# `cpo-v7`: مطاردة المسارات المتجاوِزة + خطر رفع الراية — 2026-09-16

**التحقق:** `payload = 1c0a340ec23a58fb` ✅ · `resolver = 7f152fb1887572ae` ✅ · `cpo-v7` · 102 عائلة · 218 نية.
**تسجيل الأصل (كما طلبت):** `cpo-v5` = زوج **(حمولة قابلة للاستخراج، كودٌ غير قابل لإعادة البناء)** وسأقتبسه هكذا دائمًا. v6 و v7 كاملان.
**واقعة تستحق التسجيل:** حمولة الـAPI ما زالت **`cpo-v6` (`1483e668f2d3012f`)**، لا v7. الإنتاج **إصدار كامل خلف** ما نحكم عليه.

---

## 1) ⭐ الأهم: **المعجم لم يكن المتجاوِز الوحيد**

فحصتُ **كل موضع نداء** يُنتج قرارًا. جانب الطلب صار له **مَخنَق واحد** هو `bestHit`، وهو الموضع الذي تُطبَّق فيه القاعدتان معًا (الحرس + عبارة الصفة). المسارات الأربعة كلها تمرّ به: المعجم (1417) · الاشتقاق الأعلى (1431) · التركيبي (`decideByTiers` → 728/731) · الاسترداد الدلالي (745/746). **جانب الطلب: صفر تجاوز.** الإصلاح حقيقي وبنيوي.

**لكن جانب العرض لا مَخنَق له إطلاقًا.** وهذه المسارات تصل إلى قرار بمطابقة `termIndex` **خام**:

| # | الموضع | الحرس | قاعدة العبارة | الأثر |
|---|---|---|---|---|
| 1 | `classifySupplierArchetypes` :1706 | ✗ | ✗ | يمنح النمط المِهني للمورّد |
| 2 | `evaluateSupplier` :1740 · :1755 · :1761 | ✗ | ✗ | **يُعيد `auto_tick: true`** |
| 3 | `extractFacets` :876 | ✗ | ✅ | أوجه **تُشقّ التجميع** بلا حرس |
| 4 | منفذ الإنتاج `procurement-ontology-port.js` | جزئي | **مفردات v6 فقط** | صفر من فواتح v7 |
| 5 | باني الخريطة `intent-supplier-map.js` :392 · :456 | ✗ | ✗ | يبني الخريطة نفسها |

### البرهان التجريبي — نفس الكلمات، الطلب يرفض والعرض يقبل
لسطر `fire_fighting/fire_sprinkler` («رشاش حريق» → A@0.90):

| نصّ المورّد | الحكم |
|---|---|
| «مؤسسة الحماية من الحريق — رشاشات حريق ومضخات» | PREFERRED · auto_tick ✅ صحيح |
| «مؤسسة الري الحديث — شبكات ري» | NO_MATCH ✅ |
| «مؤسسة الري الحديث — شبكات ري **مادة رشاش حريق**» | **PREFERRED · auto_tick=true** ✗ |
| «مصنع **دهانات** — دهان مقاوم للحريق **تصنيف** رشاش حريق» | **PREFERRED · auto_tick=true** ✗ |
| «Modern Irrigation Est. — **irrigation sprinkler head** supplier» | **PREFERRED · auto_tick=true** ✗ |

السطر الأخير هو **عين الحالة التي أصلحها v7 على جانب الطلب**، حيّةً على جانب العرض. ومصنع دهانات يُرشَّح تلقائيًا كمورّد رشاشات حريق.

### التشخيص البنيوي
جانب الطلب قابل للإصلاح بسطر واحد **لأن له مَخنَقًا**. جانب العرض سيُوَلِّد متجاوِزًا جديدًا مع كل موضع نداء يُضاف، **لأن كل قاعدة تُكتَب فيه يدويًا في كل موضع**. وهذا هو المرض نفسه في عضو ثالث: لا «قاعدة لم تُختبَر»، بل **قاعدة تُستشار في مسار وتُتجاوَز في آخر**. والمنفذ يضاعفه: تطبيقان متوازيان مكتوبان بيدين، وانحرافهما صامت — والدليل أن مفردات المنفذ اليوم هي مفردات v6 وفيها **صفر** من فواتح v7.

**التوصية:** لا تُضاف قاعدة سادسة قبل أن يصير لجانب العرض مَخنَق واحد يُماثل `bestHit`. القاعدة الصحيحة: *كل مطابقة على نصّ مورّد تمرّ من دالة واحدة.*

---

## 2) حكم v7

### الأرشيفات: «متطابقة بايتيًا» — ✅ **مؤكَّدة بأقوى صورة**
لا مجاميع، بل **SHA256 لكامل الملف**: 11–20 `6b36a5f38fed9008` = `6b36a5f38fed9008` · 3–10 `58e6be7dbffa7579` = `58e6be7dbffa7579`. **183,942 صفًا، صفر سطر مختلف.** فالخلايا الـ19 المحكومة تبقى صفرًا **بالهوية لا بالادعاء**، وتغييرات v7 الثلاثة لم تُحدث انحدارًا واحدًا على الفيلقين.

### الكراسة: الخطأ الواثق **0.00% ✅ مؤكَّد بحكمي**
A **34 = 50%** · B **34 = 50%** · C **0**. أخطاء v6 الأربعة كلها مُصلَحة:

| # | v6 | v7 | |
|---|---|---|---|
| 33 | `ready_mix_concrete/structural_ready_mix` A@0.90 | **`rebar_mesh`** B | ✅ |
| 20 | `interior_systems/gypsum_board` A@0.90 | **`drywall_framing`** A@0.90 | ✅ |
| 34 | `floor_tiling` B | **`ready_mix_concrete/structural_ready_mix`** A@0.90 | ✅ |
| 63 | `turnstile_gate` A@0.90 | **`access_controller`** A@0.90 | ✅ |

و#63 هو صنف «داخل العائلة» بعينه: نظام تحكم بالأبواب كان يذهب لمصنع بوابات سريعة. **مُصلَح.** وحكمتُ الأسطر الأربعة عشر الصاعدة إلى A كلها: **صفر خطأ جديد.**

### الاكتمال: **98.53% لا أُقرّه — قياسي 92.65% (63/68)**
أربعة أسطر تسمّي نيةً **موجودة**، ويبلغها متغيّر منها:

| السطر | v7 | النية الموجودة | المتغيّر الذي يبلغها |
|---|---|---|---|
| «قاطع 32 امبير» ×2 · «قاطع 100 امبير» | `switchgear_panels` B | **`mcb` · `mccb`** | `MCB 32A` · `MCCB 100A` → **A@0.90** |
| «بلوك **اسمني** مفرغ» | `masonry_blocks` B | **`concrete_block`** | «بلوك **اسمنتي** مفرغ» → **A@0.90** |

فهي **نفس اللاتماثل** الذي وجدته في «باب خشب / باب خشبي»: الإنجليزية تبلغ النية والعربية لا، وحرفٌ واحد («اسمني» ← إملاء الكراسة الفعلي) يفصل السطر عن نيّته. أي أن الفجوة **مفردات، لا عمق** — فلا تُحسَب سقفًا.

### كلفة مقيسة للفواتح الجديدة، في الاتجاه الآمن
«عزل **بالبيتومين**» → B@0.4 **غير قابل للتجميع**، مقابل «عزل بيتومين» → `waterproofing` B@0.82. الفاتحة تجرّد السطر من مُميِّزه الوحيد حين يكون الرأس عامًّا. **سقوط آمن لا خطأ واثق**، وصياغات الكراسة الفعلية تنجو (#23 «من البيتومين» ✅، #25 «بالبوليستر» ✅).
**ولم أنسب لـv7 ما ليس له:** «خرسانة» المجرّدة لا تحسم في كل الصور — «خرسانة الموقع» و«خرسانة موقع» بلا أي فاتحة تسقط كذلك. علّة سابقة، لا انحدار.

---

## 3) هل 136 سطرًا تكفي للاشتقاق؟

**المنهج صحيح، وهو أكبر تحسين منهجي في هذا التسلسل كله** — أول مرة تُشتَق مفردات قاعدة من **السجل الهدف** وتُختبَر ضده بدل أن تُخمَّن. والرفضان هما الدليل على أنه اشتقاق حقيقي لا تأكيد ذاتي: «ب» رُفضت على **14** مشاهدة (0 منها جرّية)، و«ل» على **12**، وكان فشلها على «لياسة» و«لوحات» بالذات — وهما مصطلحا v6 الجديدان. من يرفض مرشَّحًا لأنه يكسر مصطلحاته هو من يقيس فعلًا.

**لكن الاعتماد أرقّ من الرفض، وهو نفس حدّ العيّنة الصغيرة الذي أعلنته للـ68:**
«لل» تستند إلى **7** حالات · «بال» إلى **2** · و**«لال» إلى حالة واحدة بالضبط** («لألواح الجبس»). قاعدة تُعتمَد على n=1 حكايةٌ حسنة السرد، لا اشتقاق. و136 سطرًا **لا ترى تركيبًا أندر من ~0.74%**.

**حكمي:** أقبلها **الآن** لسببين محدَّدين لا لأن العيّنة كافية:
1. **اتجاه الخطأ آمن.** فاتحة واسعة تكتم مُميِّزًا → سقوط. فاتحة ضيّقة تُبقي الاختطاف → خطأ واثق. وقد أخطأوا نحو الكتمان، وهو الوجه الصحيح للخطأ.
2. **اختبرتُ التصادم مباشرة:** «بالوعة» و«بالته» و«بلاستيك» و«لياسة» و«لوحة» و«للحام كهربائي» — **لا تصادم**، لأن الفاتحة في الموضع 0 لا تفتح عبارة، ولأن حدّ الجذر يحمي الأسماء.

**وشرطي:** «لال» و«بال» **مؤقّتتان** حتى يبلغ فيلق الكراسات ~1,000 سطر، ثم يُعاد الاشتقاق. تُقتبس الرفضات كمقيسة، والاعتمادات كمُرجَّحة.

---

## 4) رفع الراية: **لا خطر تجميعة فارغة — والخطر الحقيقي معاكس**

### الجواب على سؤالك: **لا.** سطرٌ يُخدَم اليوم بالبحث الكلمي **لا يصير فارغًا** غدًا.
ثلاث حمايات في الكود نفسه، لا في وعد:
1. الكتلة كلها تُتخطّى إن لم يُنفّذ المستودع `listSuppliersByIntent`.
2. الخريطة تُطالب بالتجميعة فقط عند **`status === 'MAP' && suppliers.length`** — فنيّة بلا صفوف تترك `servedBy` فارغًا.
3. فشل القراءة يُلتقَط ويسقط إلى البحث.
وفوق ذلك **`queriesForItem` مستقلّة عن الراية** — فاستعلامات المرحلة 1 لا تتغيّر برفعها. الـ154 نية غير المخطَّطة تحتفظ بسلوك اليوم حرفيًا.

### 🔴 لكن الانحدار الذي يهمّ شكلٌ آخر: **تجميعة ممتلئة وخاطئة تكتم الاحتياط**
```js
if (pool.servedBy === 'INTENT_MAP') continue;   // ← تُهمَل استعلامات المرحلة 1 كلها
```
فالخريطة **تستبدل** البحث الكلمي لتلك التجميعة، لا تُضيف إليه. وباني الخريطة يُطابق بـ`classifySupplierArchetypes` (:392) و`padded.includes(term)` (:456) — **أي أنه يورّث تجاوز جانب العرض الذي أثبتُّه في §1.**

فالسبيل المكتمل: مصنع دهانات يُصنَّف مورّد حريق → يُدرَج في صفوف `fire_sprinkler` → الخريطة تُجيب غير فارغة → **تُهمَل نتائج البحث الكلمي التي تعمل اليوم** → يرى المالك قائمة **ممتلئة ومعقولة وخاطئة**. وهذا أسوأ من الفارغ: الفارغ يُلاحَظ ويُبلَّغ، والممتلئ الخاطئ يُصدَّق ويُرسَل. وهو بالضبط الشكل الذي طلبتَ منّي رصده: **الرقم يتحسّن ونتيجة المالك تسوء.**

### شروطي الثلاثة قبل `=1` (كلها صغيرة ومقيسة)
1. **اتحاد لا استبدال** في الإطلاق الأول: تُضمّ مرشّحات الخريطة إلى نتائج البحث ويُرتَّب الكل، فيصير أسوأ الأحوال حقًّا «سلوك اليوم + مرشّحون».
2. **لا `auto_tick` لمورّد مصدره الخريطة** حتى يجتاز جانب العرض القاعدتين.
3. **باني الخريطة يمرّ من مَخنَق واحد** قبل الرفع، لا بعده — وإلّا ثُبِّتت المفردات الجديدة في جهة العرض حيث كلفة التراجع أعلى.

**وعلى قرار البناء:** ابنِ الخريطة على **v7** — فهي مُتحقَّقة على الفيلقين بالتطابق البايتي وعلى الكراسة بحكمي، وv6 يحمل أخطاء الكراسة الأربعة. لكن **لا ترفع الراية بالبناء نفسه**: البناء والرفع حدثان، والأول آمن والثاني ليس بعد.

---

# English summary

**Verified:** payload `1c0a340ec23a58fb` ✅ and resolver `7f152fb1887572ae` ✅, `cpo-v7`, 102 families, 218 intents. Recording note accepted: `cpo-v5` will always be cited as a (payload, unreconstructible-code) pair. **Worth flagging: the API payload is still `cpo-v6` — production is a full version behind what we are adjudicating.**

**1. The lexicon was not the only bypass — and the pattern now has a third organ.** The demand side is genuinely fixed and fixed *structurally*: all four resolution paths funnel through `bestHit`, the one place both eligibility rules are applied. Zero demand-side bypasses. But **the supply side has no chokepoint at all**, and four paths reach a decision on raw `termIndex`: `classifySupplierArchetypes`, `evaluateSupplier` (which returns `auto_tick: true`), `extractFacets` (clause rule yes, guards no — and its facets split pools), and the map builder. A fifth is the production port, a hand-maintained parallel implementation that today carries the **v6** clause vocabulary and **zero** of v7's openers.

Demonstrated on a `fire_sprinkler` profile: «مؤسسة الري الحديث — شبكات ري **مادة رشاش حريق**» and «مصنع **دهانات** — … **تصنيف** رشاش حريق» both return **PREFERRED, auto_tick=true**, as does «Modern Irrigation Est. — **irrigation sprinkler head** supplier» — the very case v7 fixed on the demand side, still live on the supply side. The same words the demand side refuses, the supply side accepts. The diagnosis is not a missing rule but **a rule consulted on one path and bypassed on another**, and the supply side will keep generating these until it has one matcher.

**2. v7 adjudication.** "Byte-identical" is **confirmed in its strongest form** — full-file SHA256 equality on both corpora, 183,942 rows, zero differing lines, so the 19 adjudicated cells remain zero by identity rather than by assertion. On the booklet, **confident-wrong 0.00% is confirmed by my own adjudication**: all four of my v6 errors are fixed, including «نظام التحكم بالأبواب» moving from `turnstile_gate` to `access_controller`, and none of the 14 newly-Level-A lines introduced a new error. **But completeness 98.53% I do not confirm — I measure 92.65% (63/68).** Four lines name an intent that exists: «قاطع 32/100 امبير» while `MCB 32A`/`MCCB 100A` reach `mcb`/`mccb`, and «بلوك **اسمني** مفرغ» while «بلوك **اسمنتي** مفرغ» reaches `concrete_block`. That is the same asymmetry as «باب خشب / باب خشبي» — vocabulary, not depth, so it should not be scored as a ceiling. One measured cost of the new openers, in the safe direction: «عزل بالبيتومين» drops to non-poolable where «عزل بيتومين» resolves. I did not attribute «خرسانة» to v7 — bare «خرسانة» fails with no preposition present either.

**3. Is 136 lines enough?** The method is right and is the single biggest methodological improvement in this sequence — the first rule whose vocabulary was *derived from the target register and falsified against it*. The refusals prove it: bare «ب» rejected on 14 observations, bare «ل» on 12, failing on «لياسة» and «لوحات», which were v6's own new terms. A lane that rejects a candidate because it breaks its own vocabulary is measuring. **But the adoptions are thin** — «لل» rests on 7 cases, «بال» on 2, and **«لال» on exactly one**. That is the same small-sample limit I set for 68 lines: 136 lines cannot see a construction rarer than ~0.74%. I accept it now for two specific reasons rather than sufficiency: the **error direction is safe** (an over-broad opener suppresses a decider into fallback; an under-broad one leaves a confident hijack — they erred toward suppression), and I **tested the collisions directly** — «بالوعة», «بالته», «بلاستيك», «لياسة», «لوحة», «للحام» all survive, because a keyword at position 0 opens nothing and the stem floors hold. My condition: «لال» and «بال» are provisional until the booklet corpus reaches ~1,000 lines, then re-derive. Quote the refusals as measured, the adoptions as provisional.

**4. Flag flip — the answer to your question is no, and the real risk is the inverse.** A line that gets usable keyword results today **cannot** get an empty pool tomorrow. Three guards are in the code, not in a promise: the block is skipped unless the repository implements `listSuppliersByIntent`; the map claims a pool only on `status === 'MAP' && suppliers.length`; and a failed read is swallowed into search. And `queriesForItem` is flag-independent, so Phase 1 queries do not change. The 154 unmapped intents keep today's behaviour exactly.

**The regression that can happen is worse than empty.** `if (pool.servedBy === 'INTENT_MAP') continue;` **discards the pool's Phase 1 queries whenever the map answers non-empty**, so the map *replaces* keyword search rather than supplementing it — and the map builder matches with `classifySupplierArchetypes` and raw `padded.includes(term)`, inheriting the §1 bypass. The complete path: a paint factory is classified a fire supplier, lands in `fire_sprinkler` rows, the map answers non-empty, the working keyword results are dropped, and the owner sees a **full, plausible, wrong** list. Empty gets reported; full-and-wrong gets believed and sent. That is exactly the shape you asked me to watch for.

**Three conditions before `=1`:** union rather than replace for the first rollout, so the worst case really is "today plus candidates"; no `auto_tick` for map-sourced suppliers until the supply side passes both rules; and route the map builder through a single matcher **before** the flip, not after — otherwise the new vocabulary is fixed into the supply side where reversal costs most. **Build the map against v7** (v6 still carries the four booklet errors), but treat building and flipping as two events: the first is safe, the second is not yet.

Measured, not tuned. Nothing committed; payload and resolver unchanged.
