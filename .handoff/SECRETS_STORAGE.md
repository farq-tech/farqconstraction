# أين تُحفظ أسرار Farq API — Secrets Storage

> القاعدة: **القيم تُكتب في 1Password (للتطوير) و Railway (للإنتاج) فقط.**
> الوكلاء (agents) يستلمون **أسماء المتغيّرات فقط** — لا قيم، ولا لقطات شاشة للقيم، ولا لصق في المحادثة.

## الحالة الآن — Status (2026-09-16)

Environment `farq-api-local` **لم يُنشأ بعد**: تكامل تطبيق 1Password مع الـ CLI/MCP غير مُفعّل، وكل نداء ينتهي بـ IPC error.
المطلوب من المالك مرّة واحدة: فتح 1Password → **Settings → Developer → Integrate with 1Password CLI** (وإعادة تشغيل التطبيق، فهو عالق في حالة ما بعد التحديث)، ثم فتح القفل. بعدها يُنشأ الـ Environment بالأسماء المُدرَجة أدناه.

`farq-api-local` is **not created yet** — the 1Password desktop app's CLI/MCP integration is off (`developers.cli.enabled` absent from settings) and the app is stuck in a post-update restart state, so every MCP call fails with an IPC error. Owner action: 1Password → Settings → Developer → **Integrate with 1Password CLI**, restart and unlock the app. The name list below is ready to load as-is.

## القواعد (AR)

1. **قيم التطوير** → 1Password Environment باسم `farq-api-local`، ومنه يُشتَق ملف `.env` محليًا.
2. **قيم الإنتاج** → متغيّرات خدمة Railway. لا تُقرأ قيم Railway ولا تُنسخ إلى أي ملف أو محادثة.
3. **`.env` لا يُرفَع أبدًا إلى git.** مُثبَّت ومُتحقَّق منه:
   - `api/.gitignore` السطر 2: `.env` → `/Users/m4pro/farq/api/.env` مُستثنى، وغير مُتتبَّع في git.
   - `.gitignore` السطر 5 في هذا المستودع: `.env*` → `.env` و `.env.local` مُستثنيان، ولا يوجد أي ملف env مُتتبَّع.
4. المطلوب من الوكيل عند الحاجة لسر: يطلب **الاسم**، ويقول "املأ `X` في 1Password"، ثم يتوقف. لا يطلب القيمة.
5. `.env.example` هو المرجع للأسماء فقط — قيمه دائمًا فارغة أو placeholder.

## ⚠️ تحذير حرج: `CONSTRUCTION_GMAIL_TOKEN_KEY`

هذا **مفتاح تشفير (encryption key)** — وليس رمز API قابلًا للتدوير.

`api/lib/construction/gmail-oauth.js` يستخدمه (base64، 32 بايت) لفكّ تشفير **Google refresh token** المحفوظ في قاعدة بيانات construction.

إذا تغيّر أو أُعيد توليده:

- يصبح refresh token المخزَّن **غير قابل للفكّ نهائيًا** — لا يمكن استرجاعه بأي طريقة.
- ويُفقَد تصريح `info@farq.sa` المحفوظ، ويجب إعادة ربط Google OAuth من الصفر بموافقة المالك.

**لا يُعاد توليده أبدًا "للتجربة" أو "للتأكد أنه يعمل".** التدوير عملية هجرة (إعادة تشفير) مقصودة، لا اختبار.

---

# Where Farq API secrets live (EN)

**Values live in 1Password (dev) and Railway (production). Agents receive variable NAMES only** — never values, never pasted into chat.

- **Dev values** → 1Password Environment `farq-api-local`, materialized into a local `.env`.
- **Production values** → Railway service variables. Never read Railway values; never copy them anywhere.
- **`.env` files are never committed.** Verified: `api/.gitignore:2` ignores `.env` (and `api/.env` is untracked); this repo's `.gitignore:5` ignores `.env*`; no env file is tracked in either repo.
- When an agent needs a secret it asks for the **name** ("fill `X` in 1Password") and stops.

### ⚠️ `CONSTRUCTION_GMAIL_TOKEN_KEY` is an ENCRYPTION key, not a rotatable API token

`api/lib/construction/gmail-oauth.js` uses it (base64, 32 bytes) to decrypt the **Google refresh token stored in the construction DB**. Changing or regenerating it makes that stored refresh token **permanently undecryptable** and destroys the saved `info@farq.sa` authorization, forcing a fresh owner-approved Google OAuth consent.

**It must never be regenerated "to test".** Rotation is a deliberate re-encryption migration, not a smoke test.

---

## Variable inventory — names only

Derived from `api/.env.example`, the real `env.*` / `process.env.*` reads under `api/lib/construction/`, `api/routes/`, `api/lib/whatsapp/`, and this repo's `.env.example`.
`secret` = conceal in 1Password and never echo. `flag` / `id` / `config` = not secret, but still owner-controlled.

### Construction database
| Name | Kind |
| --- | --- |
| `CONSTRUCTION_DB_URL` | **secret** (Postgres URL, embeds credentials) |
| `SUPABASE_CONSTRUCTION_DB_URL` | **secret** (legacy fallback; `CONSTRUCTION_DB_URL` wins) |
| `DB_SSL_REJECT_UNAUTHORIZED` | config |

### Construction feature gates (fail-closed defaults)
`CONSTRUCTION_READ_ENABLED`, `CONSTRUCTION_WRITE_ENABLED`, `CONSTRUCTION_RFQ_ENABLED`, `CONSTRUCTION_ADAPTERS_ENABLED`, `CONSTRUCTION_CROWN_ENABLED`, `CONSTRUCTION_CORRESPONDENCE_ENABLED`, `CONSTRUCTION_INBOX_ENABLED` — all **flags**.
`CONSTRUCTION_DEMO_MODE` (flag), `CONSTRUCTION_DEMO_BUYER_USER_ID` (**id**, uuid).

### Resend / email + company inbox
| Name | Kind |
| --- | --- |
| `RESEND_API_KEY` | **secret** (outbound delivery) |
| `CONSTRUCTION_INBOX_RESEND_API_KEY` | **secret** (server-only, receiving access) |
| `CONSTRUCTION_INBOX_WEBHOOK_SECRET` | **secret** (`whsec_…` from Resend) |
| `CONSTRUCTION_INBOX_ROUTING_SECRET` | **secret** (≥32 chars, stable) |
| `CONSTRUCTION_INBOX_DOMAIN` | config |
| `CONSTRUCTION_RFQ_SENDER_EMAIL`, `CONSTRUCTION_RFQ_SENDER_NAME` | config |
| `CONSTRUCTION_RFQ_CC_EMAILS`, `CONSTRUCTION_QUOTE_NOTIFICATION_EMAIL` | config |
| `CONSTRUCTION_RFQ_EMAIL_WEBHOOK_URL`, `CONSTRUCTION_RFQ_DISPATCH_WEBHOOK_URL` | **secret** (signed endpoints) |

### Gmail OAuth group
| Name | Kind |
| --- | --- |
| `CONSTRUCTION_GMAIL_CLIENT_ID` | id (Google OAuth client id — not a secret, but pair it with care) |
| `CONSTRUCTION_GMAIL_CLIENT_SECRET` | **secret** ← this is the value that leaked in chat. Treat as compromised. Rotating it in Google Cloud Console is the right fix, but plan it: retiring the old client secret can invalidate the stored refresh token and require a fresh `info@farq.sa` consent, so schedule the re-connect in the same window rather than rotating blind. |
| `CONSTRUCTION_GMAIL_TOKEN_KEY` | **secret — ENCRYPTION KEY, see warning above. Never regenerate.** |
| `CONSTRUCTION_GMAIL_ENABLED`, `CONSTRUCTION_GMAIL_SYNC_ENABLED`, `CONSTRUCTION_GMAIL_HISTORY_ENABLED` | flags |
| `CONSTRUCTION_GMAIL_OWNER_ACTOR_ID` | id (uuid) |
| `CONSTRUCTION_GMAIL_RETURN_TO_ORIGINS` | config |

### Inbox worker group
`CONSTRUCTION_INBOX_WORKER_ENABLED`, `CONSTRUCTION_INBOX_WORK_ENABLED`, `CONSTRUCTION_INBOX_WORK_ACTIONS_ENABLED`, `CONSTRUCTION_INBOX_WORK_GLOBAL_ENABLED`, `CONSTRUCTION_INBOX_ROUTING_V1` — **flags**.
`CONSTRUCTION_INBOX_WORK_OWNERS` — config (comma-separated owners).
`CONSTRUCTION_INBOX_ROUTING_V1` stays `0` until the owner approves the routing change — another agent owns that lane.

### WhatsApp (Meta Cloud API)
| Name | Kind |
| --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | **secret** (System User token) |
| `WHATSAPP_VERIFY_TOKEN` | **secret** (webhook handshake) |
| `META_APP_SECRET` | **secret** (X-Hub-Signature-256; `WHATSAPP_APP_SECRET` is an accepted alias) |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID` | id |
| `WHATSAPP_ENABLED`, `WHATSAPP_GRAPH_VERSION` | flag / config |
| `WHATSAPP_SEND_BUDGET`, `WHATSAPP_SEND_BUDGET_SCOPE` | config (spend ceiling — real money per template send) |
| `CONSTRUCTION_WHATSAPP_TEMPLATE_NAME`, `…_TEMPLATE_LANGUAGE`, `…_TEMPLATE_PARAMS`, `…_TEMPLATE_URL_BUTTON`, `CONSTRUCTION_WHATSAPP_CONTACT_PHONE` | config |
| `CONSTRUCTION_RFQ_WHATSAPP_WEBHOOK_URL` | **secret** (endpoint) |

Legacy aliases still resolved by `api/lib/whatsapp/config.js` — do not set in new environments: `CONSTRUCTION_WHATSAPP_ACCESS_TOKEN`, `CONSTRUCTION_WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_CLOUD_*`.

### Haraj
| Name | Kind |
| --- | --- |
| `HARAJ_TOKEN` | **secret** |
| `HARAJ_USER_ID` | id |
| `HARAJ_SEND_ENABLED`, `HARAJ_INBOX_ENABLED` | flags |
| `HARAJ_FARQ_USER_ID` | id — read in code but absent from `.env.example`; confirm before setting |

### Supplier discovery / optional AI
`CONSTRUCTION_DISCOVERY_ENABLED`, `CONSTRUCTION_AI_ENABLED`, `CONSTRUCTION_BOQ_RECOVERY_ENABLED`, `CONSTRUCTION_BOQ_CONTACT_DISCOVERY_ENABLED` — flags.
`CONSTRUCTION_SEARCH_PROVIDER`, `CONSTRUCTION_AI_PROVIDER`, `CONSTRUCTION_AI_MODEL`, `CONSTRUCTION_EXTERNAL_MAX_QUERIES` — config.
`CONSTRUCTION_BRAVE_SEARCH_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` — **secrets**.

### Server basics
`PORT`, `NODE_ENV` — config. `ADMIN_SECRET_KEY` (alias `ADMIN_KEY`) — **secret**.

Deliberately **not** included: `CONSTRUCTION_PROCUREMENT_INTENT_AI*` — the Procurement Intent Engine lane is owned by another agent and its flags are pending owner review.

## Local `.env` handling

`/Users/m4pro/farq/api/.env` already exists and is the owner's working file. A 1Password local env file must **never** be mounted over it. Mount the 1Password-backed copy at a clearly-named sibling (e.g. `/Users/m4pro/farq/api/.env.1password`), diff it, then merge by hand.
