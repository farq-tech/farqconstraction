# طلب تخفيض عرض المورد

Implemented locally. Not merged, pushed, or deployed. No real supplier messages were sent.

## UI

Each received quote with inviteId and quoteVersionId has «اطلب تخفيض العرض». The dialog requests a discount on that supplier's entire quote, with an optional target/reason and editable message preview. Timing options: «إرسال الآن» and «يرسله أحمد بعد ساعة». Scheduled requests can be cancelled before the worker claims them. The schedule is one hour after explicit confirmation, not an automatic rule for all future quotes.

Read-only builds block creation, scheduling, and cancellation at the API-client choke point. An API without the new routes displays service unavailable and cannot claim a successful send. Existing quote prices remain unchanged.

Dev-only visual harness: /.figma/quote-discount-check.html on this worktree's local Vite server (http://127.0.0.1:8444). It stubs all discount API responses and never sends to real suppliers. It is not in the production build.

## API and worker

Repo: /Users/m4pro/.codex/worktrees/quote-discount-api
Branch: codex/quote-discount
Commit: d9e6cb267
Companion patch: .handoff/quote-discount-api.patch

New quote_discount_requests migration in api/db/migrations/construction and its identical supabase/migrations mirror. Runtime grants/RLS follow construction_owner and farq_construction_app conventions. New inbox endpoints list, create, and cancel quote-specific requests. Existing inbox worker handles due requests for already allowlisted owners with write/worker/routing flags on. Existing correspondence dispatcher supplies ownership, channel guards, outbox idempotency, threading, audit, portal visibility, and provider outcome tracking. It rechecks active membership, role, scope, entitlement, current quote/RFQ version, and award/cancellation state before dispatch. Ambiguous outcomes remain UNKNOWN without automatic retry.

To make the feature live: merge/deploy API and worker with the migration, then deploy this UI. No production variables, credentials, subscription, or sender settings were changed. No live journey verification has been performed.

## Validation

- UI full suite: 57 files, 1813 tests passed; new discount client tests: 3 passed.
- UI TypeScript check and production build passed.
- API discount integration tests against PGlite: 10 passed (scheduling, immediate send, replay/duplicate protection, cancellation, stale quote, award, cancellation of RFQ, reassigned request, revoked member, uncertain provider outcome, runtime table grants).
- Required provider-mocked verify-correspondence runner: backend, frontend, and TypeScript phases passed.
- Canonical Farq Frontend production build passed; agent parity check passed.
- Full API suite: 7622 tests; 7526 passed, 34 failed, 62 skipped. All 34 failures reproduced with identical test names on untouched origin/main (82e7a8d8f); no failures unique to this change.
- Browser: real dialog component tested with mocked API on mobile; timing selection, message preview, scheduled status and cancellation verified. This proves local UI behavior, not delivery to a supplier.
