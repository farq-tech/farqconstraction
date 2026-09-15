# Farq Construction — Architecture Inventory

**Date:** 2026-09-15  
**Target:** `farq-tech/farqconstraction` becomes the official production Construction app  
**Source of proven capabilities:** Construction domain inside Farq monolith (`api.farq.sa` + `www.farq.sa/Construction`) backed by Supabase `farq-main`  
**Repo access note:** GitHub clone of `farq-tech/farq` returned 404 for this agent identity. Inventory below is reconstructed from: (1) live Construction SPA bundle, (2) live Construction API probes, (3) Supabase `farq-main` schema/data, (4) full `farqconstraction` frontend. Source-repo extraction remains a hard dependency for engine reuse.

---

## A. CURRENT STATE

### A1. `farqconstraction` (NEW)

| Area | Reality |
|------|---------|
| Purpose | Figma Make clickable prototype for «فرق \| بناء» |
| Stack | React 19 + Vite 8 + Tailwind v4 only |
| Backend | **None** |
| Auth | Fake `setTimeout` login → always succeeds |
| Data | Hardcoded `src/data.ts` mock BOQ/RFQs/suppliers |
| Navigation | `useState<AppView>` in `App.tsx` — **not deep-linkable** |
| Bundle | Eager import of **all** views in `App.tsx` |
| Upload | Fake staged timers; file never leaves the browser |
| Persistence | React memory only; refresh → back to login |
| Server state | None (no query library) |
| Error UX | Mostly happy-path UI; no route error boundaries |

Screens exist and match the product brief UX (upload → proposals → send → RFQ → offers → comparison → award → supplier portal), but they are **demo chrome**.

### A2. Proven Construction system (OLD / LIVE)

| Layer | Location | Status |
|-------|----------|--------|
| Web UI | `www.farq.sa/Construction` (lazy `ConstructionPage` chunk inside consumer Farq SPA) | Live |
| API | `https://api.farq.sa` (Express on Railway/`hikari`) | Live |
| DB | Supabase project `farq-main` (`mpgbvtaguerncgbzvpwg`), schema `construction` + `registry` | Live |
| Auth | Supabase Auth + `construction.access_users` roles | Live |
| Consumer Farq | `www.farq.sa` restaurants/grocery | Separate product; shares API host |

**Live Construction API surface (authenticated unless noted):**

- `GET /api/construction/status` (public) — flags: `read/write/rfq=true`, `adapters/crown=false`
- `GET /api/construction/me`
- `GET|POST /api/construction/projects`
- `GET|POST /api/construction/rfqs`, `GET /rfqs/:id`, `GET /rfqs/:id/comparison`
- `POST /rfqs/:id/invites/:inviteId/send`, WhatsApp link, supplier-outcomes
- `POST /api/construction/boq/parse-pdf` (raw PDF body, **30MB**, **600s** timeout)
- `GET /api/construction/boq/extraction/:id`
- `POST /api/construction/boq/match`
- `POST /api/construction/boq/recover` + `recovery-status`
- `POST /api/construction/suppliers/match` (+ import, review-candidates)
- `GET /api/construction/catalog`, items bulk/custom
- `POST /api/construction/awards` (+ receipts/invoices/payments)
- Inbox / Gmail / supplier portal quote endpoints

**Observed DB scale (2026-09-15):**

| Entity | Count |
|--------|------:|
| `construction.suppliers` | 245,729 |
| suppliers `PUBLIC` | 9,808 |
| suppliers `REVIEW` | 235,912 |
| `construction.items` (catalog) | 3,084 |
| `catalog_products` | 182,510 |
| `supplier_item_capabilities` | 1,332 |
| `registry.product` / `offer` | 13,422 / 11,895 |
| `projects` / `rfqs` | 1 / 1 (thin production RFQ usage so far) |
| `supplier_quotes` / `awards` | 0 / 0 |
| `access_users` | 13 (ADMIN/ENGINEER/PROCUREMENT/APPROVER/FINANCE/MANAGEMENT) |

**Storage buckets:** `catalog-images`, `grocery-source-archive` only — **no durable BOQ document bucket**.

### A3. End-to-end journey as it works today (OLD)

```
Login (Supabase)
→ Construction page (hash/local step state, not URL-first)
→ Build order from catalog OR upload BOQ PDF
→ POST /boq/parse-pdf (blocking request, PDF in body)
→ poll GET /boq/extraction/:id
→ optional /boq/recover + recovery-status
→ POST /boq/match (catalog normalize)
→ POST /suppliers/match (local DB fast path + candidates)
→ Draft order + suppliers held in localStorage
→ POST /rfqs (versioned payload)
→ dispatch invites (email/WhatsApp/Haraj)
→ supplier portal quote
→ comparison → award (governance checks)
```

**Critical observation:** Order lines, pending BOQ recovery rows, selected suppliers, and project draft are stored in **browser localStorage** keys such as:

- `farq-construction-order-v2`
- `farq-construction-pending-boq-v1:{userId}`
- `farq-construction-selected-suppliers-v1`
- `farq-construction-project-draft-v3`
- `farq-construction-material-suppliers-v1`

RFQ versions in Postgres are durable once submitted. The BOQ/upload/matching working set before RFQ submit is **not** modeled as immutable server-side BOQ versions.

---

## B. ROOT CAUSES

1. **No durable BOQ version aggregate** — upload/parse results are not first-class immutable DB versions; working set lives in client memory/localStorage.
2. **Synchronous parse path** — `POST /boq/parse-pdf` with raw PDF + 600s timeout couples browser request lifetime to extraction.
3. **No object-storage-first upload** — file is not acknowledged as durable object before processing; no BOQ storage bucket.
4. **localStorage as source of truth for drafts** — Safari close/refresh/multi-tab races → lost/stale state.
5. **Construction embedded in consumer SPA** — shared critical path, shared API warmup (`critical_offers_warmup_pending`), shared deploy risk.
6. **New app is prototype-only** — mock data, fake delays, no router → white-screen/state-loss class of bugs by design.
7. **Supplier proposals screen risk** — old UI can over-fetch; new prototype eagerly embeds suppliers inside every BOQ item mock (N×supplier render).
8. **UX/product mismatch** — old Construction still exposes packages / engineering department / catalog-browse mental model; new product brief is BOQ-first 3-step flow.
9. **Thin write history** — only 1 RFQ in DB; awards/quotes empty → production write path exists but lightly exercised.
10. **Source engines not yet extractable** — without `farq` repo access, cannot safely share BOQ worker/matching code; risk of accidental reimplementation.

---

## C. KEEP FROM OLD (reuse / extract / share)

| Capability | Why keep |
|------------|----------|
| `construction` Postgres schema | Projects, RFQ versions, lines, invites, quotes, awards, audit, inbox already production-shaped |
| Versioned RFQ model (`rfqs` + `rfq_versions` + fingerprint uniqueness) | Idempotent commercial versions |
| `dispatch_attempts.idempotency_key` UNIQUE | Prevents duplicate sends |
| Award governance constraints (reason length, status/approved_at checks) | Compliance |
| Supplier directory + trgm indexes + `supplier_item_capabilities` | Local matching fast path |
| Catalog (`items`, `catalog_products`, ETIM) | Normalization target for BOQ lines |
| Registry schema | Product identity / offers for enrichment (background only) |
| Construction auth roles in `access_users` | Real RBAC |
| BOQ engines behind `/boq/parse-pdf|extraction|match|recover` | Proven extraction/recovery/match — **extract, don’t rewrite** |
| Supplier match API (`/suppliers/match`) | Local DB matching |
| Supplier portal token invites | Secure no-account supplier response |
| Inbox / correspondence (email/WhatsApp/Haraj) | Post-send operations |
| API envelope `{ok,data,errors,meta.requestId}` | Correlation already present |
| Feature flags in `/status` | Strangler controls |

---

## D. REMOVE / STOP USING

| Item | Why |
|------|-----|
| Mock `src/data.ts` on production path | Fake supplier counts / RFQs |
| Fake login/upload timers | Lies about durability |
| `useState` view machine as navigation | Breaks refresh/deeplink |
| Giant eager `App.tsx` imports | Bootstrap weight |
| localStorage order/BOQ/supplier draft as SoT | Data loss |
| `x-construction-demo-user` in production clients | Auth bypass pattern |
| Engineering-department / package builder as primary UX | Contradicts product brief |
| Consumer grocery/restaurant warmup on Construction critical path | Shared `/health` 503 reason |
| Destructive “replace current BOQ items” patterns if present in old upload UX | P0 durability |
| External web discovery on critical path | Must be background lane only |
| Duplicate Construction engines copied blindly into new repo | Divergence |

---

## E. BUILD NEW

1. **Independent Construction web app** in `farqconstraction` with real router + code splitting.
2. **Construction BFF** (or isolated `/api/construction` service ownership) that does **not** depend on grocery warmup.
3. **Immutable BOQ document/version model** + object storage + durable job queue.
4. **Read models**: `ProjectProcurementSnapshot`, item supplier page, RFQ overview.
5. **Server-state client** (TanStack Query) with versioned query keys, cancellation, last-known-good.
6. **Route error/loading/empty/retry shells** — zero blank screens.
7. **Observability** (request/project/document/version/job/item/rfq IDs + SLOs).
8. **Strangler feature flags** Phase A→E.
9. **Mobile Safari hardening** for upload + long lists (virtualization).

### E1. Required new persistence (additive; do not duplicate RFQ model)

```
construction.boq_documents
construction.boq_versions          -- immutable; active pointer on project
construction.boq_version_items     -- extracted lines for THAT version only
construction.boq_jobs              -- extraction/normalize/match jobs
construction.boq_matching_snapshots
storage bucket: construction-boq
```

States: `UPLOADING → UPLOADED → QUEUED → EXTRACTING → NORMALIZING → READY → MATCHING → COMPLETE | FAILED`

Activation rule: new version becomes Active **only** after successful extraction + validation + persistence transaction. Failure never demotes/deletes prior Active.

---

## F. TARGET ARCHITECTURE

```
Farq Construction Web (farqconstraction)
  React Router + TanStack Query + Error Boundaries
        ↓
Construction BFF / API (bounded context)
  authz (access_users) · idempotency · read models · signed uploads
        ↓
Domain services (shared package extracted from farq)
  boq-parse · normalize · catalog-match · supplier-match · rfq · award
        ↓
PostgreSQL schema construction (+ registry read-only)
Object storage construction-boq
Durable job queue → Extraction/Matching workers
```

**Hard rule:** Restaurants/Grocery/Consumer Farq MUST NOT be on Construction critical path (health, deploys, request threads, shared blocking warmups).

**File path:**

```
Browser → signed URL → Object Storage
→ boq_documents/boq_versions row (UPLOADED)
→ enqueue job
→ worker extraction → version items only
→ activate version on success
→ local supplier matching (async, progressive)
→ UI polls snapshot
```

---

## G. DATA MIGRATION PLAN

| Phase | Action |
|-------|--------|
| G0 | Keep reading `farq-main.construction.*` — no destructive DDL on RFQ/award tables |
| G1 | Add BOQ version tables + storage bucket (additive migrations) |
| G2 | Backfill: existing RFQ payloads do **not** invent BOQ versions; leave historical RFQs as-is |
| G3 | New uploads write BOQ versions; RFQ creation references `boq_version_id` |
| G4 | Optional: import localStorage drafts only via explicit user recovery tool (never silent) |
| G5 | Cutover Construction web DNS/app entry to `farqconstraction`; keep old `/Construction` read-only/shadow |
| G6 | Do **not** migrate consumer restaurant/grocery schemas |

Tenant isolation remains `owner_user_id` / `buyer_user_id` / `scope_owner_user_id` + RLS backend role patterns already in place.

---

## H. IMPLEMENTATION PHASES

| Phase | Scope | Gate |
|-------|-------|------|
| **0 — Inventory & foundation** *(this PR)* | Architecture doc; real router; query client; API client; error boundaries; env wiring; strip fake-login as default | Build passes; deeplinks restore shell; no blank route |
| **A — Read production** | Auth via Supabase; list projects/RFQs from API; procurement snapshot read model | Login real; refresh keeps session; projects from server |
| **B — Durable BOQ upload** | Signed upload, version rows, async extraction flag | Upload ack <2s after transfer; failure keeps prior Active |
| **C — Local supplier matching** | Snapshot + per-item suppliers endpoint; virtualization | Items visible with supplier_count=0; local matches within seconds |
| **D — RFQ create/send** | Idempotent RFQ + invite send | No duplicate RFQ/invite on double-click |
| **E — Offers / comparison / award** | Wire existing quote/compare/award APIs | Governance award works; audit events written |
| **F — Isolate runtime** | Dedicated Construction service/health; remove grocery warmup dependency | Construction `/ready` independent |

Shadow/compare against old `/Construction` at each write phase before cutting traffic.

---

## I. RISKS

| Risk | Mitigation |
|------|------------|
| No GitHub access to `farq` source | Block engine extraction until access; call live API / share package later |
| Reimplementing BOQ engines | Forbidden; wrap existing endpoints first |
| Shared API host warmup outages | Isolate Construction readiness |
| 245k suppliers / over-fetch | Snapshot + per-item lazy APIs + virtualization |
| Dual-write during strangler | Feature flags; shadow compare; old stays up |
| RLS/backend-only writes | Keep mutating paths on BFF with service role; never trust frontend |
| Safari upload flakiness | Resumable/signed upload + server status recovery |
| Accidental consumer regressions | No edits to restaurant/grocery code paths |

---

## J. ACCEPTANCE TESTS

### Durability / correctness
1. Real login (Supabase Construction user).
2. Create/open real project.
3. Upload real PDF/XLSX/CSV.
4. Object exists in storage after ack.
5. Items persisted for that version in DB.
6. Refresh restores project + BOQ status from server.
7. Upload Version B does not delete Version A.
8. Version B failure leaves Version A Active; B=`FAILED` + Retry.
9. Suppliers from Farq local data (`suppliers` / capabilities), not mocks.
10. Items render with `supplier_count=0`.
11. Real RFQ create.
12. Real supplier portal response.
13. Offers appear.
14. Comparison normalizes comparable quotes only.
15. Award requires reason / governance.
16. Mobile Safari pass (viewport, bfcache, upload, long list).
17. No blank screen on API failure (partial + retry).
18. Production build succeeds.
19. Critical automated tests green.
20. Correlation IDs present upload→worker→UI.

### Failure drills
Large PDF, invalid file, disconnect mid-upload, refresh during extraction, Safari kill+return, duplicate upload, Version B while A runs, worker crash, API/DB timeout, partial matching, 0 suppliers, 100+/500+ items, double-click Send RFQ, two-tab edit, stale response, deploy mid-job.

### SLO budgets (initial; revise with measurements)
| Metric | Budget |
|--------|--------|
| Initial usable shell | < 1.5s p75 good mobile |
| Project snapshot API | p95 < 500ms |
| Open saved project usable | < 2s p75 |
| Upload acknowledgment | < 2s after file transfer |
| Saved BOQ durability after ack | 99.99% |
| Refresh state loss | 0% intentional |
| White screen known cases | 0 |
| Local matching first results | seconds, progressive |

---

## Priority order (non-negotiable)

1. **P0** Data must never disappear  
2. **P0** Upload must be durable  
3. **P0** No blank screen  
4. **P0** Project/route state survives refresh  
5. **P1** Fast project/BOQ display  
6. **P1** Local supplier results immediately  
7. **P1** RFQ reliability  
8. **P2** UX polish  

---

## Blockers for full engine extraction

1. Grant read access to `farq-tech/farq` (or provide `FARQ_SOURCE_REPO_TOKEN`).
2. Confirm Construction BFF ownership plan: shared `api.farq.sa` strangler vs new service.
3. Confirm Supabase project for Construction writes remains `farq-main` (recommended) vs new DB.
