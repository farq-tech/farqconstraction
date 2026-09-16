# Invitations, seats, and which database you are actually talking to

2026-09-16. Covers the شركة الدفع invitation work and a database-targeting trap
that has already cost this project real data.

---

## 1. Read this before you run any script against "the database"

`api/.env` defines several connection strings that point at **different
databases with overlapping schemas**. This is the mechanism behind the six RFQs
that appeared to vanish (see `RFQ_LOSS_RECORD_2026_09_16.md`).

Measured on 2026-09-16:

| variable | host | has `construction` | has `business` / `app_auth` |
|---|---|---|---|
| `CONSTRUCTION_DB_URL` | `hayabusa.proxy.rlwy.net:27699` (Railway, db `railway`) | yes | **yes** |
| `COMPARISONS_DB_URL` | `aws-0-ap-southeast-2.pooler.supabase.com` | yes | **no** |
| `DATABASE_URL` | same Supabase pooler | yes | **no** |

`api/lib/db.js` resolves `COMPARISONS_DB_URL || DATABASE_URL`. So **every module
that goes through `lib/db` — including `lib/business/repository.js`,
`lib/auth/localAuthStore.js` and the migration pool — points at the Supabase
copy when run locally**, where `business` and `app_auth` do not exist at all,
and where `construction` exists but is not the one production serves.

Consequences seen first-hand:

- `business.memberships does not exist` from a script that works fine in
  production. Nothing is wrong with the script; it is talking to the wrong host.
- A `construction.*` write run locally lands in the Supabase copy and silently
  does nothing visible in the product. This is the RFQ-loss mechanism.

**What to do:** when running anything locally that touches identity, business or
production construction data, override the variable `lib/db` actually reads:

```sh
URL=$(rg -N "^CONSTRUCTION_DB_URL=" .env | sed 's/^CONSTRUCTION_DB_URL=//; s/[?&]sslmode=[^&]*//g; s/[?&]sslrootcert=[^&]*//g')
COMPARISONS_DB_URL="$URL" DB_SSL_REJECT_UNAUTHORIZED=false node your-script.js
```

Two traps inside that one line, both of which cost time today:

- `sslmode=require` in the URL is treated as `verify-full` by current `pg`, and
  it **overrides** a `ssl: { rejectUnauthorized: false }` option object. Strip
  the parameter; setting the option alone is not enough.
- The Supabase pooler is capped at 20 session-mode clients and is frequently
  saturated by deploys. `EMAXCONNSESSION` is contention, not misconfiguration.

Worth fixing properly: `lib/db` should not silently fall back to a database that
lacks half the schemas. Failing loudly when `business`/`app_auth` are absent
would have turned a day of confusion into one error message.

---

## 2. Seats: what occupies one, and whether the owner is inside the count

The plan is `standard`, `limits.users = 5`, and **the 5 includes the owner's own
account**. It is one budget, not "5 plus the owner". `abdulrhman@farq.sa` holds
an `ACTIVE` membership with a construction grant and is counted like anyone
else, leaving four seats for colleagues.

A seat is occupied by **memberships ∪ outstanding invitations**. Memberships are
only created on acceptance, so counting memberships alone let the cap be walked
past: several administrators could each issue an invitation against the same
free seat, every recipient would set a password, and all but one would be
refused at `accept()` — after the email, after the password, and to the only
person who cannot do anything about it.

`prepareInvitation` in `api/lib/business/repository.js` now counts both, keyed on
email (falling back to user id) so one person never counts twice and a resend is
free. Expired invitations release their seat. `accept()` keeps its own check as
the backstop; that one is serialized by the `for update of s` lock `permitted()`
takes on the subscription row, so two concurrent acceptances cannot both pass.

Refusal is `409 MEMBER_LIMIT_REACHED` and now names the numbers. Note that
`prepareInvitation` also refuses for `SUBSCRIPTION_INACTIVE`, which used to be
reported with the same "Invitation limit reached" wording — a lapsed
subscription sent the reader hunting for a seat to free.

---

## 3. Who may invite, and what they may grant

The invite gate is `organizationRole ∈ {OWNER, ADMIN}` **or**
`sectorRole === 'ADMIN'` (`api/routes/business.js`). Note what that means:

- `organizationRole: MEMBER` + `sectorRole: VIEWER` → **cannot invite**
  (`403 BUSINESS_PERMISSION_REQUIRED`, refused at the `invite_members`
  permission before the admin test runs).
- `organizationRole: ADMIN` + `sectorRole: VIEWER` → **can invite**, and
  construction stays `MANAGEMENT`: company-wide read, no writes. This is the
  combination provisioned for شركة الدفع.

`organizationRole: ADMIN` is **not** platform admin. Everything under
`/api/business/admin/*` — creating organizations, changing subscriptions and
seat limits, editing memberships, construction links — requires AAL2 **and**
either platform ownership or a `business.platform_admins` row
(`middleware/requireBusinessAdmin.js`). Measured: all six of those endpoints
return `403 BUSINESS_ADMIN_MFA_REQUIRED` for an organization admin.

### The escalation that was open

The route validated the invitee's `sectorRole` against the vocabulary and
**never against the inviter's own**. An organization ADMIN holding only sector
`VIEWER` — a role with no write anywhere — could therefore issue an invitation
for sector `ADMIN`, i.e. construction `ADMIN` with every write. A read-only
account able to mint a full-write one makes every other boundary decorative.

Fixed with a rank ceiling in `permitted()` in
`api/lib/business/native-invitations.js`, **not** in the route, because
`permitted()` runs again inside `accept()` — so an invitation issued before the
check cannot be redeemed either, and no later call site can route around it.
Ranks: `VIEWER`/`ANALYST` = 1, `EDITOR` = 2, `ADMIN` = 3. Refusal is
`403 BUSINESS_INVITATION_ROLE_ABOVE_INVITER`. The organization OWNER is exempt,
because somebody has to be able to appoint the first administrator.

---

## 4. The invitation page

`api/lib/business/native-invitations.js` gained `claim(token, password)`, exposed
at `POST /api/business/invitations/claim`. It exists because an address whose
account was created by a script has a password the recipient never chose:
registration fails because the account exists, sign-in fails because the
password is unknown, and the recipient is stuck. `claim` treats the invitation
itself as proof of address, sets the password, and revokes older sessions.

`Frontend/src/pages/BusinessInvitationPage.tsx` has three modes — `claim`,
`signin`, `signup` — defaulting to `claim` when `preview` reports
`has_account: true`, and to `signup` when it does not. Server error **codes** are
mapped to Arabic on the page, falling back to the server's own sentence rather
than to a generic apology, so a recipient from another company is told what
happened instead of concluding the platform is broken.

In local auth mode `lib/supabase.ts` returns `createLocalAuthClient()`, so
`supabase.auth.signUp` / `signInWithPassword` already hit `/api/auth/*` and yield
native tokens whose identity is `app_auth.users` — the same identity the write
gates read. Do not "fix" this page by reaching for Supabase directly.

Session issuance now lives in one place, `api/lib/auth/session.js`, used by
`routes/auth.js` and by the claim route, so the envelope cannot drift between
the two ways of obtaining a session.

---

## 5. Inbox: listing widened, routing not

`api/lib/construction/inbox-unresolved.js` gated **even listing** on
`['ADMIN','PROCUREMENT']`, so `MANAGEMENT` could open any supplier thread but
got `403` on the unresolved list. Listing now allows `MANAGEMENT`
(`LIST_ROLES`); routing an arrival stays on `ROUTE_ROLES =
['ADMIN','PROCUREMENT']`. Keep those two lists separate — seeing what arrived
and deciding where it goes are different acts, and a Gmail rescan is expected to
take this list from about 13 items to about 149.

Still inconsistent, reported rather than changed: `APPROVER` is inside the
correspondence `READ_ROLES` and can read any thread, but is not in `LIST_ROLES`
and so cannot see the unresolved list.

---

## 6. Testing against production without leaving anything behind

Patterns that worked and are worth reusing:

- **Prove authorization without side effects.** `POST /api/business/invitations`
  validates the address *after* the two authorization gates, so a deliberately
  malformed address returns `400` when the caller may invite and `403` when it
  may not — no row created, and nothing sent. This matters because `deliver()`
  posts to Resend for real, and `RESEND_API_KEY` is set.
- **Exercise real code against real data without persisting.** Build the service
  with a pool whose `connect()` hands back one client bound to an open
  transaction, then always roll back. This ran the shipped `issue()` — ceiling
  included — against production rows with no surviving trace.
- **Assert the survivors inside the transaction.** The probe cleanup checked that
  the owner's account and both real pending invitations were still present before
  committing, and would have rolled back otherwise. The same tables hold the
  rows you must not touch.
- Local Postgres was unavailable and Docker was not running;
  `@electric-sql/pglite` is already in `api/node_modules` and runs real Postgres
  in-process, which is enough to prove SQL semantics.
- Give scrypt room in browser tests. `claim` then `login` runs the KDF twice;
  a 3.5s wait caught the page mid-flight and looked like a failed acceptance.
