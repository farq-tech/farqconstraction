# Phase 0 — Foundation report

## Done
- Architecture inventory A–J documented in `docs/architecture/ARCHITECTURE_INVENTORY.md`
- Real React Router deep links for projects / BOQ / RFQ / offers / comparison / award / suppliers
- Route-level lazy loading (production build emits per-view chunks)
- TanStack Query client with retry policy + versioned query keys
- Construction API client with `X-Request-Id` correlation
- Route error boundary + loading / empty / retry primitives
- Login no longer silently succeeds on production path
- Prototype chrome explicitly gated by `VITE_ALLOW_PROTOTYPE_CHROME`
- Live `/api/construction/status` chip on home (failure does not blank the page)

## Measure
- `pnpm exec tsc --noEmit` — pass
- `pnpm run build` — pass; initial route chunks split (views ~2–19KB gzip each; main ~104KB gzip)

## Next (Phase A)
- Wire Supabase Auth (no demo users)
- Replace prototype RFQ list with `GET /api/construction/projects` + `rfqs`
- Project procurement snapshot read model
- Keep old `/Construction` running

## Blocker
- Read access to `farq-tech/farq` still required before extracting BOQ worker engines (requested).
