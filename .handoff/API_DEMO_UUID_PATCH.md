# Farq API patch required for no-login + Postgres RFQs

## File
`api/lib/construction/runtime.js`

## Why
`construction.rfqs.buyer_user_id` is UUID. Historical demo actor `demo:local-buyer` breaks every RFQ/list/write query against `CONSTRUCTION_DB_URL`.

## Change
1. Add `resolveDemoBuyerActorId(demoActor, env)`:
   - Prefer `CONSTRUCTION_DEMO_BUYER_USER_ID` if set to a UUID
   - Else mint a stable UUIDv4-shaped hash from the demo label
2. Demo buyer returns `role: 'ADMIN'` (award / open envelopes need ADMIN|APPROVER)
3. Export `resolveDemoBuyerActorId`

## Env (api/.env)
```
CONSTRUCTION_DEMO_MODE=1
CONSTRUCTION_READ_ENABLED=1
CONSTRUCTION_WRITE_ENABLED=1
CONSTRUCTION_RFQ_ENABLED=1
CONSTRUCTION_DEMO_BUYER_USER_ID=44cdaadd-e084-4654-a84b-a95e6c920580
```
(Use the buyer UUID that owns production RFQs you want the client to see.)

## Reference copy
`runtime.demo-uuid.js` in this folder is a known-good snapshot of the patched runtime from `/Users/m4pro/farq/api`.

## Note
`CONSTRUCTION_DEMO_MODE` is ignored when `NODE_ENV=production`. Production no-login needs JWT (`VITE_FARQ_ACCESS_TOKEN`) or a public Farq route.
