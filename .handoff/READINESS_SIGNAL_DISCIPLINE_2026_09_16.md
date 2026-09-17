# إشارات الجاهزية: عقد موحّد بدل أعلام فردية — 2026-09-16

**Patch:** `.handoff/readiness-recomputed-not-latched.patch`
**Base:** `3d4ceab3f` (المراجعة المنشورة فعلًا على Railway — تحققتُ أنها تحتوي `4cd39bf3a`، وهي نفسها patch الـ join الذي أنتجتُه أمس)
**التحقق:** يُطبّق بنظافة على `3d4ceab3f` في worktree نظيفة، و46/46 اختبارًا تنجح بعده.

---

## المشكلة العامة، لا الحالة الواحدة

في يوم واحد كذبت إشارتا صحّة في اتجاهين متعاكسين:

| الشكل | المثال | ما قاسته فعلًا |
| --- | --- | --- |
| قفل لا يعود أحمر | `critical_offers_warmup_pending` | نتيجة محاولة تسخين واحدة عند الإقلاع |
| علم يقول "حديث" وهو لا يعمل | حالة Gmail `CURRENT` | أن مسحًا انتهى، لا أن بريدًا يُلتقط |

كلاهما ينبع من نفس الخطأ: **الإشارة سجّلت محاولةً ماضية بدل أن تقيس خاصيةً حاضرة.**

---

## عقد إشارة الجاهزية في هذا المستودع

كل إشارة تُقرأ من `/ready` أو `/health` أو أي فحص خارجي يجب أن تحقّق الأربعة:

1. **مُعاد حسابها (recomputed).** تُحسب لحظة السؤال من الحالة الراهنة. لا `let` على مستوى الوحدة يُكتب مرة واحدة عند الإقلاع.
2. **قابلة للتراجع (can regress).** إن انكسر ما تصفه، تعود حمراء بلا إعادة تشغيل. علم لا يستطيع العودة إلى الأحمر ليس إشارة، بل ذكرى.
3. **تقيس الخاصية لا المحاولة.** «هل المفتاح صالح للاستخدام الآن؟» لا «هل نجح تسخينٌ ما؟». الأولى هي ما يهمّ المستخدم، والثانية قابلة للصدق والكذب معًا.
4. **سؤال بلا جواب = ليس أخضر.** إذا فشل الفحص نفسه، النتيجة «غير جاهز» صريحةً، لا افتراض نجاح.

وقاعدتان عمليتان تعلّمناهما اليوم:

5. **اختر الحدّ الذي يطابق الضرر.** بوّبتُ الجاهزية على الـ hard TTL (ست ساعات) لا الـ soft (600ث)، لأن الجسم القديم (`stale`) يُخدَم فورًا مع تحديث خلف الطلب — فالمستخدم لا يدفع شيئًا. بوابةٌ على `hit` كانت سترفرف: دورة التسخين كل 480ث مقابل soft 600ث، ففشل دورة واحدة يقلبها حمراء بينما الخدمة سليمة.
6. **لا تخلط «فارغ» بـ«بارد».** `sort=percent` يعيد `{ok:true, items:[]}` في الإنتاج وهو مُسخَّن تمامًا. الدالة الموجودة `readFreshWarmCache` تعدّ الفراغ = غير مُسخَّن (صحيح للتسخين، خطأ للجاهزية)، فلو أعدتُ استخدامها لأعدتُ بناء نفس العيب بميكانيكية جديدة. عدد الصفوف سؤال بيانات، وserving-freshness يجيبه أصلًا.

---

## ما تغيّر

### 1) الجاهزية تُحسب ولا تُقفل
حُذف `let criticalOffersWarmupReady` كليًا. بدلًا منه `loadCriticalOffersReadiness()` يفحص مفاتيح Redis مباشرةً (قراءة فقط، بلا SQL) مع ذاكرة قصيرة 5 ثوان حتى لا يحوّل مراقبٌ فحصَ صحّة إلى حِمل. البوابة الآن على الأشكال الثلاثة التي تقرأها أول رسمة (`SYNTHETIC_MONITOR_SHAPES`) + مفتاح `mins`. استُثنيت الأربعة `PRIMARY_OFFERS_CATEGORY_SHAPES` لأن تعليقها ذاته يسمّيها بذورًا تُنعش بالطلب، فبوّابتها ستجعل الجاهزية رهينة رفٍّ لم يفتحه أحد.

الشكل مأخوذ حرفيًا من `evaluateCriticalServingReadiness` الموجود في نفس الملف — كان يحقّق الشروط أصلًا، والعلم المكسور كُتب بجانبه.

جسم الـ 503 صار يسمّي المفاتيح الباردة. الـ 503 القديم قال «شيء ما معلّق» فقط، ولهذا احتاج الأمر فحص نشرٍ غير ذي صلة لملاحظة أنه عالق ساعات.

### 2) نضوب الاتصالات صار عابرًا (transient)
آلة الإعادة كانت موجودة (`warmShapeWithRetry`) لكن مصنّفها يطابق «timeout» فقط، ونصّ الخطأ الحقيقي `(EMAXCONNSESSION) max clients reached in session mode` لا يحتويها — لذلك سجّل كل فشل `attempts:1`. أضفتُ نضوب الاتصالات للمصنّف، ورفعتُ المحاولات 2→3 بتراجع أُسّي مُشوَّش (1.2ث ثم 2.4ث).

**تصحيح لتأطير المشكلة:** الأشكال لا تتسابق مع نفسها — الحلقة متسلسلة بتعليق صريح يقول إن التوازي يستنزف المسبح. والقياس يؤكد أن الشحّ كان على مستوى العملية كلها: **18 حالة `EMAXCONNSESSION` بين 14:39:49 و14:40:39** أصابت biggest-savings (4 أشكال) و**بحث المطاعم (3)** و**طبقة قراءة البقالة (4)** و`user:browse`. فالتسلسل الإضافي لن يساعد؛ الجار كان محرومًا أيضًا. الأرجح تداخل النشر (النسخة القديمة تصرّف اتصالاتها بينما الجديدة تقلع) على مسبح session بحجم 20.

ولهذا الإعادة تحسينٌ للذيل لا حلّ: خمسون ثانية أطول من أي backoff معقول عند الإقلاع. ما يجعل الرفض غير مهمّ هو البند (1).

### 3) المخطط الخامد
`render.yaml` → `healthCheckPath: /live` بدل `/health`، وهو ما تستخدمه Railway فعلًا (`railway.json`). لم أحذف الملف: ترويسته تقول إنه محفوظ كمرجع حتى تأكيد التفكيك، والتفكيك غير مؤكد، وفيه جرد 30+ مفتاح بيئة تُطابَق عليه Railway ومعرّف الخدمة اللازم للتحقق. الحذف يفقد ذلك.

**خطر متبقٍّ لم أُصلحه (يحتاج صاحب صلاحية Render):** الخدمة `autoDeploy: true` على `branch: main`، وcronان يكرّران وظائف Railway. لو كانت `srv-d77f1bh4tr6s73cumdu0` معلّقة لا محذوفة، فتطبيق المخطط يشغّل API إنتاج ثانيًا وcron تحديث أسعار ثانيًا على نفس الأسرار. سجّلتُ ذلك تعليقًا في الملف.

---

## هل كانت الجاهزية ستصير خضراء وحدها عند 14:48؟

**نعم — وأبكر: نحو 14:40، أي قبل دورة الـ 14:48 ولم تكن ستحتاجها.**

المفاتيح المبوّبة كانت موجودة في Redis طوال الوقت: Redis يبقى بين عمليات النشر، فوَرِثَت العملية الجديدة مفاتيح النشر السابق. الدليل أن الإنتاج خدم هذه الأشكال الثلاثة بعينها في **3–8 مللي ثانية** عند 14:40:32 و16:59:41، والمسار البارد ~11.6ث بتعليق الكود نفسه. وبوابتي الجديدة أكثر تسامحًا (hard TTL ست ساعات)، فأول فحص بعد الإقلاع كان سيجدها صالحة.

**قيد على هذا الدليل، وأقوله صراحةً:** لم أستطع تشغيل الفحص على Redis الإنتاج — لا يوجد `REDIS_URL` في البيئة المحلية (متغيّر تديره Railway ومُنعتُ من لمسه)، فـ`cacheStore` يرتدّ إلى خرائط داخل العملية وأعاد `missing` لكل مفتاح: هذه سِمة بيئتي لا شهادة عن الإنتاج. فالاستنتاج قائم على أن المسار والفحص يشتقّان المفتاح من نفس الدالة (`biggestSavingsHttpCacheKey`، وتعليقها يشترط التزامن مع `routes/comparison.js`) وعلى أزمنة المللي ثانية المفردة.

**الطريق الوحيد الذي قد يعيد هذا العيب:** لو تباين `unifiedMenuEnabled()` بين سياق الفحص وسياق المسار، لاختلفت بادئة المفتاح (`u2o7` مقابل `f1o7`) ولقرأ الفحص مفتاحًا لا يكتبه أحد → أحمر للأبد. كلاهما يستدعي نفس الدالة في نفس العملية فيتفقان، لكن هذا هو الاحتمال الوحيد، ولهذا صار الـ 503 يطبع أسماء المفاتيح المفحوصة.

---

## تمريرة سريعة: هل يوجد علم آخر بنفس الشكل؟

في مستودع الـ API: **لا شيء بشكل القفل.**

| العلم | الحكم |
| --- | --- |
| `lib/cacheStore.js: redisReady` | ✅ يعود `false` على `error`/`end` (سطر 99، 345) — قابل للتراجع |
| `routes/intelligence.js: ncp_ready` | ✅ يُحسب من التغطية الراهنة كل نداء — مثال صحيح |
| `lugtah-csv*: _restaurantsLoadedAt` | ✅ ذاكرة بـ TTL، لا تُقرأ كصحّة |
| `restaurant-kb/mapping-store: seedLoaded` | ✅ حارس تحميل مرة واحدة، غير معلن كإشارة |
| `evaluateCriticalServingReadiness` | ✅ مُعاد حسابه وقابل للتراجع (وهو القالب الذي اتّبعتُه) |

**الانتهاك الباقي هو Gmail، وهو انتهاك للبند 3 لا البند 1:** `construction.gmail_sync_state` يُضبط `'CURRENT'` عند انتهاء مشي الصفحات دون رمز تالٍ (`gmail-sync.js:177-179`) — أي يسجّل *أن مسحًا انتهى*، لا *أن بريدًا يُلتقط*. وهو مخزّن في صف قاعدة بيانات، فيبقى عبر إعادة التشغيل — أسوأ من قفل داخل العملية بهذا المعنى. الملف مملوك لمسار البريد الوارد ولم ألمسه.

الخلاصة: لا أتوقّع مفاجأة ثالثة من هذا النوع في الـ API؛ المفاجأة المحتملة الوحيدة هي Gmail وهي معروفة ومُحتسبة.

---

# English summary

**Patch** `.handoff/readiness-recomputed-not-latched.patch`, based on `3d4ceab3f` (the actually-deployed revision; it contains `4cd39bf3a` and is my join patch). Applies clean on a fresh worktree; 46/46 tests pass.

**1. Readiness recomputed, not latched.** `let criticalOffersWarmupReady` is gone. `/ready` and `/health` now call `loadCriticalOffersReadiness()`, which probes the gated Redis keys directly (reads only, no SQL, 5s memo). Shaped after `evaluateCriticalServingReadiness`, which already satisfied the contract. The 503 body now names the cold keys.

Two mitigations I took seriously: readiness gates on the **hard** TTL (6h), not the soft one — a stale envelope is still served instantly with revalidation behind it, and gating on `hit` would flap because the rewarm cycle is 480s against a 600s soft TTL. And it does **not** require rows: `sort=percent` legitimately returns zero items while fully warm, so reusing `readFreshWarmCache` would have rebuilt the same defect.

**2. Pool exhaustion is now transient.** The retry engine already existed; its classifier matched only "timeout", and `EMAXCONNSESSION` contains no such word, which is why every failure logged `attempts:1`. Now classified, 3 attempts, exponential jittered backoff.

*Correcting the framing:* the shapes do not race each other — that loop is sequential by explicit design. 18 `EMAXCONNSESSION` hits between 14:39:49 and 14:40:39 struck biggest-savings, restaurant search **and** grocery reads, so the shortage was process-wide, most likely deploy overlap on a 20-connection session pool. More serialising would not have helped. Retry shortens the tail; item 1 is what makes a refusal harmless.

**3. Blueprint** points at `/live`. Kept, not deleted: its header calls it the teardown reference, teardown is unconfirmed, and it holds the 30+ env-var inventory Railway is reconciled against. Flagged but not fixed: `autoDeploy: true` on `main` plus two crons duplicating Railway's — if the Oregon service is suspended rather than deleted, applying it starts a second production API.

**4. Would it have gone green at 14:48?** Yes, and earlier — around 14:40, without needing that rewarm. Redis survives deploys, so the new process inherited warm keys; production served those exact shapes in 3–8ms while the flag said pending. Caveat stated plainly: I could not probe production Redis (no `REDIS_URL` locally, Railway-managed, not mine to touch), so this is inference from the route and probe deriving the key from the same helper, not a direct read.

**Other flags:** none in the API has the latch shape — `redisReady` regresses on error, `ncp_ready` is recomputed per call, the rest are TTL memos not reported as health. The one live violation is Gmail's `CURRENT`, and it breaks rule 3 rather than rule 1: it records that a page walk finished, not that mail is being captured, and it persists in a DB row so it outlives restarts. Inbox lane's file; untouched.
