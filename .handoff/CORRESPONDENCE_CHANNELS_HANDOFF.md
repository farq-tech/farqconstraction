# Construction correspondence channels — agent handoff

**Arabic skim:** [`CORRESPONDENCE_CHANNELS_HANDOFF.ar.md`](./CORRESPONDENCE_CHANNELS_HANDOFF.ar.md)

**Audience:** an agent wiring Resend / WhatsApp / Haraj / inbox correspondence so **farqconstraction** can send construction RFQs through the existing Farq API — without inventing a second dispatcher.

**Authoritative Farq tree:** `/Users/m4pro/farq` (`farq-tech/farq`). Mirror may also exist at `/Volumes/Extreme SSD/farq`.

**UI tree:** `/Volumes/Extreme SSD/cunstraction/farqconstraction`

**Live status probe (no secrets):** `GET https://api.farq.sa/api/construction/status`

**Do not commit secrets. Do not dump Railway variable values. Mask anything that looks like a key.**

---

## 1. Purpose

Wire (or verify) the **Farq construction RFQ correspondence stack** so this UI can:

1. Create RFQs and invitations against `api.farq.sa` / local Farq API.
2. **Send** invitations via the single server dispatcher (`createRfqDispatcher`).
3. Prefer **email (Resend)**; treat WhatsApp as **manual WhatsApp Web** handoff; send **Haraj chat** only for Haraj sellers with an explicit `haraj_limit`.
4. Optionally enable **inbound company inbox** (Resend receiving on `replies.farq.sa`) and optional **Gmail sync** — without changing root MX.
5. Preview the outbound RFQ email in-UI before send.

This handoff documents env names, code paths, live flags, and an ordered playbook. It does **not** replace owner approval for live supplier sends.

---

## 2. Architecture

```
farqconstraction (Vite UI)
    │  POST /api/construction/rfqs
    │  POST .../invites/:id/send   { send_consent, haraj_limit? }
    │  POST .../invites/:id/whatsapp-link   (manual WA Web URL)
    ▼
Farq API  api/routes/construction.js
    ▼
repository.sendRfqInvite / createRfq  (supabase-repository.js)
    ▼
createRfqDispatcher.dispatch()   ← ONE dispatcher, THREE channels
    ├─ EMAIL     → Resend (RESEND_API_KEY) or CONSTRUCTION_RFQ_EMAIL_WEBHOOK_URL
    ├─ WHATSAPP  → intentionally NOT Cloud auto-send
    │              status SKIPPED / NOT_SENT + EMAIL_PREFERRED | MANUAL_WHATSAPP_REQUIRED
    │              buyer may open WhatsApp Web via prepareRfqWhatsAppLink
    └─ HARAJ     → haraj-chat.js (WS + REST) when HARAJ_SEND_ENABLED + credentials
                   + category/city match + haraj_limit
    ▼
construction.dispatch_attempts  (per channel, idempotent keys)
construction.rfq_invites.access_token_hash  (portal token for supplier form)
```

**Policy (production code, `rfq-dispatch.js`):**

- Email is preferred when the supplier has a valid email.
- `channels.whatsapp` is reported **`false`**; `whatsapp_manual: true`; `whatsapp_provider: WHATSAPP_WEB`.
- Meta Cloud may still show `whatsapp_configuration.ready: true` (credentials present). That does **not** mean the RFQ dispatcher auto-sends Cloud WhatsApp. Comments in dispatch explicitly refuse activating Cloud from `send_consent`.
- Haraj uses the same rendered invite body; pacing ≥ 20s between Haraj messages; hard-stop on 401/403/429.

**Inbound (separate from outbound send):**

- Resend `email.received` → `POST /api/construction/inbox/webhook` → company inbox tables.
- Optional Gmail OAuth sync for central mailbox reconciliation (`CONSTRUCTION_GMAIL_*`).
- Correspondence replies from the product UI also go through Resend; WhatsApp reply path returns `MANUAL_WHATSAPP_REQUIRED`.

---

## 3. Env var checklist

Server-only (`api/.env` / Railway). **Never** prefix with `VITE_`. Values omitted on purpose.

### 3.1 Outbound email (Resend)

| Name | Purpose | Required for |
| --- | --- | --- |
| `RESEND_API_KEY` | Bearer key for `https://api.resend.com/emails` | Direct RFQ email send (production path) |
| `CONSTRUCTION_RFQ_SENDER_EMAIL` | From mailbox (default `info@farq.sa`) | Branding / deliverability |
| `CONSTRUCTION_RFQ_SENDER_NAME` | From display name (default `فرق للبناء`) | Branding |
| `CONSTRUCTION_RFQ_EMAIL_WEBHOOK_URL` | Alternate HTTPS webhook instead of Resend | Custom email transport (optional) |
| `CONSTRUCTION_RFQ_DISPATCH_WEBHOOK_URL` | Legacy shared webhook fallback | Legacy only |
| `CONSTRUCTION_RFQ_CC_EMAILS` | Optional CC list (comma-separated) | CC on RFQ mail |
| `CONSTRUCTION_QUOTE_NOTIFICATION_EMAIL` | Notify buyer when quote received | Quote-received email |

### 3.2 Inbox / receiving (Resend inbound)

| Name | Purpose | Required for |
| --- | --- | --- |
| `CONSTRUCTION_INBOX_ENABLED` | Master flag for aliases + webhook accept | Receiving live |
| `CONSTRUCTION_CORRESPONDENCE_ENABLED` | Two-way correspondence product surface | Inbox UI / replies |
| `CONSTRUCTION_INBOX_DOMAIN` | e.g. `replies.farq.sa` | Reply-To alias domain |
| `CONSTRUCTION_INBOX_ROUTING_SECRET` | ≥32 chars; seals invitation Reply-To | Stable routing (do not casual-rotate) |
| `CONSTRUCTION_INBOX_WEBHOOK_SECRET` | Resend/Svix webhook signing secret | Webhook auth |
| `CONSTRUCTION_INBOX_RESEND_API_KEY` | Key with **receiving** access | Fetch inbound bodies/attachments |
| `CONSTRUCTION_CLIENT_NAME` / `_PHONE` / `_ADDRESS` / `_LOGO_URL` | Optional brand block in templates | Email chrome |

DNS for receiving lives on subdomain **`replies`** only. **Never change root `farq.sa` MX** (Google Workspace). See Farq `docs/construction-inbox-dns.md`.

### 3.3 WhatsApp (Meta Cloud — config / budget; RFQ auto-send OFF)

| Name | Purpose | Required for |
| --- | --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | Graph System User token | Cloud readiness / admin tools |
| `WHATSAPP_PHONE_NUMBER_ID` | Sender phone number ID | Sending (if ever re-enabled) |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WABA id | Template admin |
| `META_APP_SECRET` (or `WHATSAPP_APP_SECRET`) | Verify `X-Hub-Signature-256` | Inbound webhook |
| `WHATSAPP_VERIFY_TOKEN` | Meta GET handshake | Webhook verify |
| `WHATSAPP_ENABLED` | Kill switch (`0` stops sends) | Ops control |
| `WHATSAPP_GRAPH_VERSION` | e.g. `v23.0` | Pin Graph API |
| `WHATSAPP_SEND_BUDGET` | Hard ceiling on accepted templates | Trial spend guard (needs Redis) |
| `WHATSAPP_SEND_BUDGET_SCOPE` | Counter name / reset | Trial scopes |
| `CONSTRUCTION_WHATSAPP_TEMPLATE_NAME` | Approved RFQ template | Cloud RFQ template (if auto-send restored) |
| `CONSTRUCTION_WHATSAPP_TEMPLATE_LANGUAGE` | Usually `ar` | Template locale |
| `CONSTRUCTION_WHATSAPP_TEMPLATE_URL_BUTTON` | URL button flag | Portal deep link |
| `CONSTRUCTION_WHATSAPP_TEMPLATE_PARAMS` | Ordered body field names | New templates without code change |
| `CONSTRUCTION_WHATSAPP_CONTACT_PHONE` | Enquiry number fallback | Template `{{contact}}` |
| `CONSTRUCTION_RFQ_WHATSAPP_WEBHOOK_URL` | Legacy WhatsApp webhook | Alternate WA transport |

Legacy aliases (`WHATSAPP_CLOUD_*`, `CONSTRUCTION_WHATSAPP_ACCESS_TOKEN`) may still resolve; new envs should use canonical `WHATSAPP_*`. Full Meta doc: `api/docs/WHATSAPP_INTEGRATION.md`.

**Manual path needs no Meta keys** — only supplier WhatsApp E.164 + portal token via `POST .../whatsapp-link`.

### 3.4 Haraj

| Name | Purpose | Required for |
| --- | --- | --- |
| `HARAJ_SEND_ENABLED` | Must be `1` to allow HTTP/WS | Haraj outbound |
| `HARAJ_USER_ID` | Farq Haraj user id (digits) | Auth |
| `HARAJ_TOKEN` | Session/access token | Auth |
| `HARAJ_INBOX_ENABLED` | Poll dispatcher-linked chats | Haraj inbound while company inbox on |
| `HARAJ_FARQ_USER_ID` | Legacy alias for `HARAJ_USER_ID` | Older deploys |

Request body: **`haraj_limit`** must be ≥ selected Haraj sellers on create; for single-invite send of a Haraj seller, API requires `haraj_limit === 1`.

### 3.5 Construction feature flags / DB

| Name | Purpose | Required for |
| --- | --- | --- |
| `CONSTRUCTION_READ_ENABLED` | Catalog / RFQ reads | UI lists |
| `CONSTRUCTION_WRITE_ENABLED` | Mutations | Create / send |
| `CONSTRUCTION_RFQ_ENABLED` | RFQ capability gate | All RFQ routes |
| `CONSTRUCTION_ADAPTERS_ENABLED` | Adapter surface | Usually off |
| `CONSTRUCTION_CROWN_ENABLED` | Crown awards lane | After verified quotes |
| `CONSTRUCTION_DEMO_MODE` | No-login buyer (ignored if `NODE_ENV=production`) | Local UI demos |
| `CONSTRUCTION_DEMO_BUYER_USER_ID` | UUID buyer for demo | Postgres `buyer_user_id` |
| `SUPABASE_CONSTRUCTION_DB_URL` / `CONSTRUCTION_DB_URL` | Construction schema connection | Persistence |
| `REDIS_URL` | Shared counters | WhatsApp send budget fail-closed |

### 3.6 Gmail (optional, independent of Resend)

| Name | Purpose | Required for |
| --- | --- | --- |
| `CONSTRUCTION_GMAIL_ENABLED` | Gmail OAuth surface | Connect mailbox |
| `CONSTRUCTION_GMAIL_SYNC_ENABLED` | Read-only reply reconciliation | Sync worker |
| `CONSTRUCTION_GMAIL_CLIENT_ID` | Google OAuth client | OAuth |
| `CONSTRUCTION_GMAIL_CLIENT_SECRET` | Google OAuth secret | OAuth |
| `CONSTRUCTION_GMAIL_OWNER_ACTOR_ID` | Allowed company actor | Who can connect |
| `CONSTRUCTION_GMAIL_TOKEN_KEY` | 32-byte key (base64) for token encryption | Store tokens |

### 3.7 UI env (farqconstraction) — non-secret

| Name | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | API base (`/_api` with Vite proxy, or `https://api.farq.sa`) |
| `VITE_API_PROXY_TARGET` | Dev proxy target to local Farq API |
| `VITE_FARQ_ACCESS_TOKEN` | **Buyer JWT only** for production auth — not Resend/Haraj/WhatsApp secrets |

---

## 4. Code map

### Farq API (server)

| Area | Path |
| --- | --- |
| Routes | `api/routes/construction.js` — `/status`, `/rfqs`, `.../invites/:inviteId/send`, `.../whatsapp-link`, `/inbox/webhook`, inbox CRUD |
| Dispatcher | `api/lib/construction/rfq-dispatch.js` — `rfqEmail`, `createRfqDispatcher`, channel matrix |
| WhatsApp Cloud helpers | `api/lib/construction/whatsapp-cloud.js` (+ `api/lib/whatsapp/*`) |
| WhatsApp Web handoff | `api/lib/construction/rfq-whatsapp-web.js` → `prepareRfqWhatsAppLink` |
| Haraj | `haraj-chat.js`, `haraj-invite.js`, `haraj-candidates.js`, `haraj-inbox.js` |
| Inbox | `company-inbox.js`, `inbox-*.js`, `correspondence.js`, `inbox-sending.js` |
| Gmail | `gmail-http.js`, `gmail-oauth.js`, `gmail-sync.js`, `gmail-store.js` |
| Persist send | `supabase-repository.js` → `sendRfqInvite`, `recordChannelDispatch`, create RFQ with Haraj limit |
| Runtime wiring | `api/lib/construction/runtime.js` → builds dispatcher + flags |
| Env template | `api/.env.example` (construction block ~L57–110, WhatsApp ~L365–399, Haraj ~L639–644) |

### Tables / concepts

| Concept | Notes |
| --- | --- |
| `construction.rfqs` / `rfq_versions` / `rfq_invites` | RFQ + immutable version + per-supplier invite |
| `construction.dispatch_attempts` | Per-channel attempt: `channel`, `status`, `idempotency_key`, `provider_receipt_id`, `failure_code`, `sent_at` |
| Idempotency key | `{rfq_version_id}:{supplier_id}:[AWARD:]{CHANNEL}` |
| Portal token | Random; **hashed** into `rfq_invites.access_token_hash`; supplier URL `https://www.farq.sa/Construction?supplier_token=...` |
| Haraj receipt | `{topic_id}:{seq_id}` |
| Company inbox messages | Invitation-scoped; email never creates a quote |

### Key HTTP

| Method | Path | Role |
| --- | --- | --- |
| GET | `/api/construction/status` | Flags + `delivery_channels` + WA config + budget (public-ish health) |
| POST | `/api/construction/rfqs` | Create RFQ (+ optional dispatch); body may include `haraj_limit`, `manual_send`, `send_consent` |
| POST | `/api/construction/rfqs/:id/invites/:inviteId/send` | Dispatch one invite |
| POST | `/api/construction/rfqs/:id/invites/:inviteId/whatsapp-link` | Manual WA Web URL (no send receipt) |
| POST | `/api/construction/inbox/webhook` | Resend inbound (signature over raw body) |

### farqconstraction (this UI)

| Wired (2026-09-15) | Notes / remaining |
| --- | --- |
| `constructionClient` — create/send + `haraj_limit`, `prepareConstructionWhatsAppLink`, inbox status/threads, gmail status | No secrets in Vite |
| `SendModal` / `RFQDetailView` — multi-channel dispatch; WA-only → whatsapp-link; Haraj → `haraj_limit` | No Cloud auto-send |
| `OfferDetailView` — email send/preview, Haraj send, manual WA Web button, channel receipts | SENT ≠ human delivery |
| `constructionSuppliers` + match — Haraj sellers included when contactable | Category/city still enforced by API |
| `InboxView` + Shell link — honest inbox/Gmail status + threads | Auth required; no fake inbound |
| `SettingsView` — live channel matrix (email / WA Cloud OFF / WA manual / Haraj / inbox) | Meta ready ≠ auto WA |
| Email preview (`rfqEmailPreview` + modal) | Unchanged |

**Owner map:** [`CHANNEL_MAP_2026_09_15.md`](./CHANNEL_MAP_2026_09_15.md)

**Still needs owner / Railway (names only):** Gmail OAuth by `info@farq.sa`; optional Cloud WA re-enable (code change + approval); Haraj live canary (named supplier + approval); inbox flags if any env missing locally.

---

## 5. Live production status

Fetched from `GET https://api.farq.sa/api/construction/status` (re-fetch before ops; secrets never printed):

| Field | Value (observed) |
| --- | --- |
| `flags.read` / `write` / `rfq` | `true` / `true` / `true` |
| `flags.adapters` / `crown` | `false` / `false` |
| `persistence_available` | `true` |
| `production_writes_enabled` | `true` |
| `delivery_channels.email` | **`true`** |
| `delivery_channels.whatsapp` | **`false`** |
| `delivery_channels.whatsapp_manual` | **`true`** |
| `delivery_channels.whatsapp_provider` | **`WHATSAPP_WEB`** |
| `delivery_channels.haraj` | **`true`** |
| `whatsapp_configuration.ready` | `true` (Meta credentials present) |
| `whatsapp_configuration.provider` | `META_CLOUD_API` (config probe only) |
| `whatsapp_send_budget` | `enforced: true`, `limit: 100`, `sent: 41`, `remaining: 59`, `scope: trial` |

**Interpretation:** outbound RFQ email works; Haraj channel is configured; WhatsApp Cloud is **configured but not used by the RFQ dispatcher**; manual WhatsApp Web is the supported WA path. Budget numbers are ops context only — do not treat them as permission to auto-send Cloud.

Inbox / Gmail flags are **not** fully exposed on this status payload; confirm via Railway env names + `GET /api/construction/inbox/status` (buyer auth) and Farq docs (`INBOX_RECOVERY_2026_09_12.md`, `construction-company-inbox.md`). Historical notes: receiving domain `replies.farq.sa`; root MX must stay Google.

---

## 6. How to preview email

### Server source of truth

`rfqEmail()` in `api/lib/construction/rfq-dispatch.js` builds subject / HTML / Reply-To for Resend.

### Client mirror (this repo)

1. `src/lib/rfqEmailPreview.ts` — `buildRfqEmailPreview()` mirrors layout + Arabic wording.
2. `src/components/RfqEmailPreviewModal.tsx` — sandboxed `iframe` `srcDoc`.
3. `src/views/OfferDetailView.tsx` — button **معاينة الإيميل** next to **إرسال البريد**; opens the modal. Preview link uses placeholder token `PREVIEW-TOKEN` when no portal token is available (display only).

Hooks note: preview `useMemo` must run **before** loading/error early returns (fixed in this handoff turn).

---

## 7. Agent playbook (ordered)

Do not invent a parallel send architecture. Reuse Farq dispatcher + this UI’s existing client.

### A. Local Farq API ready for this UI

1. Use Farq at `/Users/m4pro/farq` (or approved checkout).
2. Set construction DB URL + flags in `api/.env` (names only — copy from Railway privately):
   - `CONSTRUCTION_READ_ENABLED=1`, `WRITE=1`, `RFQ=1`
   - `RESEND_API_KEY` (or email webhook for dry runs)
   - Optional: `CONSTRUCTION_DEMO_MODE=1` + `CONSTRUCTION_DEMO_BUYER_USER_ID=<uuid>` for no-login (see `.handoff/API_DEMO_UUID_PATCH.md`)
3. Confirm `GET http://localhost:<port>/api/construction/status` shows `email: true` when Resend/webhook present.
4. Point farqconstraction proxy: `VITE_API_PROXY_TARGET` → local API; keep `VITE_API_BASE_URL=/_api`.
5. Smoke: create RFQ with ≥2 email-capable suppliers → `sendConstructionRfqInvite` → inspect `dispatch_attempts` for `EMAIL` / `SENT` or honest failure codes.
6. Open Offer detail → **معاينة الإيميل** → confirm HTML matches expectations.

### B. Railway / production send for this UI

1. Confirm live `/api/construction/status` matches section 5 (email on, WA auto off, Haraj as expected).
2. UI auth: production needs buyer JWT (`VITE_FARQ_ACCESS_TOKEN`) or ship behind Farq’s `/Construction` session — **never** put Resend/Haraj/Meta keys in Vite.
3. CORS: ensure this UI origin is allowed on Farq API if hosted outside farq.sa.
4. Canary: one owned mailbox, one invitation, consent recorded — provider receipt ≠ “delivered to human”.
5. For WhatsApp-only suppliers: call `POST .../whatsapp-link`, open returned URL; do **not** expect Cloud auto-send.
6. For Haraj: only after product decision — pass `haraj_limit`, keep pacing/guards; UI currently excludes Haraj sellers.

### C. Inbox (when owner requests receiving)

1. Follow `docs/construction-company-inbox.md` + `docs/construction-inbox-dns.md`.
2. Subdomain MX/DKIM only; **no root MX change**.
3. Set inbox env names; leave flags `0` until webhook + schema + two-company isolation proven.
4. Quality gates: `docs/construction/correspondence-quality-gates.md` / `scripts/construction/verify-correspondence.mjs`.

### D. Do not “fix” WhatsApp by flipping Cloud on

Restoring automatic Meta Cloud RFQ sends requires **explicit owner instruction** and code change away from the current EMAIL_PREFERRED / MANUAL_WHATSAPP_REQUIRED matrix. Config `ready:true` is not authorization.

---

## 8. Do-not list

1. **No `VITE_` secrets** — Resend, Haraj, Meta, inbox routing, Gmail client secrets stay server-side.
2. **No root MX change** on `farq.sa` (keep Google Workspace). Receiving = `replies.farq.sa` only.
3. **No auto WhatsApp Cloud** for RFQ dispatch without owner instruction (current code intentionally disables it).
4. **No printing secrets** — Railway dumps, tokens, webhook secrets, portal tokens in logs/docs/chat.
5. **No Haraj broadcast without `haraj_limit`** (and category/city match); respect hard-stop and 20s pacing.
6. **No inventing a second dispatcher** in the UI — always `.../invites/:id/send` (or Farq create+dispatch).
7. **No treating `SENT` as human delivery** — it means provider acceptance.
8. **No casual rotation of `CONSTRUCTION_INBOX_ROUTING_SECRET`** — breaks existing Reply-To aliases.
9. **No equating Gmail sync health with WhatsApp/Haraj health.**
10. **Do not commit** this handoff’s companion env files with real values (none should be added).

---

## 9. Authoritative docs (Farq)

| Doc | Use |
| --- | --- |
| `api/docs/WHATSAPP_INTEGRATION.md` | Meta env, webhook, budget, 24h window |
| `docs/construction/HARAJ_DISPATCH_AND_QUOTE_TOTALS.md` | One dispatch / three channels, Haraj protocol |
| `docs/construction/INBOX_RECOVERY_2026_09_12.md` | Email-preferred + manual WA; Gmail sync notes |
| `docs/CONSTRUCTION_CORRESPONDENCE_RELEASE.md` | Correspondence release gates |
| `docs/construction-company-inbox.md` | Inbox deployment gates |
| `docs/construction-inbox-dns.md` | `replies.farq.sa` DNS; preserve root MX |
| `docs/construction/correspondence-quality-gates.md` | Verification worksheet |
| `docs/construction/DEPLOYMENT_RUNBOOK.md` | Flag order, rollback |

---

## 10. Related handoffs in this folder

- `API_DEMO_UUID_PATCH.md` — demo buyer UUID for local Postgres RFQs.
- `runtime.demo-uuid.js` — reference patch snapshot for Farq `runtime.js`.

---

*Generated for agent continuity. Re-verify live `/api/construction/status` before production changes. Never paste secret values into tickets or commits.*
