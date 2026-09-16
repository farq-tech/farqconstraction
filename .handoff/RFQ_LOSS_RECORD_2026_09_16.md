# سجل دائم — طلبات عرض السعر المفقودة من قاعدة الإنتاج (16 سبتمبر 2026)

Durable record of the RFQs that exist in correspondence but not in the production
database, written because the email evidence leaves the Gmail sync window around
**5–10 October 2026**. After that date the only copy of the Sep 5–10 evidence is
Gmail itself.

Everything below is separated into **measured** (read from Gmail or Postgres) and
**inferred**. Nothing here reconstructs RFQ contents that no surviving record states.

---

## 0. Status summary

| Item | Status |
| --- | --- |
| `ELE-RFQ-546E65EC` | **Restored** into production from Supabase `farq-main` on 2026-09-16 (see §3) |
| Its two supplier portal links | **Expired** at the owner's instruction, 2026-09-16T10:54:39Z; reversible (see §3.1) |
| Six email-only RFQ tokens | **Not recoverable** — documented here only (owner declined waking the paused project) |
| Eight historical supplier messages | **Imported** into `construction.inbox_arrivals`, batch `historical-unlinked-2026-09-16`; bodies now live in Postgres, so the October window no longer threatens them |
| Attachments | Still only in Gmail (one attachment, akada, `image.png` — a signature banner, not a document) |

Oldest surviving RFQ in production after the restore: **2026-09-10T23:07:09Z**
(`ELE-RFQ-546E65EC`). Before the restore it was 2026-09-12T12:34:44Z.

---

## 1. The six RFQ tokens that exist only in email

Measured from Gmail (`info@farq.sa`, all folders, all time, 15 messages carrying an
RFQ token) compared against `construction.rfqs` in production. Department is read
from the token prefix and confirmed by the subject line.

### 1.1 `ELE-RFQ-6C466AD4`
- Department: ELE — القسم الكهربائي.
- Evidence: one message, **2026-09-05T20:09:14Z**, sent **by** `info@farq.sa` (outbound dispatch found in Sent).
- Supplier identity: not determinable from the surviving message.
- Replies: none. No supplier ever answered.
- Survives: token, date, the fact that it was dispatched.

### 1.2 `ELE-RFQ-2BE693F2`
- Department: ELE — subject: «توريد المواد الكهربائية — شركة الدفع».
- Evidence: seven messages, **2026-09-06T11:48Z → 2026-09-13T14:13Z**. Outbound dispatch present.
- Suppliers who corresponded: `yasser@fv.sa` (Fast Vision LED / Alamer Group),
  `imran.m@adwaafactorysa.com` (Al Adwaa Lighting), `arkan-sh@outlook.com`,
  `sales4@lightsofpower.com`.
- Replies: 4. Content: one acknowledgement promising a later offer (Fast Vision), one
  request for wattage and CCT before quoting (Adwaa), one request for a photo of the
  requirement (Arkan). **No prices.**
- Survives: token, department, four supplier identities, dates, the four reply bodies
  (now stored in `inbox_arrivals`).
- Live context: Fast Vision and Adwaa **currently hold invites** on active RFQs.

### 1.3 `ARC-RFQ-37B23D78`
- Department: ARC — subject: «مواد الأعمال المعمارية والتشطيبات — تطبيق فرق».
- Evidence: two messages, **2026-09-07T18:00Z** and 2026-09-08T06:47Z.
- Supplier: `afnan@akada.com.sa` (AKADA Trading Company LLC).
- Reply content: a **decline** — the requested product is not in AKADA's portfolio
  (they sell door hardware, smart locks, access control), plus a portfolio link.
  **No prices.** The single attachment is the sender's signature banner image.
- Quoted inside the reply's forwarded original (therefore measured, not reconstructed):
  dispatch sent **2026-09-04 10:51**, required delivery date **2026-09-11**, one line
  shown as `MARBLE-NATURAL-WHITE-VEINED-FLOORING-M2`, quantity `327 M2`.
- Survives: token, department, supplier identity, dates, decline body, and the one
  quoted line above. Nothing else about the RFQ's contents survives.

### 1.4 `CIV-RFQ-507DC0A0`
- Department: CIV — subject: «توريد المواد الميكانيكية — فرق للبناء».
- Evidence: one message, **2026-09-08T12:49Z**, from `a.alngedan@gmail.com` — an internal
  test address, body is the single word `Dcv`.
- No outbound dispatch found in Sent; the RFQ is known only because the reply quotes it.
- Survives: token, department, date. No supplier content of value.

### 1.5 `CIV-RFQ-9EC02917`
- Department: CIV — subject: «توريد المواد الميكانيكية، مواد البناء والأعمال المدنية — فرق للبناء».
- Evidence: one message, **2026-09-09T10:39Z**, from `abdulrhman@farq.sa` (the owner's own
  address), body «الرجاء التوضيح».
- No outbound dispatch found in Sent.
- Survives: token, department, date.

### 1.6 `CIV-RFQ-EA4DF2F6`
- Department: CIV — subject: «مواد البناء والأعمال المدنية — فرق للبناء».
- Evidence: one message, **2026-09-10T09:43Z**, from `info@youmats.com` (YouMats customer service).
- Reply content: order registration acknowledgement. Quoted inside it (measured):
  «أسمنت اليمامة، الكمية 100 كيس، توصيل الرياض»، buyer named as «فرق للتكنولوجيا (فرق للبناء)»,
  with an optional question about 50 kg vs 20 kg bags. Sales promised a later price.
  **No price given.**
- Survives: token, department, supplier identity, date, the quoted requirement above.

### 1.7 What is gone and cannot be recovered from these records

Measured absence, stated plainly:

- **No RFQ line items, quantities, units, or specifications** survive for any of the six,
  except the two quantities quoted above (327 M² marble; 100 bags of Yamama cement).
- **No supplier prices exist anywhere in the six.** This is the one piece of good news:
  nobody had quoted a number by email, so no supplier's actual price was lost. Earlier in
  this investigation I characterised the akada reply as carrying pricing data — that was
  wrong; it is a decline with no figures. Verified by scanning all eight imported bodies
  for currency and price patterns: zero matches.
- **No audit trail** for these RFQs exists in either database, so who created them, with
  what scope, and against which project cannot be established.
- The paused Supabase project `xqpvoxqiwrkrhiwcsubj` was **not** woken (owner's decision),
  so it remains the only untested place these six might still exist.

---

## 2. Reversal of the historical message import

Batch `historical-unlinked-2026-09-16`, 8 rows, `account_id = 'info@farq.sa#historical'`:

```sql
delete from construction.inbox_arrivals
 where evidence->>'import_batch' = 'historical-unlinked-2026-09-16'
   and invite_id is null;
-- fallback for rows the live sync may have written first:
delete from construction.inbox_arrivals
 where evidence->>'reason' = 'NO_ELIGIBLE_INVITE'
   and occurred_at < '2026-09-12T12:34:44Z'
   and invite_id is null;
```

`invite_id is null` is the guard: a row the owner has since linked to an RFQ by hand is
never deleted. Proven against a test batch on 2026-09-16.

---

## 3. `ELE-RFQ-546E65EC` — what was restored and how to undo it

Source: Supabase `farq-main`, `construction` schema (the only RFQ it held).
Target: Railway production. Restored 2026-09-16.

Restored verbatim: the RFQ (`status = PARTIALLY_SENT`, `correspondence_mode = OPEN`,
original `created_at`/`updated_at`), version 1 with its full payload and commercial
fingerprint, both rfq_lines, both rfq_invites (delivery `PARTIALLY_SENT` and `SENT`,
response `AWAITING_QUOTE`), and all six dispatch_attempts with their message snapshots.
Suppliers: بي برو (`registry-SG-0001610`) and بيت هايل لمواد البناء (`registry-SG-0038078`) —
both already existed in production under the same ids.

Two documented transformations, both required rather than cosmetic:

1. `buyer_user_id` and `rfq_versions.created_by` were remapped from the source value
   `160d8668-…b737a`, which does not exist in production `access_users`, to the owner's
   account `44cdaadd-…0580`. Without this the insert violates the foreign key, and with
   the original value the RFQ would have been invisible in his UI.
2. The catalog item `00c503a3-…ac461` («الخزف السعودي — ميراج») was missing from
   production `construction.items` and was restored verbatim from Supabase, because
   `rfq_lines.item_id` is `NOT NULL` and line 1 points at it.

Gaps, not filled: `audit_timeline` is empty because no audit rows exist in the source
either, and no `inbox_owners` assignment was created because the source had none.

### 3.1 Invite links — restored live, then closed at the owner's instruction

Both invites were restored with their stored `access_token_hash` and their original
`access_token_expires_at = 2026-10-10T23:07:09Z`, which made the two 10 September portal
links usable again: the gate requires only a hash match, a future expiry,
`rfqs.current_version_id = the invite's version`, and `submission_closed_at is null`.

**The owner then instructed that both links be closed. Executed 2026-09-16T10:54:39.892Z
(13:54:39 Riyadh):**

```sql
update construction.rfq_invites set access_token_expires_at = now(), updated_at = now()
 where rfq_version_id = '8a449ff0-a3ba-4dab-9bde-885d88167775';
-- 2 rows affected, checked before commit; 467 invites exist in production and the
-- other 465 kept their expiry untouched.
```

Verified through the supplier portal route itself, not by reading the column back: with
both tokens taken from the dispatch snapshots, `GET /api/construction/supplier/portal/:token`
now returns **404 `CONSTRUCTION_NOT_FOUND`**, which is the status the portal maps to the
`invite-gone` screen («رابط طلب السعر غير صالح»). Transient failures map to `load-retry`
instead and never claim expiry — that separation is covered by
`Frontend/src/pages/ConstructionPage.supplier-portal-errors.test.tsx`, five tests, passing.

Side effects of the expiry, for accuracy: `updated_at` on both invites is now
2026-09-16, so the invite rows are no longer byte-identical to the Supabase source.
`opened_at` and `last_accessed_at` remain null — the before/after portal rehearsal ran
inside a rolled-back transaction precisely so it would not record a supplier visit that
never happened.

**Re-opening them**, if a supplier holding the 10 September email replies. The token
hashes were never changed, so restoring the original window revives the original links:

```sql
update construction.rfq_invites
   set access_token_expires_at = '2026-10-10T23:07:09.961Z', updated_at = now()
 where rfq_version_id = '8a449ff0-a3ba-4dab-9bde-885d88167775';
```

Any other value is equally valid — `now() + interval '30 days'` gives a fresh window on
the same links. Going through the normal re-send path instead would mint new tokens and
email the suppliers, which is a different decision.

Reversal (proven on 2026-09-16 in a rolled-back transaction: it refused while a synthetic
supplier quote was attached, then deleted exactly 1 rfq + 1 version + 2 lines + 2 invites +
6 dispatch attempts + 1 item):

```sql
-- refuse if anything attached itself after the restore
select (select count(*) from construction.supplier_quotes where invite_id in (
          select i.id from construction.rfq_invites i join construction.rfq_versions v
            on v.id = i.rfq_version_id where v.rfq_id = '546e65ec-39ff-4e97-a6fe-0997f7cec1f3')) quotes,
       (select count(*) from construction.awards where rfq_id = '546e65ec-39ff-4e97-a6fe-0997f7cec1f3') awards;
-- then, children first; rfq_versions / rfq_lines / dispatch_attempts carry
-- before-update-or-delete immutability triggers, so the session must bypass them
begin;
set local session_replication_role = 'replica';
delete from construction.dispatch_attempts where invite_id in (
  select i.id from construction.rfq_invites i join construction.rfq_versions v
    on v.id = i.rfq_version_id where v.rfq_id = '546e65ec-39ff-4e97-a6fe-0997f7cec1f3');
delete from construction.rfq_invites where rfq_version_id in (
  select id from construction.rfq_versions where rfq_id = '546e65ec-39ff-4e97-a6fe-0997f7cec1f3');
delete from construction.rfq_lines where rfq_version_id in (
  select id from construction.rfq_versions where rfq_id = '546e65ec-39ff-4e97-a6fe-0997f7cec1f3');
update construction.rfqs set current_version_id = null where id = '546e65ec-39ff-4e97-a6fe-0997f7cec1f3';
delete from construction.rfq_versions where rfq_id = '546e65ec-39ff-4e97-a6fe-0997f7cec1f3';
delete from construction.rfqs where id = '546e65ec-39ff-4e97-a6fe-0997f7cec1f3';
delete from construction.items where id = '00c503a3-e4e7-4af2-a1a0-7380679ac461'
  and not exists (select 1 from construction.rfq_lines where item_id = '00c503a3-e4e7-4af2-a1a0-7380679ac461');
commit;
```

---

## 4. Recurrence guard — specification only (build deferred by the owner)

### 4.1 The mechanism that produced this loss

Measured: production `construction.rfqs` never contained the six tokens. A `pg_dump`
taken four hours before the oldest surviving RFQ, with table OIDs matching the current
database, shows zero RFQ rows. Inferred, and the only explanation consistent with that:
`CONSTRUCTION_DB_URL` was re-pointed to a different (empty) database around
2026-09-12 12:34 UTC. Nothing was deleted from the database now in use.

The damage is not the re-pointing itself but that it was **silent**:

1. Nothing in an outbound RFQ email records which database produced it. A reply arriving
   after a switch cannot be told apart from a reply to an RFQ that never existed.
2. `Reply-To` seals an invite id, and portal links seal a token hash, both minted in a
   specific database. Switching databases orphans every outstanding invite instantly and
   irreversibly — the supplier's link and reply address point at rows that are no longer
   reachable.
3. Inbound routing then classifies the whole history as `NO_ELIGIBLE_INVITE` (a message
   cannot match an invite older than itself when no invite is older than anything) and,
   worse, that branch returned `{skip:true}` without persisting a row, so the largest
   category of loss left **no database trace at all**. The six tokens were discoverable
   only by reading Gmail by hand.

### 4.2 What the guard must check

1. **Database identity on every send.** Stamp each outbound RFQ message with the
   database's identity (Postgres `system_identifier`, or a one-row
   `construction.instance_identity` seeded at migration time) inside the dispatch record
   and in a message header. An inbound reply whose stamp does not match the connected
   database must be reported as a mismatch, never silently skipped.
2. **Boot-time identity assertion.** On startup, compare the connected database's identity
   with the last identity this service saw (persisted outside the database, e.g. the env
   group). A change must fail loudly or require an explicit acknowledged flag, not proceed.
3. **Durable unlinked-reference table.** Every inbound message naming an RFQ token or
   invite id that is absent from the connected database must write a row (token, provider
   message id, sender, timestamp, reason) that survives independently of Gmail retention.
   This single table would have made the present investigation unnecessary.
4. **Batch-level alarm on eligibility failure.** If `NO_ELIGIBLE_INVITE` exceeds a small
   share of a sync batch (a threshold near 20% is enough — the real event was 142/150),
   alarm. A whole mailbox becoming ineligible is a database problem, not mail behaviour.
5. **Cursor namespacing.** The Gmail history cursor must be keyed by mailbox **and**
   database identity. A shared or inherited cursor lets a newly pointed database skip
   every message the old one had already consumed.
6. **Pre-cutover parity gate.** Before `CONSTRUCTION_DB_URL` may change, assert row-count
   parity for `rfqs`, `rfq_versions`, `rfq_invites`, `dispatch_attempts` and
   `supplier_quotes` between old and new, require an explicit acknowledgement of any diff,
   and retain a dump of the old database. The dump that made this investigation conclusive
   existed by luck, not by policy.
7. **Invite token ledger.** Keep an append-only ledger of issued invite tokens
   (hash → invite id, RFQ token, supplier, mailbox, database identity, expiry) written
   outside the RFQ database, so an orphaned invite can still be attributed after a switch.
8. **Redact portal tokens in snapshots.** Observed while restoring: `dispatch_attempts.
   message_snapshot` stores the supplier portal link with the token in cleartext, which
   defeats storing only `access_token_hash` on the invite. Any snapshot retention policy
   should mask the token. *(Owned by the queue/token lane — do not duplicate.)*
   Related, and worth checking there: `queuedPortalTokenFor` derives the token as
   `HMAC(secret, 'construction:rfq-invite:' + invite_id)`, which is deterministic. If the
   send queue ever re-sends an invite whose token already leaked, it regenerates the same
   token string and extends its expiry. Not verified here — the queue secret is not in
   this environment — but it decides whether expiring a link is a durable revocation or a
   pause.

### 4.3 Deploy-ordering risk observed while testing the portal

The working tree's `getPublicSupplierInvite` selects `rfq_lines.item_name_ar`, added by
`20260916170000_construction_unmatched_rfq_lines.sql`, which is **not applied to
production**. Run against the production database, that code returns HTTP 500 for every
*valid* invite token — the portal then shows the retry screen to suppliers who could
otherwise quote. The migration must land before or with that code.

---

## 5. Display fix that made the imported bodies readable

`api/lib/construction/inbox-unresolved.js` suppressed `preview` (sender, subject, body)
unless an arrival named at least one candidate invite, all of them owned by the caller.
The first condition hid every unlinked arrival, including this import. The guard now
treats "no candidate invites" as trivially isolated, because an arrival that implicates no
RFQ cannot implicate another buyer's RFQ. Cross-buyer suppression (any candidate not the
caller's) and sealed-envelope suppression are unchanged, and were re-verified on real
production rows plus synthetic cross-owner cases.
