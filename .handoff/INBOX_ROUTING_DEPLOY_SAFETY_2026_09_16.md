# Deploy safety: `inbox-routing.js` is untracked and required at boot

**For:** الإيداع والنشر — read this before the Dockerfile/migration rework lands.
**Patch:** `.handoff/inbox-routing-untracked-module.patch`
**Date:** 2026-09-16

## The one sentence that matters

`api/lib/construction/gmail-sync.js` does `require('./inbox-routing')`, and
`api/lib/construction/inbox-routing.js` **is not in git**. Any deploy that builds
from a clean tree crashes at boot with `MODULE_NOT_FOUND`, taking the whole
construction inbox down.

This is dormant today only because deploys are *not* currently running from a
clean git tree. Fixing that — which is exactly the work in flight — converts
this from harmless to fatal. The inbox would fail as a side effect of a change
aimed at something else entirely, which is the worst shape a failure can take.

**The require line is not mine.** It arrived with the Gmail routing work; I only
added one symbol to it. The module is shared infrastructure that the Resend
webhook path and the Gmail path both read. Adding it to git fixes the hazard for
every lane, not just this one.

## Verifying the patch carries the file

`git diff` alone silently omits untracked files, so a patch made that way would
reproduce the crash rather than prevent it. This one was produced with
`git add --intent-to-add`, the index restored immediately afterwards, and then
checked both ways:

```
git apply --check --reverse   # matches the working tree it came from
git apply --cached --check    # applies cleanly to a pristine HEAD
```

Both pass. The patch contains two `new file mode 100644` entries, so the module
and its tests travel with it.

## What is in the patch, and who owns each part

| File | Status | Ownership |
|---|---|---|
| `api/lib/construction/inbox-routing.js` | **new, untracked** | shared module; **this is the boot-critical one** |
| `api/tests/construction-inbox-routing-domain.test.js` | new, untracked | mine (9 tests) |
| `api/lib/construction/gmail-sync.js` | modified | **shared — see below** |
| `api/lib/construction/inbox-unresolved.js` | modified | **shared — see below** |

### `gmail-sync.js` — do not treat this as "two lines"

I described this as a two-line change; that was accurate about my edits and
misleading about the file. The uncommitted diff is 68 insertions, and nearly all
of it is another lane's in-flight rewrite (`excludeReason`, strict mode,
token extraction from the message body, the `eligible`/`byEmail` split).

My three edits are not separable hunks — each is a token inside a line that lane
wrote:

1. `exclusionReason` appended to the existing `require('./inbox-routing')` destructure
2. `narrowRfqCandidates(byRfq, byEmail, display, sender)` — I added `sender`
3. `evidence:{reason: exclusionReason(m.match.reason, {...})}` in the `saveArrival` call

**So my changes cannot be cherry-picked out of this file.** It lands whole or it
waits for that lane. Confirm with مزامنة Gmail before shipping it.

### `inbox-unresolved.js` — mine is two pieces, the rest is not

Another lane is adding MANAGEMENT read access here. Hunk 1 is **mixed**. Mine:

- Hunk `@@ -2,9 +2,15 @@` — **only** the line
  `const { NON_ACTIONABLE_REASONS } = require("./inbox-routing");`
  The `LIST_ROLES` / `ROUTE_ROLES` constants and their comment are the other lane's.
- The `unresolved()` query hunk — **entirely mine** (the queue filter and its
  fourth and fifth query parameters).

Not mine, do not attribute to me: the `LIST_ROLES` guard in `unresolved()`, the
`visible` / `candidate_invites.length === 0` change, and the `ROUTE_ROLES` guard
in `resolve()`.

## Is the inbox broken without the domain rule deployed?

Three separate things ride in this patch, and they have different urgencies.

**Boot (`inbox-routing.js` present): fatal.** Not deploying it once deploys run
clean means no inbox at all.

**The domain rule: urgent for correctness, with a manual workaround.** Without
it, a supplier replying from a different mailbox on a known domain
(`estimation@` when contacts hold `info@`) stays ambiguous and never reaches the
thread. Today's Glassline quote landed **without** this deployed, because adding
the address to that supplier's contacts made exact-address matching sufficient.
That workaround is per-supplier and manual; the owner invites 115 suppliers at a
time, so it does not scale. Correctness, not availability.

**The queue split: display only.** Nothing breaks without it; a full rescan would
simply bury real replies under ~124 automated messages.

## Migration note

Nothing here needs a migration. The queue filter re-reads the RFQ token from the
stored subject rather than trusting the stored reason, specifically so that rows
written before the distinction existed are not hidden retroactively. No backfill,
no schema change.

The filter has a second guard worth knowing about when reviewing it: an arrival
whose sender is on a known supplier's domain is never hidden, even with no RFQ
token. That was added after measuring the live 30-day window — 150 messages, 11
naming a request, 139 not, and of those 139 exactly 2 from a supplier domain.
One of them is a real purchasing officer asking for a WhatsApp number, which the
token rule alone would have buried. Shared free-mail domains are excluded from
that guard, so it cannot be widened by one supplier happening to use Gmail.

Separately, and relevant to your lane: several DB-backed tests fail locally with
`relation "construction.inbox_dispatch_snapshots" does not exist`. Those run on
in-memory PGlite built from `supabase/migrations/`, so it is the same
migrations-never-ran gap you found, visible from a second direction.
