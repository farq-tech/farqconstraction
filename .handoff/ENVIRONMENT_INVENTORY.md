# Environment inventory — `farq-construction` (standalone Construction app)

Scope: the Vercel project `farq-construction` serving https://farq-construction.vercel.app
from `farq-tech/farqconstraction`, branch `release/standalone-construction`.

**The constraint that decides this whole list:** Vite **inlines** the environment object into
the client bundle. Every `VITE_`-prefixed value is served in plain text to every visitor and
is readable in DevTools or by fetching the published asset. So the question for each variable
is not only "does the app need it" but "may the whole internet read it". Nothing secret may
ever carry a `VITE_` prefix.

Verified against the deployed bundle: a scan for JWT-shaped and key-shaped strings returned
nothing, and the only inlined hostname is the public `https://api.farq.sa`.

## Required

| Variable | Read at | Absent → | Why required |
|---|---|---|---|
| `VITE_API_BASE_URL` | `src/api/apiBase.ts:14` | falls back to `/_api` | `vercel.json` has a single catch-all rewrite to `index.html` and **no `/_api` rewrite**, so the default would answer every API call with the SPA's own HTML and fail JSON parsing. Must be `https://api.farq.sa`. Public hostname, not a secret. Calling the API directly also avoids the Vercel proxy body limit that produced 413s on large booklets. |

Currently set on the project for Production and Preview.

## Optional

| Variable | Read at | Absent → | Notes |
|---|---|---|---|
| `VITE_READ_ONLY` | `src/api/readOnlyMode.ts` | **writes are ALLOWED** | Set to `1` on this project. Refuses every non-GET/HEAD call at the network choke point in `constructionClient`, with a three-path allowlist for the search-only POSTs. Optional in the sense that the app runs without it — but omitting it lets this host send real email to real suppliers, so for any testing deployment treat it as mandatory. Now declared in `src/vite-env.d.ts` and documented in `.env.example`. |

## Legacy

| Variable | Read at | Status |
|---|---|---|
| `VITE_FARQ_ACCESS_TOKEN` | `src/api/apiBase.ts` | **SECRET — must never be set here.** A build-time bearer JWT. `apiBase.ts` already returns `''` when `PROD === true`, so setting it changes nothing except publishing a token to every visitor. It is also the wrong model: one token baked into the bundle is a session shared by everyone, the opposite of an account per person. Real sign-in needs nothing here — the app posts to `/api/auth/login` and holds a per-account session in `localStorage`. |

## Unused

| Variable | Read at | Why it does nothing here |
|---|---|---|
| `VITE_API_PROXY_TARGET` | `vite.config.ts` | Configures the `vite dev` / `vite preview` proxy only. `vite build` never reads it, so it has no effect on a static Vercel build. Its dev-only advice used to leak into three production error strings; those now switch on `isProductionBuild()`. |
| `VITE_PROCUREMENT_INTENT_AI` | `src/lib/procurementIntentEngine.ts` | Gates a Phase-2 AI stub the code itself describes as a no-op. |
| `FIGMA_PUBLIC_URL` | `vite.config.ts` | **Actively harmful if set** — it rewrites `base`, pointing every asset URL at a Figma host, and the app would not boot. |
| `FIGMA_DEV_SERVER_HOST`, `PORT` | `vite.config.ts` | Dev/preview server binding only. |
| `UPDATE_CONFORMANCE` | `src/lib/attributeRuleConformance.test.ts` | Regenerates a test fixture. |

## Belongs to the API, never to this project

`CONSTRUCTION_DB_URL`, `CONSTRUCTION_GMAIL_CLIENT_ID`, `CONSTRUCTION_GMAIL_CLIENT_SECRET`,
`CONSTRUCTION_GMAIL_TOKEN_KEY`, `RESEND_API_KEY`, `WHATSAPP_ACCESS_TOKEN`,
`FARQ_AUTH_JWT_SECRET`. None is read by this repo. None may ever be added with a `VITE_`
prefix. No values were read or recorded.

`CONSTRUCTION_INTENT_SUPPLIER_MAP_ENABLED` is API-side and **off** (its default). No API
environment was changed by this deployment.

## Origins — no allowlist edit was needed

`api/lib/corsOrigins.js` matches any `*.vercel.app` host that `startsWith('farq-')`, and
`api/server.js:171` consults it **before** any env-driven branch, so neither `CORS_ORIGINS`
nor `CORS_ALLOW_VERCEL` can switch it off. Confirmed live: preflights from
`https://farq-construction.vercel.app` return 204 with the origin echoed back, while
`https://evil.example.com` is refused. This is why the `farq-` prefix in the project name is
load-bearing rather than cosmetic — it is the guarantee that survives someone later turning
the preview flag off.

Hashed preview hosts (`farq-construction-<hash>-farq.vercel.app`) are covered by the same rule.

## Left pinned to `www.farq.sa`, deliberately

Supplier portal links, business invitation URLs, and the Gmail OAuth `return_to` are all
hardcoded API-side. A new frontend origin cannot disturb them, and 188 delivered messages
depend on them. Consequence for this host: a supplier clicking an existing portal link lands
on production and quotes exactly as today, and the Gmail post-consent bounce returns to
production rather than here. Both are intended at this stage.
