# Phases 0–2: native accounts for فرق للبناء — implemented

Native auth on Farq's own Postgres (Railway). No Supabase project was created,
and Supabase is not the identity store. The `FARQ_AUTH_SUPABASE_*` port is left
untouched and remains available later as a *secondary* login provider.

Nothing is committed. Two repos are touched:
`farqconstraction` (this UI) and `/Users/m4pro/farq` (the API).

---

## The measured gate

Company scope: `44cdaadd-e084-4654-a84b-a95e6c920580` — derived from the data,
not hardcoded.

| | expected | measured | |
|---|---|---|---|
| RFQs | 8 | **8** | ✅ |
| supplier invites | 465 | **465** | ✅ |
| suppliers in the directory | 44,354 | **11,727 visible / 44,354 rows** | ⚠️ explained |

The supplier number is not a loss. All 44,354 rows are present and untouched.
The catalog shows active suppliers that are `PUBLIC`, plus this company's own
`PRIVATE` ones — 9,970 + 1,757 = 11,727. The other 32,622 are `REVIEW`-stage
discovery candidates (mostly Haraj-sourced, unowned); they are deliberately
excluded from the directory list and still surface through BOQ matching and
supplier discovery. The 44,354 figure is the raw table count.

Invitation links: 465 of 465 still carry a token and none has expired.

---

## Phase 0 — verification and cleanup

**The `'BUYER'` role is NOT dead code. My earlier plan was wrong about this.**

It reads as dead from every call site: it is absent from the
`construction.access_users` check constraint, so no account can hold it and no
invitation can produce it. But `lib/construction/boq-recovery-worker.js` builds
its own actor with `role: "BUYER"` to work on a company scope when no human
asked. Deleting it, as planned, would have silently stopped BOQ recovery.

Resolved by naming it instead of removing it — `api/lib/construction/roles.js`:

- `GRANTABLE_ROLES` — the six roles a person can hold, mirroring the DB constraint.
- `SYSTEM_ROLES` / `SYSTEM_BOQ_ACTOR_ROLE` — `BUYER`, worn only by background work.
- `BOQ_PIPELINE_ROLES` — replaces the same literal array that had been
  copy-pasted into three modules (`boq-recovery.js`,
  `supplier-discovery-runtime.js`, `registry-file-search.js`), which is how it
  became unclear whether the synthetic role was load-bearing.

`tests/construction-roles.test.js` parses the migrations and fails if the code
vocabulary drifts from the database constraint, asserts `BUYER` can never be
granted, and asserts the invitation role map can only produce grantable roles.

**Duplicate `constructionHeaders()` removed.** `constructionClient.ts` and
`constructionSuppliers.ts` each had their own copy, so the app could send
different credentials for the same API depending on which module called it.
Both now use `src/api/constructionAuth.ts`, as does `apiBase()`.

---

## Phase 1 — real login in the UI, demo mode still working

`LoginView` was a 1.4-second `setTimeout` that navigated home no matter what
was typed. It now posts to `/api/auth/login` and gets that account's session.

New `src/api/farqSession.ts`. The decisions worth knowing:

- **One account per browser** (the assumed default). One storage key; signing
  in as someone else replaces the session rather than running two identities.
- **The refresh token is single-use.** The server revokes the whole token
  family on reuse, so refreshes are collapsed into one in-flight promise and
  storage is re-read first in case another tab already rotated it. This is the
  bug the main Farq frontend already hit.
- **A failed refresh is not always a sign-out.** Only a 401 ends the session; a
  network blip keeps it and backs off behind a floor, so a dropped connection
  cannot turn into a lost tender or a refresh storm against the rate limit.
- **No session continuity is assumed** — see Security below.

Identity precedence for `/api/construction/*`, in order: a real session, then
`VITE_FARQ_ACCESS_TOKEN` (**now refused in production builds** — one token in
the bundle is a session shared by every visitor), then the demo header.
Never a bearer and the demo header on the same request.

**Demo mode is untouched and still trusted.** `CONSTRUCTION_DEMO_BUYER_USER_ID`
is already the same uuid as the company scope, so the demo actor and the owner's
real account resolve identically.

Per-account state: `src/store/session.ts` now records which account its working
state belongs to and drops the uploaded كراسة, draft RFQ and offers when the
identity changes — including on sign-out, so a shared machine hands over
nothing. The supplier catalog cache is cleared on the same signal.

An expired access token mid-session now refreshes once and retries, instead of
showing "the construction API requires auth".

### A real bug found and fixed on the supplier path

The UI posted supplier quotes to `…/supplier/portal/:token/quote`. The API only
mounts `…/quotes` (plural). **Every supplier quote submission from this UI was
404ing.** Fixed, and both paths are now named constants with a test, because a
silent mismatch there is invisible until a supplier tries to submit.

---

## Phase 2 — the company record and the bridge

`api/scripts/construction/farq-org-bootstrap.js` — dry-run by default,
`--apply`, `--rollback`. Applied successfully.

Created (5 rows, all in `business.*`):

- organization `418041a7-e4f0-4833-994c-d302dc7b7ed1` — «فرق للبناء»
- `business.construction_links` → scope `44cdaadd…`, verified
- subscription on the existing construction plan `5d256fa6…`
- the owner as `OWNER` of his own company, `construction` grant `ADMIN`
- one `business.audit_log` entry

**Zero rows moved. `construction.*` was not written at all.** The bridge points
at the owner's existing scope id, so every RFQ, invite and supplier keeps the
owner it already had.

Why the bridge was the blocker: accepting a construction invitation refuses
with `BUSINESS_CONSTRUCTION_LINK_REQUIRED` unless a verified link says which
legacy scope the organization owns. No organization existed, so nobody could be
invited. The owner also had to be a member of his own company, because the
invite route authorizes on membership, not on being the owner.

### No collision with the Gmail owner gate

`CONSTRUCTION_GMAIL_OWNER_ACTOR_ID` equals the company scope, and the resolved
actor id comes from `construction.access_users`, which this work never wrote.
Verified after applying: the owner still resolves to `ADMIN @ 44cdaadd…`,
bit-for-bit what the gate compares against. Nothing to sequence.

The Procurement Intent Engine was not touched.

---

## Defaults assumed — correct any of these

1. Organization named **«فرق للبناء»**, slug `farq-construction`.
2. Company scope stays the owner's **existing account id**. Zero rows moved.
3. **One account per browser**, not two identities in two tabs.
4. **Seats left at 5.** The plan (`5d256fa6…`) says `users: 5` with
   `invite_members: true`. Raising it is one value — either
   `business.plans.limits.users` (every construction customer) or
   `business.subscriptions.limit_overrides.users` (this company only; the
   correct place). Not changed.
5. The **2,547 ownerless `items` rows** are untouched and unassigned.
6. The existing Al Dafe organization and its link to scope `160d8668…` were
   left exactly as they were.

---

## What the owner must do himself

1. **Set `FARQ_AUTH_JWT_SECRET` on the Farq API.** It is currently unset, so
   `/api/auth/login` answers 503 and nobody can sign in. Nothing else works
   until this is done. Use a freshly generated value — see Security.
2. **Set `BUSINESS_NATIVE_INVITES_ENABLED=1`.** Currently unset, so the native
   invitation path is disabled. `RESEND_API_KEY` is already configured.
3. **Send the invitations.** Only `abdulrhman@farq.sa` (verified, password set,
   `ADMIN`) can currently reach the company data. Seven other `app_auth.users`
   exist with no construction access, none email-verified, including two
   `@aldafe.com` addresses that belong to the other company — do not grant
   those. For each colleague: email, organization role (`MEMBER` is right for
   staff), and sector role, which maps to construction as
   `ADMIN→ADMIN`, `EDITOR→PROCUREMENT`, `ANALYST→MANAGEMENT`, `VIEWER→MANAGEMENT`.
4. **Decide the seat count.** Five includes him, so four colleagues.
5. **Decide the 2,547 ownerless items** — leave shared, or assign to the company.

---

## Security

`FARQ_AUTH_JWT_SECRET` rotation invalidates issued access tokens. **Nothing here
assumes session continuity.** A 401 triggers exactly one refresh; a refused
refresh clears the session and asks for the password again. Refresh tokens are
opaque and stored hashed, so they survive a signing-secret rotation — if you
want every session dead, delete `app_auth.refresh_tokens` as well.

A database password rotation mid-run surfaces as `28P01`; the bootstrap script
reports that plainly instead of retrying into a lockout. No secret value was
read, printed or persisted anywhere in this work — names only.

---

## Test results, honestly

**UI (`farqconstraction`): 125 passed, 0 failed, 6 files.**
22 of those are new (`farqSession.test.ts`, `constructionAuth.test.ts`).
Six phantom failures were removed by excluding macOS AppleDouble `._*` sidecar
files from the vitest glob; this repo sits on an exFAT volume that creates one
next to every file, and they were failing the esbuild transform.

**API (`construction-*` + `business-*`): 803 tests, 755 passed, 35 failed.**
19 of the passes are new. The 35 failures are **pre-existing and not mine** —
established by reverting my three edits and setting aside my three new test
files, re-running, and diffing the failing test names. The two sets are
identical: zero introduced, zero fixed. They come from other agents'
uncommitted work in this shared tree (Gmail/inbox routing, taxonomy and
ontology changes). An earlier run showed 37; the SQL- and timing-heavy tests in
that subset are flaky.

The full `npm test` for the API was not run to completion — it exceeded 14
minutes because it includes grocery, restaurant and crawler suites that call
live services and are unrelated to this work.

New tests cover exactly what was asked:

- real login issuing a per-account session, plus rotation, single-flight
  refresh, cross-tab adoption, clean sign-out on a refused refresh, and a kept
  session on an unreachable server
- an admin inviting an email and assigning a role
- a non-admin unable to invite or to grant itself a role
- a supplier token link working with no buyer session

### Supplier portal — measured, not assumed

`api/tests/construction-supplier-portal-no-session.test.js` drives the real
Express router over HTTP with no credentials of any kind:

- a supplier **opens** an invitation link → 200 with the lines
- a supplier **submits a quote** at `/quotes` → 200 accepted
- the singular `/quote` path → 404, confirming the bug above was real
- a tampered token → 404, never 401 (a supplier has no account to be sent to)
- buyer routes still 401 without an actor, and still 200 with the demo header

So the portal keeps working, demo mode keeps working, and a blanket auth
middleware over `/api/construction` now fails a test instead of 465 links.

---

## Addendum — ownership confirmed, and the client-role question

**Ownership (owner's decision, and the data agrees).** فرق للبناء owns the data;
شركة الدفع is a client. Measured: scope `44cdaadd…` holds **all 8 RFQs**, 1,757
private suppliers and the only `construction.access_users` row. The Aldafe org
`9650aa85…` (slug `al-dafe-contracting`, bootstrapped 2026-09-05 by
`deployment:3aead295`) bridges to scope `160d8668…`, which holds **0 RFQs, 0
projects, 0 access rows** and 5 private suppliers. It is an empty shell. The org
created in Phase 2 stays as-is; nothing is repointed or retired.

**My earlier "don't grant the @aldafe.com accounts" was wrong** and is withdrawn.
They are legitimate client contacts. But no role should be granted yet, for the
reason below.

### None of the six roles fits a client contact cleanly

Static analysis of `lib/construction/supabase-repository.js`: only **8 of 36**
methods gate on `actor.role`. The RFQ lifecycle is not among them.

`MANAGEMENT` (the only sensible candidate — see reachability below) genuinely
blocks: awarding (`ADMIN`/`APPROVER`), opening envelopes, closing submissions,
invoices, payments, receipts, supplier-outcome writes, supplier discovery
writes, inbox replies and thread takeover, Gmail connect, and — at the business
layer — inviting anyone or changing roles.

It does **not** block, because these have no role gate at all:

| method | route | consequence for a client |
|---|---|---|
| `createRfq` | `POST /rfqs` | can open tenders as the company |
| `sendRfqInvite` | `POST /rfqs/:id/invites/:id/send` | **can email/WhatsApp real suppliers as the company** |
| `createRfqVersion` | `POST /rfqs/:id/versions` | can amend a tender |
| `importSuppliers` | `POST /suppliers/import` | **can alter supplier data** |
| `createCustomItem`, `requestItemVerification` | catalog | can add catalog items |
| `getRfqComparison` | `GET /rfqs/:id/comparison` | reads every supplier's prices |
| `createProject` | `POST /projects` | explicitly permits `MANAGEMENT` |

Two of the owner's four prohibitions therefore fail on role alone.

**Role reachability matters too.** An invitation's `sector_role` maps to a
construction role as `ADMIN→ADMIN`, `EDITOR→PROCUREMENT`,
`ANALYST→MANAGEMENT`, `VIEWER→MANAGEMENT`. So `ENGINEER`, `APPROVER` and
`FINANCE` **cannot be granted by invitation at all** — only `ADMIN`,
`PROCUREMENT` or `MANAGEMENT`.

### Second gap: there is no per-project visibility

`business.member_sector_grants` carries `project_ids`, `branch_ids` and
`all_projects`, but those columns appear **nowhere** in `lib/construction/` or
`routes/construction.js` (zero matches). `resolveBuyerActor` returns only a role
and a scope. So any granted member resolves to the whole company scope and sees
**all 8 RFQs and all 465 invites** — including work for other clients. Limiting
a client to their own project is new work, not a role choice.

### Recommended end state

1. Add a role gate to the five ungated write methods, restricted to
   `ADMIN`/`PROCUREMENT`/`ENGINEER`. **Safe to do now:** exactly one
   construction account exists (the owner, `ADMIN`), so no human loses a
   capability. Care needed on `recoverBoqRequirements`, which the BOQ recovery
   worker reaches with the synthetic `BUYER` actor.
2. Then grant both `@aldafe.com` accounts `MANAGEMENT` (invite with
   `organizationRole: MEMBER`, `sectorRole: VIEWER`).

Not applied — awaiting approval.

### URGENT: two live Aldafe invitation links point at the empty scope

`bader@aldafe.com` and `awais@aldafe.com` each have an **unconsumed,
operator-authorized invitation token valid until 2026-09-19**, attached to the
Aldafe org — which bridges to the scope with 0 RFQs. `bader@`'s is
`sector_role: ADMIN`, i.e. construction `ADMIN`.

They are inert only because `FARQ_AUTH_JWT_SECRET` and
`BUSINESS_NATIVE_INVITES_ENABLED` are unset; the accept route calls
`nativeInvitations()`, which throws `BUSINESS_INVITE_NOT_CONFIGURED`. **Setting
those two variables makes both links live.** If either is accepted:

- that person sees nothing (0 RFQs at that scope), and
- `native-invitations.js` then refuses to move them to فرق للبناء
  (`BUSINESS_CONSTRUCTION_OTHER_COMPANY`), until someone deletes their
  `construction.access_users` row by hand.

**Revoke both invitations before enabling the flags.**

### The 9 stale Aldafe memberships — leave them alone

None of the 9 `user_id`s exists in `app_auth.users`, so nobody can sign in as
them; they are retired-provider identities. They sit in the other org, on the
empty scope, and consume Aldafe's seats (9 of an overridden 20), not
فرق للبناء's (1 of 5). No cleanup is needed for this work. One caveat: `accept()`
can adopt a legacy `INVITED` membership onto a real account via
`snapshot.legacy_user_id`, which is how an Aldafe invitation would attach — a
further reason to revoke those two tokens.

### Email verification does not block the invite flow

`accept()` requires the signed-in account's email to equal the invitation email
and checks `disabled_at`, but **never checks `email_verified`**. The one-use
token delivered to that mailbox is the proof of control. Both accounts already
have a password set, so `email_verified: false` is not an obstacle.

### Verified by execution vs reasoned from source

- **Executed:** all data facts above (SQL, read-only); the role-gate matrix
  (parsed from the real source); invite authorization (9 passing tests);
  supplier portal with no session (5 passing tests through the real router).
- **Reasoned only:** a live sign-in and a live invitation acceptance could not be
  run, because `FARQ_AUTH_JWT_SECRET` is unset (`/api/auth/login` → 503) and
  `BUSINESS_NATIVE_INVITES_ENABLED` is unset (accept → 503). "A granted member
  resolves to 8 RFQs / 465 invites" is derived from `resolveBuyerActor` plus the
  verified link scope, not observed through a signed-in session.

## Rollback

```
node --env-file=.env scripts/construction/farq-org-bootstrap.js --rollback
```

Deletes the organization and cascades the four related rows. It refuses once
anyone else has joined, so it is only safe before invitations are accepted.
`construction.*` needs no rollback — it was never written.
