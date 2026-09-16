# ملخص عربي — قنوات مراسلة البناء (فرق)

مستند التفصيل الكامل (إنجليزي): [`CORRESPONDENCE_CHANNELS_HANDOFF.md`](./CORRESPONDENCE_CHANNELS_HANDOFF.md)  
خريطة المالك: [`CHANNEL_MAP_2026_09_15.md`](./CHANNEL_MAP_2026_09_15.md)

## ماذا يعمل اليوم (إنتاج `api.farq.sa`)

| القناة | الحالة | ملاحظة |
| --- | --- | --- |
| البريد (Resend) | **ON** | `delivery_channels.email: true` |
| واتساب Cloud تلقائي | **OFF** | حتى لو Meta جاهز؛ الموزّع لا يُرسل Cloud |
| واتساب يدوي (WhatsApp Web) | **ON** | `whatsapp_manual: true` / مزوّد `WHATSAPP_WEB` |
| حراج | **ON** | عند ضبط `HARAJ_*` |
| صندوق الوارد (Resend receiving) | مفعّل على الإنتاج (webhook يرد 401 بلا توقيع) | لا تغيّر MX الجذر لـ `farq.sa` |

## ما رُبط في واجهة farqconstraction

- إرسال RFQ عبر Farq مع `haraj_limit` لبائعي حراج.
- واتساب يدوي: `POST .../whatsapp-link` من SendModal / RFQDetail / OfferDetail.
- حراج مُعاد تضمينه في الاختيار والمطابقة والإرسال.
- صندوق وارد: `InboxView` + status/threads + حالة Gmail صادقة.
- الإعدادات تعرض مصفوفة قنوات حية (Meta ready ≠ واتساب تلقائي).
- معاينة الإيميل كما هي.

## متبقٍ على المالك / Railway (أسماء فقط)

- Gmail: تفويض `info@farq.sa` + `CONSTRUCTION_GMAIL_*`
- إن لزم محليًا للوارد: `CONSTRUCTION_INBOX_ENABLED` وباقي `CONSTRUCTION_INBOX_*`
- canary حراج حي: موافقة صريحة بمورد/وجهة/RFQ
- إعادة Cloud WA: ممنوع بدون تعليمات + تغيير كود الموزّع

## أي مفاتيح لأي قناة (أسماء فقط)

1. إيميل RFQ: `RESEND_API_KEY` + `CONSTRUCTION_READ/WRITE/RFQ_ENABLED`
2. وارد: `CONSTRUCTION_INBOX_*` + `CONSTRUCTION_INBOX_ENABLED`
3. واتساب Meta (جاهزية فقط): `WHATSAPP_*` — لا auto-send
4. حراج: `HARAJ_SEND_ENABLED`, `HARAJ_USER_ID`, `HARAJ_TOKEN` + `haraj_limit`
5. Gmail: `CONSTRUCTION_GMAIL_*`

## لا تفعل

- لا تضع أسراراً في `VITE_*`
- لا تغيّر MX الجذر لـ Google Workspace
- لا تفعّل واتساب Cloud تلقائي بدون أمر صريح
- لا تطبع قيم Railway/الأسرار
- لا بثّ حراج بدون `haraj_limit`
