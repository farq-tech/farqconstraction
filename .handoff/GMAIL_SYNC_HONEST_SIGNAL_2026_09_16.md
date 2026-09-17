# مزامنة البريد: إشارة صادقة بدل «اكتمل آخر فحص» — 2026-09-16

**Patch:** `.handoff/gmail-sync-honest-signal.patch` — **تقريرٌ فقط، لا سلوك.**
**Base:** `3d4ceab3f` (المراجعة المنشورة). يُطبّق بنظافة على worktree نظيفة: 11/11 اختبار API و9/9 اختبار واجهة.
**لم يُلمس:** `gmail-sync.js`، `inbox-arrivals.js`، `rfq-dispatch.js`، والمخطط (schema). لا هجرة، ولا كتابة جديدة، ولا تغيير في ما يُلتقط.

---

## 1) ما هي الخاصية فعلًا

تحذيرك كان في محلّه: «رسائل مُلتقطة» ليست الخاصية. صندوق هادئ لا يلتقط شيئًا وهو سليم تمامًا، فربط الصحّة بعدد الالتقاط يحوّل كذبةً خضراء إلى كذبة حمراء.

الصفّ الحالي يخلط **سؤالين مستقلّين** في كلمة واحدة، وهما يفشلان استقلالًا:

| السؤال | ما يقيسه | يُشتقّ من |
| --- | --- | --- |
| **هل نظرنا، وحديثًا؟** | حيوية الأنبوب | `state` + عمر `checked_at` |
| **ماذا وجد النظر؟** | محاسبة ما فُحص | `inbox_arrivals` |

الأول وحده لا يكفي (أنبوب سليم فوق صندوق هادئ، وأنبوب ميت فوق صندوق مزدحم، كلاهما صفر التقاط). والثاني وحده لا يكفي (أعداد بلا نظر حديث لا تعني شيئًا).

**ما أُخزّنه: لا شيء جديد.** الصفّ سجلٌّ لآخر تمرير، وكسجلّ هو سليم — الخطأ كان تقديمه كإشارة. الإشارة تُشتقّ لحظة القراءة في `lib/construction/gmail-sync-signal.js`.

### الحالات وما تعنيه للمالك

**بُعد النظر (`looking`):**
- `RECENT` — نظرنا خلال آخر 5 دقائق (نفس عتبة الواجهة، صارت في مكان واحد بدل مكانين).
- `IN_FLIGHT` — تمرير جارٍ. الحالة الوحيدة التي كان الصفّ صادقًا فيها أصلًا.
- `STALE` — لم ننظر منذ أكثر من 5 دقائق. **هذا هو التراجع الذي لا يستطيع الصفّ التعبير عنه.**
- `FAILING` — آخر محاولة فشلت، مع رمزها.
- `NEVER` — لم يبدأ.

**بُعد النتيجة (`outcome`)، بترتيب ما يستدعي تصرّفًا:**
- `NEEDS_ATTENTION` — وصول بحالة `AMBIGUOUS`/`CONFLICT` ينتظر إنسانًا.
- `ARRIVED_UNROUTED` — وصل بريد لم نستطع ربطه بطلب، **بعد استثناء البريد العادي**.
- `CAPTURING` — التُقط بريد خلال النافذة.
- `NOTHING_ARRIVED` — نظرنا ولم يصل جديد. **سليم، وليس عيبًا.**
- `UNKNOWN` — تعذّر حساب الدليل. سؤال بلا جواب ليس أخضر.

### التمييز الذي أنقذ الإصلاح من أن يكون كذبة جديدة

`unexplained` أضيق من `unrouted` عن قصد. الإنتاج الآن: **12 غير مربوطة، منها 8 وصلت قبل وجود أي طلب** — أي بريد عادي إلى `info@farq.sa`. محرّك التوجيه يصنّف ذلك أصلًا غير قابل للتصرّف (`NON_ACTIONABLE_REASONS`)، فاحتسابه عيبًا يثبّت الإشارة حمراء إلى الأبد على صندوق سليم: نفس الخطأ الذي حذّرتَ منه، في الاتجاه المقابل.

فـ`healthy=false` تتطلّب إمّا عملًا ينتظر إنسانًا، أو بريدًا **غير مُفسَّر**.

---

## 2) القدرة على التراجع

كل عدد **مُنافَذ زمنيًا** (24 ساعة افتراضًا) ويُحسب لحظة القراءة، فلا شيء يحتاج كاتبًا ليصحّح نفسه:
- `CAPTURING` تتحلّل إلى `NOTHING_ARRIVED` بمجرّد انزلاق النافذة.
- `RECENT` تتحلّل إلى `STALE` بتقدّم الساعة على نفس الصفّ حرفيًا (اختبار مخصّص لهذا).
- `FAILING` تسبق أي التقاط سابق: نجاحٌ ماضٍ لا يبرّئ أنبوبًا يفشل الآن.

مقابل `captured_count` الذي يرتفع فقط: انظر البند 3.

---

## 3) تمريرة على نفس الشكل في مسار البريد الوارد

| الحقل | الشكل | الحكم |
| --- | --- | --- |
| `gmail_sync_state.state = 'CURRENT'` | يقيس المحاولة | **العيب** — أُصلح بالاشتقاق |
| `captured_count` المعروض «رسائل مستوردة» | إجمالي تراكمي لا يتراجع أبدًا | **انتهاك ثانٍ** — لو توقّف الالتقاط اليوم لبقي الرقم نفسه غدًا. أُصلح بأصدق تغيير ممكن: صار «إجمالي الرسائل المستوردة منذ الربط»، فلا يُقرأ كصحّة حاضرة |
| `completed_at` | علامة أعلى مستوى | ✅ مشروع كسجلّ؛ الواجهة تستخدمه كوقت لا كصحّة |
| `ambiguous_count` | يُصفّر مع كل تمرير جديد | ✅ يتراجع |
| `synchronization().unresolved` | `count(*) where state<>'RESOLVED'` | ✅ يُحسب كل نداء |
| `worker_enabled` / `receiving_configured` | مشتقّة من البيئة | ✅ إعدادات، ولا تدّعي نتيجة |
| حالات `inbox_outbox` | `SENDING`/`NEEDS_REPLY`/`WAITING_SUPPLIER` | ✅ لا ادّعاء «أُرسلت» تراكميًا يُعرض كصحّة |

خلاصة التمريرة: انتهاكان فقط، وكلاهما في هذا الصفّ، وكلاهما في هذا الـpatch.

---

## 4) الجملة التي كان يجب أن يراها

**ما رآه:** «مزامنة البريد: اكتمل آخر فحص» — صحيحة عن الإجراء، وصامتة تمامًا عن السؤال الذي سأله.

**ما تقوله الإشارة الجديدة، بأرقام الإنتاج الحقيقية المقروءة اليوم** (`arrived:13, captured:1, unexplained:4, unrelated:8, needs_attention:0`):

> **مزامنة البريد: الفحص يعمل — وصلت 13 رسالة خلال 24 ساعة: التُقطت 1، و4 لم تُربط بأي طلب (لا رابط صريح بطلب)، و8 غير متعلقة بطلباتنا**

هذه هي الإجابة التي كانت موجودة في `inbox_arrivals` طوال الوقت ولم تُعرض. وهي تخبره بثلاثة أشياء دفعة واحدة: الأنبوب يعمل، ومعظم البريد لم يكن لنا، و**أربع رسائل تبدو ذات صلة ولم يوجد ما يربطها بطلب** — وهذا وحده ما يستحقّ نظره.

ولاحظ أن ترتيب الأولويات كان خطأً في نسختي الأولى، وأمسكته أرقام الإنتاج لا الحجّة: `captured>0` كانت تسبق `unexplained>0`، فكانت الجملة ستصير «التُقطت 1 رسالة» وتُخفي الاثنتي عشرة — أي تكرار نفس اللاجواب بصيغة جديدة.

---

## حدود أُقرّها صراحةً

1. **الإشارة تقيس ما نظرنا إليه.** لو لم يُظهر Gmail رسالةً أصلًا، فلا وصول ولا التقاط، وستقول «لم يصل بريد جديد» — أخضر كاذب. كشف ذلك يتطلّب مقارنة بعدّاد Gmail نفسه، أي نداء مزوّد على مسار القراءة: **تغيير سلوك، وpatch منفصل، ولا أوصي به** (حصّة وتكلفة مقابل عائد نادر).
2. **تعتمد على `CONSTRUCTION_INBOX_ROUTING_V1=1`.** تحت التوجيه الصارم كل رسالة مفحوصة تصير التقاطًا أو وصولًا، فالمحاسبة كاملة. لو أُوقف الفلاغ، تختفي المستبعدات بلا وصول ويصير `arrived` ناقصًا. جعلها كاملة في الوضعين = تغيير سلوك في `gmail-sync.js` (ملف مسار البريد الوارد) → patch منفصل إن أردته.
3. **`NON_ACTIONABLE_REASONS` مكرّرة محليًا** لأن `inbox-routing.js` غير موجود في المراجعة المنشورة (عمل غير مُلزَم لمسار البريد). عند نزوله: استوردها من هناك واحذف النسخة.
4. **إخفاق سابق غير متعلّق:** `tests/construction-company-inbox.test.js` يفشل 1/15 على المراجعة المنشورة نفسها (رابط `tracker` يتسرّب إلى النص المحفوظ عبر `ignoreHref`). ليس من عملي وتحققتُ أنه يفشل بلا تغييراتي — لكنه يستحقّ نظر مسار البريد الوارد.

---

# English summary

**Patch** `.handoff/gmail-sync-honest-signal.patch`, on `3d4ceab3f`. **Reporting only** — no schema, no migration, no new writes, and `gmail-sync.js` / `inbox-arrivals.js` untouched, so nothing about what gets captured changes. Applies clean; 11/11 API and 9/9 UI tests.

**1. The property.** You were right that "messages captured" cannot be it. The row collapses two independent questions into one word: *did we look, and recently* (from `state` + the age of `checked_at`) and *what did looking find* (from `inbox_arrivals`, which records every examined message). Nothing new is stored — the row is a fine event log, and the error was reporting it as the signal. The signal is derived at read time.

The distinction that keeps this from becoming a new lie: `unexplained` is deliberately narrower than `unrouted`. Production right now has 12 unrouted messages, **8 of which arrived before any invite existed** — ordinary mail to info@farq.sa, which the routing engine already classes non-actionable. Counting those as a fault would pin the signal permanently red on a healthy mailbox, which is your warning in the other direction. `healthy: false` requires either work waiting on a person or genuinely unexplained mail.

**2. It regresses.** Every count is windowed and recomputed, so `CAPTURING` decays to `NOTHING_ARRIVED` and `RECENT` decays to `STALE` on the same row with only the clock moving — asserted directly in the tests. A failing pass outranks past captures.

**3. The pass found one more violation, not a field-specific bug.** `captured_count` is displayed to the owner as «رسائل مستوردة» and is a lifetime total that only rises: if capture broke today it would read the same tomorrow. Fixed with the most honest minimal change — the label now says "total since connecting", so it cannot be read as current health. Everything else checks out: `ambiguous_count` resets per pass, `unresolved` is recomputed per call, `completed_at` is used as a timestamp not a health claim, outbox states make no cumulative "sent" claim.

**4. What the owner sees.** He saw «اكتمل آخر فحص» — "last check completed". With today's real numbers he would instead see:

> **Email sync: checking works — 13 messages in 24h: 1 captured, 4 could not be linked to any RFQ (no explicit link to an RFQ), 8 unrelated to our RFQs**

That answer was sitting in `inbox_arrivals` the whole time. Worth noting: my first precedence let `captured > 0` win, which would have said "1 captured" and buried the twelve — the same non-answer in new clothes. Production data caught it, not reasoning.

**Limits stated plainly:** the signal measures what we looked at, so mail Gmail never showed us would still read as "nothing arrived"; closing that needs a provider call on the read path — a behavioural patch I do not recommend. It also depends on `CONSTRUCTION_INBOX_ROUTING_V1=1` for complete accounting; making it complete with strict routing off would mean editing `gmail-sync.js`, which is a separate patch if you want it. Separately, `construction-company-inbox.test.js` already fails 1/15 at the deployed revision (a tracker URL leaking into stored body text) — pre-existing, verified, and the inbox lane's to look at.
