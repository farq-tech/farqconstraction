# Re-issue package for the five lost RFQs — prepared, not sent

**Status: awaiting the owner's decision. Nothing has been sent.**
Re-issuing puts real mail in front of real suppliers, so this is his call.
Read-only investigation; no writes were made for any of it.

## Where the content came from

The five RFQs are gone from production and from the Supabase copy. But the
outbound invitation is quoted inside the supplier replies still sitting in
Gmail, so **what was asked is recoverable for four of the five** — from the
correspondence, not from any database.

| RFQ | What was asked | Deliver to | Wanted by |
|---|---|---|---|
| `ELE-RFQ-2BE693F2` | إضاءة حدائق / garden lighting — 50 قطعة | الرياض | ١٨ سبتمبر ٢٠٢٦ |
| `CIV-RFQ-EA4DF2F6` | أسمنت اليمامة / Yamama Cement — 100 كيس | الرياض | ١٧ سبتمبر ٢٠٢٦ |
| `CIV-RFQ-9EC02917` | وصلة أنابيب 1 م.ط، وصلات حديد 1 قطعة، رمل ركام 1 م³ | الرياض | ١١ سبتمبر ٢٠٢٦ |
| `CIV-RFQ-507DC0A0` | وصلة أنابيب / pipes fitting — 1 متر طولي | الرياض | ١١ سبتمبر ٢٠٢٦ |
| `ARC-RFQ-37B23D78` | **not recoverable** — the only reply did not quote the request | — | — |

## Which of these are actually worth re-issuing

Only two have a supplier waiting on the other end.

**`ELE-RFQ-2BE693F2` — garden lighting, 50 units. Three suppliers engaged.**

- `imran.m@adwaafactorysa.com` (Al Adwaa Lighting) — will quote, but needs
  **Wattage and CCT** first. Also asked to be registered as an approved vendor.
- `yasser@fv.sa` (Alamer / Fast Vision) — "سنقوم بمراجعة المتطلبات وتقديم العرض
  في أقرب وقت". Acknowledged, no price yet.
- `arkan-sh@outlook.com` — asked for **a picture** of what is required.

All three asked for the same missing thing in different words: the request said
"garden lighting, 50 pieces" and gave no specification. Re-issuing the identical
text would produce the identical three questions. **Put the wattage, colour
temperature and a photo or datasheet into the new request**, and this becomes
answerable on first contact.

**`CIV-RFQ-EA4DF2F6` — Yamama cement, 100 bags. One supplier, already committed.**

- `info@youmats.com` — registered the request, said the sales team will send a
  price, and asked one question: **50 kg bags or 20 kg?** Answer that in the new
  request and there is nothing left to ask.

**The other three are not worth sending.**

- `CIV-RFQ-9EC02917` — the only reply is from `abdulrhman@farq.sa`, the owner's
  own address. That is his own test, not a supplier.
- `CIV-RFQ-507DC0A0` — the only reply is the single string "Dcv" from a personal
  Gmail address. Not a supplier engagement.
- `ARC-RFQ-37B23D78` — `afnan@akada.com.sa` declined: the item is outside AKADA's
  portfolio (they do door hardware, smart locks, access control). Re-sending the
  same request to the same supplier would get the same answer.

## Can the old replies be attached as reference?

**No, not through anything that exists today.** All eight orphaned arrivals have
`candidate_invites = 0`, and manual resolution rejects any target that is not
already a candidate (`INBOX_CANDIDATE_REQUIRED`). A re-issued RFQ creates new
invites the old arrivals have never heard of, so they cannot be pointed at it.

Practically this means: **he would be asking these suppliers a second time**, and
the earlier answers stay readable only in Gmail and in the unresolved list. For
the two worth sending that is tolerable, because in both cases the supplier asked
a question rather than sending a price — so the second message is not "please
quote again", it is the answer they asked for.

If attaching history matters later, the smallest fix is to let manual resolution
accept any invite of the owner's when `candidate_invites` is empty. That is a
real relaxation of the isolation rule and should be designed deliberately, not
bolted on. Not built.

## Before sending anything, check the send queue

This is more urgent than the re-issue itself. Of 467 invitations, only **188 were
actually sent**: 213 sit at `delivery_status='PENDING'` and 65 at `NOT_SENT`, and
the newest of them is 19 hours old, so nothing is in flight. Per request:

| RFQ | invited | sent | opened |
|---|---|---|---|
| `51D17AF6` | 162 | 97 | 5 |
| `B998B3F1` | 120 | **1** | 0 |
| `D9E7FBD7` | 115 | 29 | 3 |
| `6F833385` | 60 | **60** | 10 |

Re-issuing into a stalled send queue would reproduce the original failure. Note
also that the only fully-delivered request, `6F833385`, has by far the best open
rate — 10 of 60 against 3 of 29 and 0 of 1.
