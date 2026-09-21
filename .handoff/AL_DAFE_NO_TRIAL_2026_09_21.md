# شركة الدفع — بلا فترة تجربة

2026-09-21. Owner directive: «فرق بناء لا يوجد فترة تجربة مفتوح لكل حسابات شركة الدفع».

## Symptom (production)

`construction.farq.sa` Send Modal → «نتيجة الإرسال»:

> انتهت فترة تجربتك. أضف باقة لمتابعة الرسائل وإرسال طلبات التسعير.

The Arabic string is **not** in this frontend bundle. It is returned as
`errors[0].message` from Farq API (`api.farq.sa` on Railway). Live
`whatsapp_send_budget.scope` is still `"trial"` on `/api/construction/status`,
but the copy covers both inbox follow-up **and** RFQ send — a product/trial
gate, not only the WhatsApp Redis counter.

## Commercial alignment (this repo)

Licence `docs/legal/عقد-ترخيص-نظام-فرق-للبناء-الدفع.md` updated:

- No 7-day trial.
- Access open from activation for all authorised users of شركة الدفع.
- Plan selection + 15-day payment grace remain; they are not a trial.

## Runtime unlock (Farq API / Railway — required)

This frontend cannot lift the gate. Do the following on production Postgres
(`CONSTRUCTION_DB_URL` on `farq-api-test-oregon`), **not** Supabase:

1. Locate the emitting code in `farq-tech/farq` (search the exact Arabic
   string). Expected families: `business.subscriptions` trial columns, a
   construction entitlement helper, or WhatsApp/product package checks.
2. Inspect:

```sql
SELECT o.id, o.name, o.slug,
       s.id AS subscription_id, s.status, s.plan_id,
       s.trial_ends_at, s.starts_at, s.ends_at, s.limit_overrides
FROM business.organizations o
LEFT JOIN business.subscriptions s ON s.organization_id = o.id
WHERE o.name ILIKE '%دفع%' OR o.slug ILIKE '%dafe%' OR o.name ILIKE '%فرق%';

SELECT m.user_id, u.email, m.organization_role, m.status
FROM business.memberships m
JOIN app_auth.users u ON u.id = m.user_id
JOIN business.organizations o ON o.id = m.organization_id
WHERE o.name ILIKE '%دفع%' OR o.slug ILIKE '%dafe%';
```

3. Desired end state for شركة الدفع (and any Farq-owned seats used by that
   company): `subscriptions.status = 'ACTIVE'`, no expired `trial_ends_at`,
   and every authorised account able to create RFQs / send / follow messages
   without the trial copy. Prefer `limit_overrides` on the subscription over
   mutating the shared plan row.
4. If the gate is hard-coded to `whatsapp_send_budget.scope=trial`, move that
   org (or construction globally for Al-Dafe) off trial scope in the Farq API
   env/code — names only: `WHATSAPP_SEND_BUDGET*`, `WHATSAPP_SEND_BUDGET_SCOPE`.

## Blocked in this agent run

- `farq-tech/farq` is not reachable with this token.
- Railway MCP / CLI login was waiting on owner OAuth (device code).
- Without that, production `business.*` cannot be read or updated from here.
