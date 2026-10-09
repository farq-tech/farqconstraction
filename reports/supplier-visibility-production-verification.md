# Production verification — 2026-10-08

Frontend PR: https://github.com/farq-tech/farqconstraction/pull/61
Production commit: 871fadb158d20d8ca16e61e5c629345f09f94558
Vercel production deployment: https://farq-construction-p9a3ja8ld-farq.vercel.app
Production domain: https://construction.farq.sa

Native Chrome verification, signed in as admin@aldafe.com:
- PR H301 shows 200 recipients.
- Supplier tab shows 200.
- Procurement contacted and no-response counts show 200.
- No display-limit explanation was added.

Backend PR: https://github.com/farq-tech/farq/pull/1527
Production commit: 2a694a1ed2a529c96714d135b434806fdf730aef
Railway deployment: a557b468-6922-49ca-85ea-45fdb127bdfe

Production configuration explicitly allows abdulrhman@farq.sa for actual-count and cross-company booklet reads. A read-only database check confirmed that this account exists and has verified email. Its authenticated production browser journey has not been verified; current browser is the company account.

Validation: construction frontend 33 tests, TypeScript, and Vite build passed. API focused 41 tests passed; correspondence backend 132 tests passed. The API monorepo runner's frontend/type phases lacked dependencies in its isolated checkout; the separately deployed construction frontend passed its own checks.

No supplier messages were sent and no dispatch records were modified.

Railway deployment completed SUCCESS. Production /live returned deployedSha 2a694a1ed2a529c96714d135b434806fdf730aef and buildId a557b468-6922-49ca-85ea-45fdb127bdfe.
