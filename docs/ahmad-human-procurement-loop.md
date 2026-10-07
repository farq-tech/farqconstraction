# أحمد: مراجعة المعمارية وتصميم Human Procurement Loop

التاريخ: 2026-10-07. تجمع هذه الوثيقة المراجعة قبل التنفيذ وحالة التنفيذ المحلي. لم يُنشر التغيير، ولم تُطبّق migration على الإنتاج، وبدأت مراقبة Shadow حيّة للقراءة فقط بتاريخ 7 أكتوبر، دون تفعيل الإرسال الجديد.

## نطاق الأدلة

المستودع الحالي واجهة React فقط. `src/api/apiBase.ts` و`vite.config.ts` يوجهان الطلبات إلى Farq Express. لا يحتوي هذا المستودع على الخادم أو migrations.

بدأ الفحص بنسخة خادم محلية، ثم جُلب `origin/main` من مستودع `farq-tech/farq` واستُخدم أساس `19311fb19` لإنشاء الفرع المعزول `codex/ahmad-human-procurement-loop` في `/Users/m4pro/.codex/worktrees/ahmad-human-loop`. لم يتغير checkout الخادم الأصلي. المطابقة مع البيئة المنشورة تبقى جزءًا من تجهيز Shadow.

## 1. الموجود القابل لإعادة الاستخدام

| الوظيفة | الموجود |
|---|---|
| محادثات المورد | `constructionClient.ts`: threads، messages، files، permissions، owner، RFQ context؛ `ChatPane` و`MessageBubble` |
| تحليل الرسائل | `inbox-ai-pipeline.js` و`inbox-ai-analyze.js`: rules/LLM، confidence، human reasons، quotes، supplier facts |
| المسودات والتدقيق | `inbox_ai_decisions`, `inbox_ai_drafts`, `inbox_ai_audit`, `inbox_reply_drafts`؛ واجهة `InboxAiPanel` |
| ملف المورد | `supplier_profile_facts` و`applyProfileUpdates`؛ نوسع أنواع الحقائق بدل إنشاء ملف موازٍ |
| سياق البنود | `chat.scopedLinesFor`, `allLinesFor`, `rfq-spec-card`, `safeInboundContext` |
| إرسال الرسائل | `inbox_outbox`, reply route، idempotency، retry، broadcast؛ نستخدمها دون sender جديد |
| إشعارات | `buyer_notifications` وworker؛ `NotificationsDrawer` حاليًا يعرض inbound notifications |
| أعضاء وصلاحيات | `/api/business/team`، organization/sector roles، RFQ ownership، `can_reply` |
| تقييم | `inbox-ai-eval.js`؛ ملفات محلية بها 473 سجلًا في gold وinbound export |

### أسباب موثقة للسلوك الحالي

- `inbox-auto-reply.js`، تعليمات `HOLD` تطلب أن يقول إنه سيتأكد ويرجع للمورد، مع عبارة متعارضة «No promises»؛ الصياغة الحرة تطلب الوعد أيضًا عند نقص المعلومة أو إرسال ملف. `needs_human=true` لا يثبت إنشاء مهمة أو إسنادها.
- templates مثل `DECLINE_TEXTS` و`RECORDED_TEXTS` تضم المجاملات المذكورة؛ تعليمات الصياغة تشجع استخدامها وتنويعها.
- `historyFor` في التحليل يقرأ آخر 8 رسائل. `smartWording` يأخذ آخر 4 رسائل مورد. مسار الصياغة الحرة يقرأ 20 رسالة. ليست نافذة سياق موحدة.
- استعلام تاريخ التحليل يضم نصوص outbox دون تصفية حالات الإرسال؛ يمكن أن يرى النموذج نصًا غير مرسل كما لو كان جزءًا من الحوار. يجب التفريق بين SENT/DELIVERED/READ والمقترحات ومحاولات الإرسال.
- RFQ والبنود وprofile facts تدخل التحليل بالفعل؛ المشكلة ليست غيابها الكامل، بل اختلاف السياق بين التحليل والصياغة وفقدان الحالة طويلة المدى.
- توجد تهدئة بعد رسالة بشرية لمدة 30 دقيقة (`HUMAN_QUIET_MS`)؛ هذه لا تعادل Human Takeover دائمًا.
- لم يظهر في نطاق البحث المفحوص workflow متكامل لـquestion task/confirmed item answers/assistant mode. التحقق من الفرع المعتمد يسبق إضافة schema.

## 2. DB/schema المقترح

الأسماء التالية مقترحة وتطابق مع جداول الفرع المعتمد قبل كتابة SQL.

1. `procurement_tasks`: company/tenant، RFQ، RFQ version، item/line، نوع QUESTION_TASK/ATTACHMENT_REQUEST/HUMAN_REVIEW_REQUIRED، attribute canonical، السؤال المنقح، state، priority، owner، timestamps، revision، resolution. مفتاح الدمج scoped إلى الشركة + RFQ version + item + attribute + task type. Unique partial index للمهمة المفتوحة يمنع تكرار الطلبات المتزامنة.
2. `procurement_task_waiters`: task، supplier، invite/conversation، source message، السؤال الأصلي، وقت الطلب، حالة انتظار/إرسال/فشل. unique source message/task. عدد الموردين distinct supplier، وليس عدد الرسائل.
3. `item_confirmed_knowledge`: RFQ/version/item، attribute، value typed، unit، source=HUMAN_CONFIRMED، confirmed_by/at، evidence/attachment، revision، superseded_by. لا نُسقط إجابة قديمة على نسخة مواصفات جديدة دون مراجعة. تحفظ «غير محدد» و«غير متوفرة» كقيم صريحة.
4. `conversation_state`: يرتبط بالـinvite الموجود، assistant_mode AI/HUMAN، human_owner، mode_revision، summary، source_message_watermark، supplier/company/specialties، current RFQ/item، requested/missing specs، asked/answered questions، prices/availability، documents/images، pending actions، آخر intent/action. مصادر الحقائق تبقى الجداول الأصلية؛ الحالة projection قابلة لإعادة البناء، وليست مصدرًا موازيًا للعروض.
5. توسيع audit/decisions الموجودة: intents متعددة مع confidence، extracted facts مع evidence، action، reply/no_reply/human_review، validator results، state/model/prompt versions، old/new comparison. لا جدول قرارات ثانٍ.
6. توسيع notifications الموجودة: PROCUREMENT_TASK، aggregation key، priority، task revision، next digest time. تجميع الإشعار حسب المهمة وحالة الانتظار مع تصعيد زمني، دون إشعار لكل رسالة.
7. ربط outbox الموجود بـtask/answer revision/waiter ومعرف idempotency؛ الأحداث والانتظار durable. إرسال تلقائي محظور إن كانت المحادثة HUMAN حتى لإجابة مهمة أو بث آلي؛ يعرض الرد للموظف.

كل قراءة/كتابة scoped إلى شركة المستخدم وصلاحية RFQ والبند. قواعد DB لا تعتمد على company ID أرسله المتصفح. لا بيانات مورد لشركة أخرى. معاملات وقفل revisions تمنع إجابتين متعارضتين أو سباق takeover مع enqueue/send.

## 3. API المقترح

تحت `/api/construction` وبنفس authentication وpermissions وerror conventions:

- `GET /procurement/tasks`: filters، pagination، عدد التدخلات، waiting suppliers، blocking quotes؛ drill-down RFQ.
- `GET /procurement/tasks/:id`: task + waiters + evidence + allowed actions + suggested reply.
- `POST /procurement/tasks/:id/assign`: owner عضو مخول، expected revision.
- `POST /procurement/tasks/:id/answer`: typed value/unit + expected revision + idempotency. معاملة تحفظ confirmed knowledge وتجهز outbox للمنتظرين؛ لا تعلن SENT قبل نجاح المزود.
- `POST /procurement/tasks/:id/attachment`: upload أو project file مصرح به أو unavailable؛ يربط الملف بالبند ويستخدم sender الحالي.
- `POST /procurement/tasks/:id/close`: إغلاق مسبب وصلاحيات، لا إسقاط المنتظرين بصمت.
- `POST /inbox/threads/:inviteId/assistant-mode`: HUMAN مع owner، أو AI بعد تحديث summary/state إلى آخر رسالة بشرية. إذا فشل التحديث يبقى HUMAN.
- `GET /rfqs/:id/procurement-status`: task counts، distinct suppliers، replied/priced/waiting/declined/no response؛ يوضح المقام وتعريف التداخل بين الحالات.
- `POST /rfqs/:id/knowledge/:answerId/broadcast-preview`: قائمة الموردين المتأثرين ببند/نسخة الإجابة، دون إرسال.
- `POST /rfqs/:id/knowledge/:answerId/broadcast`: approved answer revision + recipient preview hash + idempotency؛ يعيد استخدام broadcast/outbox، مع استثناء HUMAN وتحديث revisions.
- توسيع AI endpoint الموجود لإظهار Shadow decisions/diffs والتدقيق، دون endpoint يرسل من Shadow.

إنشاء المهام من pipeline خدمة داخلية واحدة؛ لا يعتمد على فتح صفحة الموظف. المهمة وwaiter والإسناد والإشعار تُثبت قبل توليد أي وعد. إذا لم يوجد owner قابل للمسؤولية لا يسمح بـ«بتأكد».

## 4. UI داخل التطبيق الحالي

- إضافة «أسئلة الموردين» للتنقل الموجود، وشارة أعلى Shell: «تحتاج تدخلك N» من API الحقيقي.
- بطاقات مرتبة BLOCKING_QUOTE ثم IMPORTANT ثم INFORMATIONAL. تعرض RFQ/البند، السؤال المنقح والأصلي، الموردين وعددهم، وقت/حالة/مسؤول، خيارات موثوقة، إدخال قيمة، والرد المقترح. لا اقتراح مواصفة من نوع المنتج وحده.
- Answer composer يصيغ من القيمة المؤكدة؛ «السماكة المطلوبة 2 ملم». رفع صورة، اختيار ملفات المشروع، وغير متوفرة لطلبات المرفقات.
- رابط «عرض المحادثة» يفتح inbox-thread الحالي. زر «استلم المحادثة» و«إرجاع لأحمد» في ChatPane، مع حالة دائمة وتفاصيل الموظف؛ composer والإرسال البشري الموجودان يعاد استخدامهما.
- تعديل مهم يعرض عدد المستلمين ومعاينة النص ثم إرسال التحديث/عدم الإرسال؛ لا broadcast بمجرد تعديل حقل.
- NotificationsDrawer يعرض المهمة المجمعة، لا محادثة منفصلة لكل سؤال مكرر. استخدام قنوات worker الموجودة مع رصد FAILED/retry.
- RFQ summary الحالي يحصل على العدادات وموقف التسعير. حالات loading/failed تعرض حالة واضحة ولا تُصطنع أرقام.
- شاشة Shadow comparison تعرض supplier text/context/old reply/new decision/intents/facts/action/reason/validation؛ الوصول بحسب الصلاحيات.

## 5. State machine والمسار

`NEW → ASSIGNED → WAITING_BUYER → ANSWERED → SENT_TO_SUPPLIERS → CLOSED`

الإجابة تحفظ معرفة وتبدأ الإرسال في transaction. يبقى ANSWERED أثناء pending/failed delivery. تصبح SENT_TO_SUPPLIERS بعد اكتمال إرسال المستلمين المؤهلين؛ human-held recipients يبقون ظاهرين بانتظار الموظف. worker يعيد المحاولة idempotently دون توليد إجابة مختلفة. إجابة معرفة سابقة تمنع إنشاء مهمة جديدة؛ waiter لاحق يستخدم آخر answer revision الموثوق. CLOSED لا يلغي المعرفة؛ سؤال جديد بعد تغيير المواصفة ينشئ مهمة لنسخة جديدة.

`AI → HUMAN`: قفل conversation + owner + mode revision، إبطال الردود الآلية المنتظرة. يراجع worker mode قبل استدعاء المزود أيضًا. رسالة وصل إرسالها للمزود قبل takeover تسجل كـin-flight، ولا ندعي إمكانية سحبها.

`HUMAN → AI`: جمع رسائل الفريق والمورد المؤكدة حتى watermark، استخراج القرارات البشرية، تحديث summary/state، إبطال المسودات القديمة، ثم mode=AI. فشل أي خطوة يبقي HUMAN.

Pipeline واحد:

`normalize → load trusted context/state → multi-intent classification → facts/entities with evidence → update state → determine action → persist task if needed → REPLY/NO_REPLY/HUMAN_REVIEW → generate → independent semantic validator + deterministic action gate → outbox → send-time gate`

يُحل item mapping قبل السؤال. إذا أكثر من بند محتمل لا تدمج السؤال تحت بند تخميني؛ clarification أو human review. توحيد attribute يدعم thickness والسماكة والتهجئات واللهجات.

## 6. متى يمنع AI من الرد؟

- HUMAN mode أو صلاحية/قناة غير متاحة؛ لا تسمح مهمة أخرى بتجاوز ذلك.
- Shadow mode: لا enqueue، لا send، لا تعديل profile/confirmed knowledge حي ولا إشعار موظف. المهام المقترحة أحداث محاكاة فقط؛ تُسجل comparisons منفصلة.
- مجرد تأكيد/شكر/رمز دون خطوة مفتوحة: NO_REPLY، مع حفظ أي facts مفيدة أولًا.
- غموض البند أو intent منخفض الثقة أو تناقض specs/سياق: HUMAN_REVIEW أو سؤال توضيحي آمن حسب السياسة.
- غضب، اتصال، خلاف سعر، التزام تجاري حساس، بديل يحتاج اعتمادًا، مستند يحتاج قرارًا، أو سؤال خارج الصلاحية: HUMAN_REVIEW_REQUIRED، دون قرار تجاري مختلق.
- مستقبل/وعد دون task ناجح وowner/pending action قابل للمتابعة أو attachment request من النوع الصحيح: منع إرسال.
- الرد لا يجيب الرسالة، يناقض معلومة موثوقة، يكرر سؤالًا مجابًا، يدعي حفظًا لم ينجح، أو يحتوي أرقامًا/مواصفات بلا evidence: منع أو إعادة صياغة.
- فقد context أو failure reading confirmed answers لا يتحول إلى fallback مجاملة أو إجابة تخمينية.
- تغير RFQ version/آخر message/state revision بين التوليد والإرسال: إبطال القرار وإعادة التحليل.

## التقييم والتفعيل

وُجدت 473 رسالة في ملفات gold/export المحلية. هذا عدّ للملفات، وليس إثباتًا مستقلاً أن كل صف يمثل محادثة إنتاج صحيحة أو أن labels مناسبة للمقاييس الجديدة. يلزم تدقيق provenance والرسائل السابقة وربط كل رسالة ببند ونسخة RFQ، ثم استخراج 100+ رسالة حقيقية دون synthetic؛ فصل train/dev/test على مستوى المحادثة لمنع تسرب context.

توسعة gold تشمل intents/facts/reply necessity/required action/allowed promises/context consistency/naturalness/procurement usefulness. يلزم تقييم بشري للدلالة والطبيعية؛ لا يجوز احتساب نسبة نجاح من labels أنشأها النظام نفسه فقط. الأهداف intent≥95%، consistency≥98%، promises=0، unnecessary replies<5%، مع numerator/denominator وحالات الفشل. تصنيفات التقييم القديم ليست بديلًا لهذه المقاييس.

اختبارات ضرورية: سبعة أسئلة متزامنة ينتجون task واحدة، منع cross-company، حفظ إجابة وإرسالها مرة لكل مستلم، retries/partial failures، معرفة متاحة للمورد اللاحق، ملفات/غير متوفرة، تعدد البنود، version changes، فشل إنشاء task يمنع الوعد، takeover أثناء enqueue/send، failure resuming AI، وShadow صفر side effects في النظام الحي.

التسلسل: تثبيت مصدر الخادم المعتمد → مطابقة schema/branches → migrations وخدمات قابلة للمراجعة دون تطبيق إنتاجي → واجهة موجودة → اختبارات ومجموعة تقييم → Shadow حي بتفعيل منفصل بعد جاهزية العامل → تقرير اختلافات فعلي → قرار المستخدم بالتفعيل. لا تغيير لمرسل الإنتاج قبل قرار التفعيل.


## حالة التنفيذ بعد الموافقة

أُضيفت خدمات القرار/الحالة/المهام والمعرفة إلى خادم Farq الحالي، باستخدام مصنف النيات وملف المورد والإشعارات ومرسل المراسلات الموجودين. واجهة «أسئلة الموردين» وعداد التدخل ولوحة RFQ والاستلام البشري وشاشة المقارنة متصلة بـExpress؛ لا توجد بيانات عرض اصطناعية أو خادم منفصل.

الـmigration مضافة في مستودع الخادم بنسختي Supabase ومهاجر Express، ومختبرة في Postgres محلي فقط. الهوية تشمل RFQ/version/line_key وrfq_line_id وitem_id عند توفر بند كتالوج. تحافظ نسخة الإجابة على القيمة والوحدة والمصدر وصاحب التأكيد ووقته، مع تاريخ تصحيحات واضح.

- بناء الواجهة وTypeScript: ناجحان.
- الواجهة الحالية: 73 ملف اختبار، 1925 اختبارًا ناجحًا.
- تحقق المراسلات المطلوب: 132 اختبار خادم و59 اختبار واجهة، وTypeScript ناجحة؛ الإرسال محاكى.
- اختبارات الأجزاء المتأثرة: 71 ناجحًا.
- الحلقة الجديدة: 24 اختبارًا ناجحًا، بينها تشغيل migration والتزامن والعزل على Postgres محلي. تشمل 7 موردين/مهمة واحدة، جوابًا مرة واحدة، تعليقًا أثناء HUMAN، استعادة السياق، اعتماد تصريح موظف صريح بعد رسائل لاحقة للمورد، المعرفة المستقبلية، التصحيح والبث الصريح، منع إعادة الإرسال غير المؤكد، مراجعات حساسة منفصلة، وعدم توفر الصورة، ومنع إجابة أصبحت قديمة عند تغيير RFQ، وتحويل رفض فحص السياق إلى مهمة مراجعة ظاهرة، وملفات واتساب مع مزود محاكى.

لا تمثل هذه الاختبارات رحلة فعلية عبر مزودي الإنتاج. لم يُنشأ PR ولم يحدث دمج أو نشر، ولم تُرسل رسالة اختبار إلى مورد.

## نتيجة التقييم وحدوده

دُققت المطابقة بين `gold-v2.jsonl` و`inbound-all.json` ووُثقت بصماتهما، واستُخدمت 473 رسالة حقيقية من 247 محادثة حسب مصدر التصدير المحلي. ملف العينة الخاص محفوظ محليًا ومستثنى من Git، وفيه حقول مراجعة المقاييس السبعة وفصل dev/test على مستوى المحادثة.

توافق الجزء الممكن مقارنته مع تصنيفات بشرية قديمة: **184/252 = 73.0%**. ليس هذا قياس دقة التصنيف الجديد الكامل، ولا يثبت هدف 95%. الردود المقترحة 49، والوعود غير المرتبطة بمهمة فيها صفر؛ هذا قياس محلي محدود وليس إثباتًا للإنتاج. الاتساق والطبيعية وفائدة المشتريات والحاجة للرد واستخراج الحقائق تحتاج الوسوم الجديدة والسياق الكامل. لا ندّعي تحقيق الأهداف.

الرد القديم التالي لكل رسالة غير موجود في التصدير؛ `our_last` رسالة سابقة وليست الرد القديم المقابل. شاشة Shadow تقرأ فقط outbox مرسلًا ومربوطًا برسالة المورد. لذلك هذا وصف التصدير المحلي القديم. في التحقق اللاحق جُلبت 623 رسالة مع سياقها من قاعدة الإنتاج بمعاملة READ ONLY؛ منها 272 لها outbox مؤكد. ما لم يوجد رد مؤكد مرتبط برسالة المورد فلا يُعرض على أنه رد قديم.

اختبار المفتاح المحلي كان يستخدم قيمة placeholder. تم الوصول إلى إعدادات الخدمة الفعلية في Railway واستخدام `CONSTRUCTION_GEMINI_API_KEY` مع `CONSTRUCTION_AI_MODEL=gemini-3.8-flash`؛ الاتصال الفعلي نجح. صُحح اختيار المفتاح والنموذج وأنواع الحقائق وإعداد التفكير بحسب النموذج. لم يُحفظ أي مفتاح أو DSN في الملفات أو السجل. MODE افتراضيًا OFF ولم تتغير إعدادات التشغيل أو الإنتاج.

القيود الحالية: اختيار الملفات يدعم ملفات الطلب الموجودة في inbox والصور المرجعية الموثوقة في بطاقة البند؛ الصور المرجعية تُرسل كرابط محفوظ دون جلب URL غير موثوق. واتساب/البوابة يدعمان ملفًا واحدًا في الرد؛ ملفات حراج تحتاج مسارًا آخر ويظهر فشل صريح. النص الحر للموظف يبقى في السياق؛ فقط المواصفات الصريحة وغير الملتبسة تُعتمد آليًا عند العودة، والتعارض يبقي HUMAN حتى تصحيح مؤكد.

راجع [قرار المعمارية](/Users/m4pro/.codex/worktrees/ahmad-human-loop/docs/adr/0100-ahmad-human-procurement-loop.md)، و[تقرير العينة الخاصة](/Users/m4pro/.codex/worktrees/86d0/farqconstraction/artifacts/procurement-eval/report.md).

## تحقق لاحق — 7 أكتوبر 2026

- 623 رسالة حقيقية من 321 محادثة؛ 448 رسالة ضمن محادثات بها عدة بنود، و405 بسياق سابق، و73 برسائل ملفات. المصدر قاعدة البناء، بصمة snapshot محفوظة في التقرير الخاص.
- الفصل بين التطوير والاختبار على مستوى invite/conversation. 335 رسالة تطوير، ثم 150 اختبارًا أوليًا، ثم 138 رسالة أخرى للاختبار. نتائج كل إصدار محفوظة؛ التوافق مع وسوم قديمة ليس دقة التصنيف الجديد الكامل.
- الإصلاحات الإضافية: منع حلقات التحية، إجابة سؤال الهوية، طلب السعر عند التوفر، حفظ جهات الإحالة، فصل الردود التلقائية التسويقية عن الأسئلة الفعلية، ونطاق SINGLE/ALL للأسئلة المتعددة.
- كل من مسار الإنتاج والتقييم يستخدم بوابة validatedPlan نفسها لمنع اختلاف قرار المراجعة البشرية بين الاختبار والتنفيذ. المراجع الآلي المستقل يُذكر باسمه، ولا تُوصف وسومه بأنها وسوم بشرية.
- الاختبارات المحلية بعد هذه الإصلاحات: 28 ناجحًا تشمل Postgres حقيقيًا محليًا، ومزودي الإرسال محاكاة فقط.
- Shadow حي يراقب رسائل وصلت بعد بدء المراقبة، منفصل عن إعادة تشغيل الرسائل التاريخية، وبدون writes أو إرسال. التقارير النهائية مرتبطة أدناه بعد اكتمال القياس.
