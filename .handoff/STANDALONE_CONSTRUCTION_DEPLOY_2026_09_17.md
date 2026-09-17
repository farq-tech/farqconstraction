# Farq Construction — standalone deployment

**Link** https://farq-construction.vercel.app
**Repo / branch / commit** `farq-tech/farqconstraction` · `release/standalone-construction` · `515b813`
**Vercel project** `farq-construction` (`prj_vM06VOKlauVUsvy2QWKepnZH7VBP`), team `farq`. New project. The
existing `farq` project that serves `www.farq.sa` was not opened.

## Which tree was released, and why

`release/standalone-construction` branches from `wip/full-tree-snapshot-2026-09-16`, not from `main`.
`main` is an ancestor of the snapshot, so nothing on `main` was lost, and the snapshot was not merged
back into `main`. The snapshot is the only tree holding the reader that reaches 68/68, the upload
countdown and BOQ ETA, the supplier imports, and the cpo-v9 ontology work.

`cursor/construction-production-foundation-18a1` was inspected and not used: it forks from
`924930d` (the original Figma Make import) and carries one Phase-0 inventory commit, so it predates
all of the above.

Four changes were made on top of the snapshot. Each is here only because the app cannot deploy
independently without it; nothing else in the product was touched.

1. `vercel.json` was untracked, so a fresh clone had no build config. It forces `npm install`
   because the committed `pnpm-lock.yaml` predates the PDF and Excel readers.
2. `.vercelignore` keeps ~200 MB of held-out evaluation corpora out of the build upload. They
   remain in the repo as evidence; the build never reads them.
3. `.gitignore` ignores `.vercel/`, which holds link state and a short-lived OIDC token.
4. `initialViewFromUrl` honoured only `view=inbox`. On a real domain that left the sign-in screen
   with no door: every read 401s without a session, and the one `navigate('login')` runs after
   `signOut`, which needs a session first.

## What stops a real dispatch

Nothing did. The invite `send` route hands the message straight to Resend; inbox `reply` and outbox
`retry` do the same, against real supplier rows that have already received 188 real messages. There
was no confirmation step anywhere in the UI.

`src/api/readOnlyMode.ts` now refuses writes at the single network choke point — `send()` in
`constructionClient.ts`, which all 21 write call sites funnel through — rather than on the buttons,
so no stale component, keyboard path or console call can reach the network either. It denies by
default: a route added later is blocked until someone reviews it. Enabled by `VITE_READ_ONLY=1`,
which is set on this project only.

Three POSTs stay open because they only search and write nothing, and the journey needs them:
`/api/construction/suppliers/match`, `/api/construction/boq/match`, `/api/construction/boq/parse-pdf`.

Covered by 8 tests in `src/api/readOnlyMode.test.ts`, and the banner plus the guard were confirmed
present in the deployed bundle.

## Intent map

Shipped with `CONSTRUCTION_INTENT_SUPPLIER_MAP_ENABLED` off — its default, and `.env.example:762`.
No API environment was changed. With the flag off no map path executes at all, so the state where an
intent resolves to zero suppliers because two versions disagree is structurally unreachable here
rather than merely avoided. The ontology on this branch is cpo-v9.

## CORS — the new origin is already allowed; a different header is not

Measured preflight against `https://api.farq.sa/api/construction/rfqs`:

- From `https://farq-construction.vercel.app` → `204`, and `access-control-allow-origin` echoes the
  new origin back. The `farq-*` prefix claim is confirmed: no environment variable was needed and
  none was changed. **No allowlist edit was required.**
- `access-control-allow-headers` is
  `Content-Type,Authorization,Accept,X-Admin-Key,X-Admin-Token,X-Request-Id,x-farq-ai-canary-token,x-farq-intent-internal,apikey,x-client-info,x-supabase-api-version`.
  `x-construction-demo-user` is absent — **and equally absent for the `https://www.farq.sa` control**.
  This is a pre-existing, API-wide condition, not something this deployment introduced.

`constructionAuth.constructionHeaders` sends `x-construction-demo-user` only when there is no
session; with a session it sends `Authorization`, which the preflight already allows. So every
unauthenticated API read fails at the CORS preflight, and the signed-in path is expected to work.
That was not executed here — no credentials.

Adding `x-construction-demo-user` to the API's allowed headers was deliberately not done: it would
change production behaviour, and the API refuses demo mode in production regardless
(`NODE_ENV !== 'production'` and `CONSTRUCTION_DEMO_MODE=1`), so it would buy nothing.

## Real browser smoke test

Real Google Chrome via `playwright-core`, against the deployed URL. Reproducible:
`node smoke.mjs https://farq-construction.vercel.app <path to reference-etimad-2020-48.pdf>`.
Maestro's Chromium driver was listed as available but was not used; the Chrome path was taken
because the driver had already failed twice in earlier lanes.

Result, uploading `fixtures/boq/reference-etimad-2020-48.pdf`:

- Read-only banner renders.
- Upload screen reached by clicking through from home, as a user would.
- Read settled in under a second, reporting **complete, not partial** — `اكتملت القراءة`.
- **68 item rows rendered, numbered 1 to 68**, each with its own quantity and unit:
  `درابزين حديدي 385 م ط`, `بوابة المدخل الرئيسي 3 عدد`, `عزل حرارى لمجاري التكييف 3,500 م²`,
  `مخارجالتهوية 855 عدد`.
- Source reported as `قراءة أعمدة الجدول بالإحداثيات` — the coordinate column reader.
- Supplier screen reached; header reads `قرأ فرق 68 بندًا`.

Unreached, named rather than glossed:

- **Supplier matching.** `POST /api/construction/boq/match` and `/suppliers/match` and
  `GET /catalog` all failed the CORS preflight described above. The UI degraded honestly rather than
  inventing results: `مطابقة الموردين لم تعمل على الخادم`, and the counters read 0 matched, 68
  needing suppliers. **This is the exact step that needs his login.**
- **Specifications: 0 of 68.** The specification join is an API call, so it fails for the same
  reason. Item names, quantities and units are all client-side and all present.
- The signed-in path, and therefore a signed-in send being refused by the guard in a live browser.

## Isolation

Verified by a genuine `git clone` of the branch into a fresh directory, then `npm install`
(96 packages) and `npm run build` — both succeeded with no reference to the main Farq app. The new
Vercel project is separate, has no custom domain and no DNS record. `www.farq.sa` and
`www.farq.sa/construction` both returned 200 after the deploy; `origin/main` of both repos is
unmoved.

## Runtime completeness — the feared crash is not there

Audited with `/tmp/require-audit.mjs` against the API repo. The correction matters: **a deploy from
`origin/main` would boot and serve normally.** `origin/main`'s copies of all eleven requirer files
are older revisions containing zero references to the missing modules, proven by checking
`origin/main` into a throwaway worktree and successfully requiring all nine load-time entry modules.
The live API agrees — it runs `3d4ceab3`, which contains none of the files, and both journey
endpoints answer `401` in under 350 ms rather than `500`.

So the twelve findings describe the *working tree's* needs, not a broken `origin/main`. The honest
total is 12 JS modules plus one runtime-read ontology JSON the checker structurally cannot see;
`procurement-intent-pool-cache.js` was missing from the original list. Real requirer edges are 92,
not 12 — the checker de-dups by roughly 7.7×. `boq-directory-matching.js` does lazily require the
intent engine at lines 48, 108, 154 and 241, as described.

**The actual risk is the next API push**: committing the 11 modified requirer files without the 12
new modules crashes before `listen()` (`server.js:105`, `:303`, `:550`) and even earlier at the
`prestart` migration. All 13 files are already committed on `wip/full-tree-snapshot-2026-09-16`, so
nothing is at risk of being lost. None of this affects the frontend deployed here.

Two silent degradations worth knowing: a missing ontology JSON makes the port fall back to the flat
dictionary with `degraded: true`, and a missing `private/electrical-suppliers.json` quietly swaps the
supplier directory for `BUILTIN_SUPPLIERS` rather than failing loudly.

**Case sensitivity: clean.** Zero mismatches across 5,240 API specifiers and 181 frontend ones.
**Node:** both packages declare `>=20 <25`; the API image is `node:20-bookworm-slim`. The only
Node-22+ API in the tree (`node:sqlite`) sits in two offline scripts the server never loads.

## Known, not fixed

- On a deployed build the API-unreachable message still names `VITE_API_PROXY_TARGET` and port 3000,
  which is dev-only advice and reads as if something local is broken. Left alone deliberately: it is
  product copy, not a deployment blocker.
- `index.html` still carries the scaffold title `Figma Make App`. Cosmetic, but it is what caused an
  earlier lane to misdiagnose a construction deployment as the wrong app.
- Supplier portal links, business invitations and the Gmail `return_to` remain pinned to
  `www.farq.sa`, untouched, as instructed.
