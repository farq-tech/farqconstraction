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

Approved by the owner and applied. See "Addendum 2" at the end of this file.

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

---

# Addendum 2 — the three approved actions, applied

Done in the order the owner gave, which matters: step 1 closes a window that
step 3 would otherwise have widened.

## 1. Both Aldafe invitation tokens revoked

`scripts/construction/aldafe-invitation-revoke.js --apply`

| email | invitation | was | now |
| --- | --- | --- | --- |
| `bader@aldafe.com` | `0a841242…` | PENDING, `sector_role: ADMIN` | **REVOKED** |
| `awais@aldafe.com` | `09d230ef…` | PENDING, `sector_role: VIEWER` | **REVOKED** |

Revoked, not deleted. `business.invitations.status` has a `REVOKED` value in its
check constraint, and that alone is sufficient: the token lookup in
`native-invitations.js` joins the invitation and requires
`i.status='SENT' or (i.status='PENDING' and t.operator_authorized)`, so a
revoked invitation can never resolve a token again. The `invitation_tokens` rows
and both `business.audit_log` trails are intact, so who invited whom and when is
still answerable. The stored token is a one-way digest, so keeping it leaks
nothing.

**Proof, measured with the server's own predicate.** The script re-runs the
exact `WHERE` clause from `lookup()` rather than a paraphrase of it, because
"no live token remains" is only a real claim if it is tested the way the server
tests it:

```
live_tokens_against_empty_scope  2 -> 0
adoptable_invited_memberships    2 -> 0
LIVE TOKENS SYSTEM-WIDE          0
```

The second number is the `accept()` hazard, now closed. The adoption is only
reachable when all three of `accept()`'s guards hold at once
(`native-invitations.js:224-231`): the membership is `INVITED`, its `user_id` is
**not** a real `app_auth` account, and a live token names that id in
`snapshot.legacy_user_id`. Before: both Aldafe tokens named a retired id that
matched a stale `INVITED` membership. After: zero live tokens system-wide, so no
token names anything. The stale memberships are inert again — a stale membership
was never the danger on its own; the live token was the key.

## 2. The five write paths are gated

New role vocabulary in `api/lib/construction/roles.js`:

- `PROCUREMENT_WRITE_ROLES` = `ADMIN`, `PROCUREMENT`, `ENGINEER`
- `SUPPLIER_WRITE_ROLES` = the same three **plus** the synthetic `BUYER`

| method | gate |
| --- | --- |
| `createRfq` | `canWriteProcurement` |
| `sendRfqInvite` | `canWriteProcurement` |
| `createRfqVersion` | `canWriteProcurement` |
| `createCustomItem` | `canWriteProcurement` |
| `importSuppliers` | `canWriteSuppliers` |

Applied in **both** repositories so demo and production enforce one contract.

`createRfqVersion` in the Supabase repository was already an unconditional 409
("amendment requires resend workflow"). The role check still goes first, so
authorization does not depend on a workflow gap that a later commit will close.

### Why `importSuppliers` admits the synthetic role

This is the trap the owner warned about, and it was real.
`adoptDiscoverySupplier` in `supplier-discovery-runtime.js:239` calls
`repository.importSuppliers` with the **caller's** actor, and that function
admits `BOQ_PIPELINE_ROLES`, which includes the pipeline's synthetic `BUYER`.
Gating the import to the three human roles alone would have made that path throw
for the worker's actor.

Admitting `BUYER` grants no human any extra reach, because `BUYER` is not
grantable: the `construction.access_users` check constraint cannot store it, and
`construction-roles.test.js` fails if that ever stops being true.

### The recovery worker, tested rather than reasoned about

`tests/construction-write-role-gates.test.js` — 6 tests, all passing:

- `boq-recovery-worker.js` calls exactly one repository method,
  `matchBoqCatalog`. It is exercised with the worker's actor against the real
  repository and still returns rows.
- `importSuppliers` is exercised with the worker's actor and is **not** refused.
- A source-level guard asserts the role literal in `boq-recovery-worker.js` is
  still inside `SUPPLIER_WRITE_ROLES`. If someone later narrows the import to
  the three human roles, that test fails loudly instead of the recovery worker
  dying quietly and surfacing weeks later as missing BOQ data.

### Verdicts on the two the owner asked about

**`createProject` — gated.** It permitted `ADMIN`/`PROCUREMENT`/`MANAGEMENT`, so
it was the last write a granted client could reach. `MANAGEMENT` removed. The
owner's acceptance of company-wide read visibility rests on there being no such
path, so leaving it would have made that acceptance false. `MANAGEMENT` keeps
its finance and portfolio **reads** (`listProcurementFinance`).

**`getRfqComparison` — deliberately NOT role-gated.** Gating it would be
cosmetic rather than protective:

- `listBuyerRfqs` is ungated and already returns `received_base_quote_total` per
  RFQ, computed from the same `supplier_quotes` rows.
- `listProcurementFinance` gates on `ADMIN`/`PROCUREMENT`/`APPROVER`/`FINANCE`/
  `MANAGEMENT` — it *deliberately* includes `MANAGEMENT`, and exposes committed
  and awarded totals.
- No read path in the construction repository gates on role at all.

So hiding the comparison would withhold per-supplier line detail while leaving
per-RFQ and per-project totals visible — false comfort. The sensitivity the
owner is worried about is a **scope** problem, not a **role** problem, and he
has explicitly accepted the scope exposure for now. The real fix is the
per-project work below.

## 3. Two `MANAGEMENT` invitations recorded against the correct org

`scripts/construction/aldafe-client-grant.js --apply`

| email | invitation | org | org role | sector role | construction role |
| --- | --- | --- | --- | --- | --- |
| `bader@aldafe.com` | `65d64d61…` | `farq-construction` `418041a7…` | `MEMBER` | `VIEWER` | `MANAGEMENT` |
| `awais@aldafe.com` | `34128843…` | `farq-construction` `418041a7…` | `MEMBER` | `VIEWER` | `MANAGEMENT` |

`sectorRole: VIEWER` is what produces `MANAGEMENT`: the map in
`native-invitations.js` is `ADMIN→ADMIN`, `EDITOR→PROCUREMENT`, and both
`ANALYST` and `VIEWER→MANAGEMENT`. `VIEWER` is the lower of the two that land on
`MANAGEMENT`, so it is the one to ask for.

**No token was minted, deliberately.** A token is the live credential, and a
live token is precisely the hazard just closed in step 1. Minting happens in
`deliver()`, which only runs when `FARQ_AUTH_JWT_SECRET` is set. So these are
authorized, seat-checked invitation records and nothing more:
`has_live_credential=false` for both. Nobody can accept until the owner enables
native auth and sends.

The script replicates `prepareInvitation`'s SQL — the same active-subscription
check, the same seat check, the same upsert on
`(organization_id, email, sector_code)`. Because it is the same upsert, sending
later **reuses these rows** rather than colliding with them. Seats:
`5 total, 1 occupied`; memberships are only created on acceptance, so the two
become 3 of 5 once they accept.

## "They cannot change anything" — literally true, with one class of exception

A static scan of every mutating method in the Supabase repository, cross-checked
against the routes that reach them, leaves **three** methods a `MANAGEMENT`
actor is not blocked from by role:

| method | why it is not an exception |
| --- | --- |
| `getPublicSupplierInvite` | Supplier portal. `router.get('/supplier/portal/:token', …)` carries no buyer or supplier middleware — it needs a valid 43-char supplier token and ignores buyer roles entirely. Not reachable from a buyer session. |
| `submitPublicSupplierQuote` | Same token-only portal route. |
| `appendSupplierQuoteVersion` | Behind the `supplier` middleware, which requires a supplier principal (`role: SUPPLIER`). Not reachable from a buyer session. |

So: **yes, literally true for every buyer-side path.** The only writes those two
accounts could perform are ones they could already perform as an anonymous
holder of a supplier token — which is a property of the supplier portal, not of
their grant, and it is the same for the owner.

Two things they *can* still do that are worth naming plainly, because neither is
blocked by a role gate:

- **Read everything the company has.** All 8 RFQs, all 465 invites, the full
  visible supplier directory, every quote and comparison, and the finance
  portfolio. This is what the owner accepted.
- **Occupy a seat.** Two of five, once they accept.

## Known future work: `project_ids` / `all_projects` is modelled and ignored

`business.member_sector_grants` carries per-project scoping columns, and nothing
in `construction/*` reads them. Every authorization decision in the construction
repository is role-only; every read is scoped to the company
(`buyer_user_id = actor.actorId`) and never to a project. That is why a granted
client sees all 8 RFQs rather than only the ones on their own project.

Closing the gap means teaching the construction read paths to intersect with the
grant's project list — `listBuyerRfqs`, `getRfq`, `getRfqComparison`,
`listProcurementFinance`, and the supplier-directory reads. It is the correct
answer to "a client should not see another client's pricing", and it is the only
answer, since role gates cannot express it.

## Rollback — still one command each

```
node --env-file=.env scripts/construction/aldafe-client-grant.js --rollback
node --env-file=.env scripts/construction/aldafe-invitation-revoke.js --rollback
node --env-file=.env scripts/construction/farq-org-bootstrap.js --rollback
```

The first removes the two new PENDING invitations; the second returns the Aldafe
invitations to `SENT`; the third removes the organization. The code gates revert
by reverting the commit. `construction.*` still needs no rollback — zero rows
were written to it in this phase, as in the last.

## Verified by execution vs reasoned from source

- **Executed:** the revocation and its proof (live-token count 2 → 0 using the
  server's own predicate); the two new invitation rows; the owner gate
  re-measured after every change (`rfqs=8 invites=465`, `GATE HOLDS=true`); the
  five gates and the recovery-worker path (6 tests); the supplier portal with no
  session (5 tests through the real router); the full
  `construction-*` + `business-*` suite diffed against a baseline taken by
  neutralising the gate at its chokepoint.
- **Reasoned only:** still no live sign-in and no live invitation acceptance,
  because `FARQ_AUTH_JWT_SECRET` and `BUSINESS_NATIVE_INVITES_ENABLED` remain
  unset by design (`/api/auth/login` → 503, accept → 503). That a granted
  `MANAGEMENT` member resolves to the same 8 RFQs / 465 invites is derived from
  `resolveBuyerActor` plus the verified link scope, not observed through a
  signed-in session.

## One warning for when the flags go on

`routes/business.js` only takes the native path when `localAuthConfigured()` is
true. With `FARQ_AUTH_JWT_SECRET` unset it falls through to `sendBusinessInvite`
— the legacy provider path, which is what produced the nine retired provider
IDs in the Aldafe org. **Set `FARQ_AUTH_JWT_SECRET` before sending any
invitation**, or the send will recreate the exact problem this work cleaned up.

Also keep `FARQ_OWNER_TENANT_OVERRIDE` unset (it currently is). The invite route
reads the target organization from the `x-farq-organization-id` header and
checks membership; with the override on, a platform owner is granted
`OWNER`/`ADMIN` on **any** organization id in that header, which is the one way
an invitation could still be aimed at the empty Aldafe scope by accident.

---

# Send readiness, measured 2026-09-16

The owner approved sending the two client invitations, ordered as "send the
moment the write gates are live in production". Both preconditions were
measured rather than assumed. **Neither is met, so nothing was sent.**

## 1. The gates are still not live

Measured against the running service, the same way their absence was measured
before:

| Probe | Result |
| --- | --- |
| `/live` `deployedSha` | `4e0b0763d` |
| `origin/main` HEAD | `4e0b0763d` (unchanged) |
| `roles.js` on that commit | absent |
| `canWriteProcurement|canWriteSuppliers` occurrences | 0 |
| `createProject` allow-list | `['ADMIN','PROCUREMENT','MANAGEMENT']` |

`MANAGEMENT` still creates projects in production. Sending before this ships
would deliver the opposite of «أدوار محدودة».

## 2. The gates *can* ship alone — verified, not assumed

The concern was that `supabase-repository.js` (46 uncommitted hunks) and
`memory-repository.js` (18) carry three lanes at once. The gates were tested in
isolation in a throwaway worktree at the deployed SHA, leaving the shared tree
untouched:

- All 15 gate edits applied to `main`'s text with **zero conflicts** — the gate
  lines are one-line insertions at method entry and do not share a hunk with
  the packaging scope guard or the null `farq_spec_id` work.
- `main` alone: 696 tests, 14 fail. `main` + gates only: 707 tests, 14 fail.
  **The set of failing test names is identical** — the gates add 11 passing
  tests and cause no new failure.
- The 19 packaging-guard failures and the five dispatch fixtures belong to a
  lane that is **not in `main`**, so they are *not* on the critical path.

A verified patch is saved at `.handoff/construction-write-gates.patch`
(7 files, +465/-9) and `git apply --check` passes against a pristine `main`.

**The fixture updates must ship with the gates.** Without the five
`construction-local-runtime` and two `construction-boq-rfq-readiness` actor
fixtures, the gates alone break six previously-passing tests.

**The dependency runs one way.** Another lane's uncommitted
`revertSupplierImportBatch` already calls `canWriteSuppliers` from `roles.js`,
and that method is absent from `main`. Their work cannot ship without the
gates; the gates ship fine without theirs. Gates first is the required order.

## 3. A second blocker: acceptance cannot currently succeed

Found while confirming what a recipient would see. The invitation link is
hardcoded to `https://www.farq.sa/business/invitation`, served by
`Frontend/src/pages/BusinessInvitationPage.tsx`. That page has **no native-auth
path**: it authenticates only through `supabase.auth.signUp` /
`signInWithPassword` and posts that Supabase token to
`/api/business/invitations/accept`.

The backend `accept()` requires the token's user id to exist in
`app_auth.users`. For these two accounts the ids do not match:

| Email | native `app_auth.users.id` | retired provider id in the old snapshot |
| --- | --- | --- |
| `bader@aldafe.com` | `8cbbfa06…` | `5de25099…` |
| `awais@aldafe.com` | `425b8425…` | `4ee5ec37…` |

Nothing mirrors a Supabase signup into `app_auth.users`, and no migration
backfilled ids. So a recipient who clicks the link reaches a Supabase-only
sign-in, and even on success the id would fail `accept()`'s `app_auth` lookup
(403 `BUSINESS_INVITATION_EMAIL_MISMATCH`). No lane is currently editing that
page. Sending today yields two clients who cannot get in.

## 4. `MANAGEMENT` is the limited role, despite the name

Worth stating plainly because the name misleads. With the gates applied,
`MANAGEMENT` appears in **no** write allow-list, while every other non-admin
role retains a write:

| Role | Retains |
| --- | --- |
| `ENGINEER` | the five procurement writes, `recordReceipt` |
| `APPROVER` | `createAward` — can award |
| `FINANCE` | `createInvoice`, `recordPayment` |
| `MANAGEMENT` | nothing; reads only (incl. `listProcurementFinance`) |

`MANAGEMENT` is the weakest of the six. The recorded invitations carry
`organizationRole: MEMBER` / `sectorRole: VIEWER`, which maps to it.

## 5. Token lifetime, when he does send

`issue()` sets the token's `expires_at` from the **invitation's** existing
expiry, not a fresh window. Both invitations expire **2026-09-23T09:42Z**, so a
token minted later inherits only the remaining time. Past that date the
invitation must be re-prepared (one command, resets to +7 days).

Tokens are 32 random bytes, stored only as a hash, single-use via
`consumed_at`. `aldafe-invitation-revoke.js` matches by email across orgs, so
it revokes these new invitations too — one command, still reversible.

Seats: limit 5, 1 occupied, 2 remaining after two acceptances. Unchanged.
