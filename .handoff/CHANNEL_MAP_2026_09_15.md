# خريطة ربط قنوات المراسلة في فرق — Resend / WhatsApp / Haraj / Gmail

**تاريخ الفحص:** 2026-09-15  
**المرجع:** `main` عند `4e0b0763d`  
**الـAPI الحي:** https://api.farq.sa  
**Owner-authoritative.** أسماء المتغيرات فقط؛ القيم في Railway (مشروع Farq، خدمة `farq-api-test-oregon`، بيئة production، وخدمة `farq-construction-inbox-worker`). لا تُطبع قيم الأسرار أبدًا.

مرتبط بـ: [`CORRESPONDENCE_CHANNELS_HANDOFF.md`](./CORRESPONDENCE_CHANNELS_HANDOFF.md)

---

## 0. الحالة الحية الآن (مقاسة من الإنتاج)

`GET https://api.farq.sa/api/construction/status` بتاريخ اليوم:

| القناة | الحالة الحية | الدليل |
| --- | --- | --- |
| البريد (Resend، صادر) | يعمل | `delivery_channels.email: true` |
| البريد الوارد (Resend Inbound → صندوق الشركة) | مفعّل | `POST /api/construction/inbox/webhook` يرد **401** على طلب غير موقّع (لو كان معطّلًا لردّ 503) |
| WhatsApp Cloud (Meta) | مُهيّأ لكن الإرسال الآلي معطّل بالكود | `whatsapp_configuration.ready: true` (6/6) بينما `delivery_channels.whatsapp: false`, `whatsapp_manual: true`, `whatsapp_provider: "WHATSAPP_WEB"` |
| سقف إنفاق WhatsApp | مفروض | limit 100, sent 41, remaining 59, scope trial (يحتاج Redis) |
| WhatsApp webhook الوارد | مثبّت | `GET /webhooks/whatsapp` يرد 403 |
| Haraj (إرسال) | مُهيّأ | `delivery_channels.haraj: true` |
| Gmail (مزامنة قراءة) | مسارات حية، التفويض غير مؤكد | `/inbox/gmail/status` يرد 401 بلا جلسة؛ وثيقة 2026-09-12: لا يوجد تفويض Google محفوظ ويلزم موافقة مالك `info@farq.sa` |

**القرار الأهم:** منذ `0e7da2424` صار WhatsApp تسليمًا يدويًا عبر WhatsApp Web فقط. الموزّع يثبّت `whatsapp:false` ويتخطى Cloud. `EMAIL_PREFERRED` إن وُجد بريد، وإلا `MANUAL_WHATSAPP_REQUIRED`. لا تُعد السلوك الآلي بدون تعليمات المالك. `send_consent` **لا** يعيد تفعيل Cloud.

---

## 1. البريد الصادر (Resend)

- **المسار:** UI → `POST .../invites/:id/send` → `createRfqDispatcher` → `EMAIL` → Resend (`RESEND_API_KEY`) أو webhook بديل.
- **Env (أسماء فقط):** `RESEND_API_KEY`, `CONSTRUCTION_RFQ_SENDER_EMAIL`, `CONSTRUCTION_RFQ_SENDER_NAME`, `CONSTRUCTION_RFQ_EMAIL_WEBHOOK_URL`, `CONSTRUCTION_RFQ_DISPATCH_WEBHOOK_URL`, `CONSTRUCTION_RFQ_CC_EMAILS`, `CONSTRUCTION_QUOTE_NOTIFICATION_EMAIL`.
- **الجداول:** `construction.dispatch_attempts` (channel=`EMAIL`).
- **معاينة العميل:** `src/lib/rfqEmailPreview.ts` + زر «معاينة الإيميل».

## 2. البريد الوارد (صندوق الشركة)

- **Webhook:** `POST /api/construction/inbox/webhook` — توقيع Svix/Resend على raw body.
- **Buyer UI:** `GET /inbox/status`, `/inbox/threads`, `/inbox/messages`, reply/outbox.
- **Env:** `CONSTRUCTION_INBOX_ENABLED`, `CONSTRUCTION_CORRESPONDENCE_ENABLED`, `CONSTRUCTION_INBOX_DOMAIN`, `CONSTRUCTION_INBOX_ROUTING_SECRET`, `CONSTRUCTION_INBOX_WEBHOOK_SECRET`, `CONSTRUCTION_INBOX_RESEND_API_KEY`, اختياري worker/routing/work flags.
- **DNS:** فقط subdomain `replies.farq.sa`. **لا تلمس MX الجذر لـ `farq.sa`.**

## 3. WhatsApp

### طبقات
1. **Cloud config probe** — credentials موجودة → `ready:true` (ليس إذن إرسال RFQ).
2. **RFQ dispatcher** — منذ `0e7da2424`: لا Cloud auto-send؛ يدوي فقط.
3. **Manual Web:** `rfq-whatsapp-web.js` → `POST /api/construction/rfqs/:id/invites/:inviteId/whatsapp-link` → URL `web.whatsapp.com/send` (+ نص الدعوة ورابط البوابة). لا إيصال SENT من مجرد فتح الرابط.
4. **Budget:** `WHATSAPP_SEND_BUDGET*` + Redis — يهم فقط إن أُعيد Cloud.

### Env (أسماء)
`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `META_APP_SECRET`/`WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ENABLED`, `WHATSAPP_GRAPH_VERSION`, `WHATSAPP_SEND_BUDGET`, `WHATSAPP_SEND_BUDGET_SCOPE`, `CONSTRUCTION_WHATSAPP_TEMPLATE_*`, `CONSTRUCTION_RFQ_WHATSAPP_WEBHOOK_URL`.

### إعادة تفعيل Cloud (محظور بدون أمر مالك)
يتطلب تغيير كود الموزّع بعيدًا عن `EMAIL_PREFERRED` / `MANUAL_WHATSAPP_REQUIRED` + موافقة صريحة. لا يكفي `ready:true` أو `send_consent`.

## 4. حراج (Haraj)

- **إرسال:** عند `HARAJ_SEND_ENABLED=1` + credentials؛ نفس جسم الدعوة؛ pacing ≥20s؛ hard-stop على 401/403/429.
- **Body إلزامي:** `haraj_limit` ≥ عدد بائعي حراج المختارين عند الإنشاء؛ لدعوة حراج مفردة عند send: `haraj_limit === 1`.
- **Env:** `HARAJ_SEND_ENABLED`, `HARAJ_USER_ID`, `HARAJ_TOKEN`, `HARAJ_INBOX_ENABLED`, `HARAJ_FARQ_USER_ID` (legacy).
- **استقبال محادثات:** مع inbox worker عند تفعيل الأعلام.

## 5. Gmail (اختياري، قراءة)

- **مسارات:** `/inbox/gmail/status`, `/inbox/gmail/connect`, `/inbox/gmail/callback`.
- **Env:** `CONSTRUCTION_GMAIL_ENABLED`, `CONSTRUCTION_GMAIL_SYNC_ENABLED`, `CONSTRUCTION_GMAIL_CLIENT_ID`, `CONSTRUCTION_GMAIL_CLIENT_SECRET`, `CONSTRUCTION_GMAIL_OWNER_ACTOR_ID`, `CONSTRUCTION_GMAIL_TOKEN_KEY`.
- **Blocker:** تفويض OAuth لمالك `info@farq.sa` — لا تخترع أسرار Google في الواجهة.

## 6. الموزّع المشترك

مسار واحد فقط: `createRfqDispatcher` في `api/lib/construction/rfq-dispatch.js`.  
القنوات: EMAIL / WHATSAPP (يدوي) / HARAJ.  
لا تبنِ موزّعًا ثانيًا في Vite.

## 7. قيود تشغيل

1. لا أسرار في `VITE_*` / commits / chat.
2. لا تغيير MX الجذر.
3. لا إرسال جماعي حي بدون مسار dry-run؛ الـcanary يتطلب تسمية المورد/الوجهة/القناة/RFQ/النص + موافقة صريحة واحدة.
4. لا تفعيل WhatsApp Cloud تلقائي بدون أمر المالك.
5. واجهة الحالة صادقة: Meta ready ≠ واتساب تلقائي ON.

## 8. قائمة تحقق للوكيل (تنفيذ الواجهة)

- [x] إظهار قنوات الحالة بصدق من `/api/construction/status` (+ inbox/gmail status عند المصادقة).
- [x] إرسال RFQ عبر `create` + `.../send` مع `haraj_limit` عند وجود حراج.
- [x] زر واتساب يدوي → `.../whatsapp-link` → فتح الرابط؛ لا Meta tokens في الفرونت.
- [x] تضمين بائعي حراج في الاختيار/الإرسال عند تفعيل القناة.
- [x] ربط صندوق الوارد: status + threads (صادق إن معطّل).
- [x] Gmail: status في الإعدادات/الصندوق؛ التفويض يبقى على المالك.
- [x] حدّث هذا الملف + `CORRESPONDENCE_CHANNELS_HANDOFF*.md` بما تم ربطه.

### ما رُبط في farqconstraction (هذه الجولة)
`constructionClient` (send/haraj_limit/whatsapp-link/inbox/gmail)، `SendModal`, `RFQDetailView`, `OfferDetailView`, `InboxView`, `SettingsView` قنوات، `constructionSuppliers`+match مع حراج، Shell رابط الصندوق.

### متبقٍ تفعيل Railway / مالك (أسماء فقط)
`CONSTRUCTION_INBOX_*` إن لزم محليًا؛ `CONSTRUCTION_GMAIL_*` + موافقة `info@farq.sa`؛ canary حراج بموافقة؛ Cloud WA ممنوع بدون أمر.

---

*لا تلصق قيم Railway هنا. أعد قياس `/api/construction/status` قبل أي canary.*
