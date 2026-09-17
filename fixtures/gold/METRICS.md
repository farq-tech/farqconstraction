# Gold Set metric definitions — fixed 2026-09-17, BEFORE any measurement

Written first, on purpose. Precision@5 requires judgement, and a criterion invented after
seeing results drifts toward flattering them. Anything not defined here is out of scope for
this instrument until this file changes, and a change to this file invalidates comparison
with earlier runs unless the earlier run is re-scored under the new definition.

The headline is no longer intent accuracy. `67/68` is not reported here.

---

## 0. Unit of measurement

One **item** = one BOQ/RFQ line as a buyer would upload it. Metrics are per item, then
aggregated per component and overall. No template masking, no deduplication: an item that
appears twice counts twice, because the buyer sees it twice.

## 1. `returned_suppliers_at_all`

Boolean per item. True when the pipeline yields **≥1** supplier candidate.

Reported as a count and a percentage of items.

## 2. `suppliers_per_item`

Integer per item — the number of distinct supplier rows returned, before any page limit.
Reported as median and mean, plus the distribution across the buckets
`0`, `1–2`, `3–5`, `6–20`, `21–100`, `>100`.

Median, not mean, is the headline: this directory contains generic suppliers that match
almost anything, so a long tail would flatter the mean.

## 3. `precision_at_5`

Of the **first five** suppliers shown, in the order the pipeline would show them, how many
are **genuinely appropriate for the material**.

### The criterion, fixed here

A supplier is `APPROPRIATE` for an item when the supplier's **own recorded evidence**
contains at least one product or activity tag that belongs to the item's resolved material
family, per `material-evidence.json`.

A supplier is `WRONG_MATERIAL` when its recorded evidence contains tags, none of which
belong to the item's material family, **and** at least one belongs to a different sector's
family. This is the class that sends a real RFQ to a business that does not sell the thing.

A supplier is `UNSURE` when any of these hold. `UNSURE` is a real verdict, not a failure to
decide, and it is never silently folded into either side:

- its recorded evidence consists **only** of generic tags (see below);
- its evidence is empty, or is free text that names no product;
- the item's resolved family has no entry in `material-evidence.json`;
- the item did not resolve to a family at all, so there is nothing to be appropriate *to*.

**Generic tags carry no material evidence** and can never establish `APPROPRIATE`:
`general-supply`, `hardware-general`, `maintenance`, `transport`, `manpower`,
`siteworks`, `finishing`, `mechanical`, `electronics`, `it`.

These are the tags that would let a directory of 245,729 rows appear to serve everything.
A supplier whose only claim is «توريدات عامة» has told us nothing about material.

### Reporting

`precision_at_5` is reported as **three numbers, never one**: appropriate, wrong-material,
unsure, each out of the number of positions actually filled (an item returning 3 suppliers
has 3 positions, not 5). A single averaged percentage is not reported, because it would hide
`unsure` inside a denominator.

### Auditability

Every judgement is written to the run output with the supplier id, name, the evidence string
it was judged on, and the tag that decided it. A reader disagreeing with a verdict can find
the row and the reason. No score is used as evidence.

## 4. `wrong_material_count`

Count of `WRONG_MATERIAL` verdicts in the top five, per item and in total. Also reported as
`items_with_any_wrong_material`, because one bad supplier in a pool of five is a different
failure from five.

## 5. `zero_count` and the reason for each zero

Every item returning zero suppliers is assigned exactly one class:

| class | meaning |
|---|---|
| `ZERO_BECAUSE_MAPPING_BROKEN` | The item resolved to a family or intent, but the supply side produced nothing for it. A **defect**. Includes the case where the intent has no supplier mapping at all. |
| `ZERO_BECAUSE_NO_CONFIRMED_SUPPLIER` | The item resolved, the supply side was queried correctly, and no supplier in the directory has evidence of supplying it. A **correct answer** that must be shown honestly to the buyer. |

A third class is recorded but is **not** a supply-side outcome, and is reported separately so
it cannot be hidden inside either of the two above:

| `ZERO_BECAUSE_UNRESOLVED` | The item never resolved to a family, so no supplier query was possible. A demand-side gap. |

## 6. The cascade question

The shadow run will be judged on one comparison, stated now so it cannot be renegotiated:

> **Does the cascade raise coverage without raising confident-wrong?**

- `coverage` = `returned_suppliers_at_all` plus `suppliers_per_item` median.
- `confident-wrong` = `wrong_material_count`, plus demand-side confident-wrong (an item
  resolving to a family in the wrong sector at level A or B with `poolable = true`).

**A coverage gain paid for with even one new confident error is a FAILURE, not a wash.**
The instrument reports it as `VERDICT: FAIL (bought coverage with N new confident errors)`.
There is no threshold below which a new confident error is acceptable, because the failure
mode being guarded against — a real supplier receiving a request for a material it does not
sell — is what produced the «غير متوفر» replies.

## 7. Version fingerprint

Every run records four hashes, matching the split the API lane is producing:

- `payload_sha16` — the ontology JSON
- `resolver_sha16` — the resolver source
- `request_resolver_version` / `intent_contract_hash` / `supplier_mapping_hash` when the API
  lane's split is available; until then the run records `supplier_side = live_directory_query`
  and the directory row count, because a supplier metric with no supply-side fingerprint is
  not comparable across days.

A run whose fingerprints do not resolve to a recorded version is reported as
`UNRECORDED` and its numbers are not to be quoted.
