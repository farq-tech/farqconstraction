# The toilet zero, and the eligibility gate — 2026-09-17

## 1. Which of the three causes it is

The question was whether `rfq_eligible_supplier_count: 0` on every toilet spec is
(a) the `cpo-v10` map not being live, (b) genuinely no sanitary evidence among the
44,354, or (c) the eligibility computation. Measured, it is **(c), and for a
specific reason that makes (a) irrelevant and (b) false as stated.**

`rfq_eligible_supplier_count` is computed by `eligibleBoqSuppliers` in
`lib/construction/boq-rfq-readiness.js`. **It never reads the intent-supplier
map.** It reads exactly one table, `construction.supplier_item_capabilities`, and
requires a six-way conjunction: a capability row for *that item's*
`farq_spec_id`, graded `DIRECT`, confidence ≥ 0.7, a non-empty `evidence_url`,
observed within 180 days, plus a usable contact and an owner-scoped
`intelligence_supplier_state` row, deduplicated by organisation.

So raising `CONSTRUCTION_INTENT_SUPPLIER_MAP_ENABLED` **would not move this
number at all.** The map and this counter are on different circuits. That is
worth stating plainly because it was the obvious hypothesis and it is wrong.

### The funnel, on the 13 sanitary/toilet catalogue items

| stage | distinct suppliers |
| --- | --- |
| any capability row at all | **0** |
| + active, not REJECTED | 0 |
| + confidence ≥ 0.7 and evidenced status | 0 |
| + evidence_url present | 0 |
| + observed within 180 days | 0 |
| + supplier active and public | 0 |
| + has a contacts row | 0 |
| + intelligence_supplier_state | 0 |

It zeroes at **stage one**. Not freshness, not contactability, not the map. There
has never been a single item-level capability row for any sanitary item.

### Why a control returned non-zero

`supplier_item_capabilities` covers 1,432 of 3,402 active items (42.1%) and 226
of 44,354 suppliers. Its coverage is concentrated in `custom-procurement` (94
suppliers), `marble` (21), `electrical` (14), `building-material` (13),
`tools-equipment` (12). `bathroom` holds **zero**. The endpoint is healthy; the
table is empty in this family.

**199 suppliers in the entire directory** clear the full rfq-eligible conjunction
anywhere. That is 0.45%.

### Why (b) is false as stated

Sanitary evidence exists — just not in the form this gate demands. The
`wc_sanitaryware` map pool holds **774 suppliers, 112 of them with documented
(non-name-derived) evidence**. So the correct reading is: *evidence exists at
category level and is absent at item level.* That distinction is the whole
finding, and it decides the response — this is a **crawl/backfill gap in
`supplier_item_capabilities` for sanitary ware**, not a matching defect and not an
absence of suppliers.

## 2. My Gate A number, and which population it describes

It was **not** falsified. It describes a different population, and I should have
labelled it.

- **My run:** local DB, flag **on**, pools read from `construction.intent_supplier_map`
  keyed on `cpo-v10`, resolver bundled from the v10 RC (`13ea40a5` + the inflection patch).
- **The UI check:** deployed API, flag **off**, `procurement_intent` null on every
  row, plus client-side padding from a local catalogue.

Both honest, neither comparable. The four paint companies and the steel firm were
never in a server pool.

### The 121 placements, re-read with the corrected instrument

The `≥100` correction stands: map pools are true counts, keyword rows are capped
at 100, so "100" in Gate A is a page limit and is reported as `≥100`.

Judged on **material**, as before: **9 wrong of 121 → Precision@5 92.6%** (partial
metric — 121 classified placements, not 145).

| source | placements | wrong-material | P@5 |
| --- | --- | --- | --- |
| map union | 85 | 7 | 91.8% |
| keyword search | 36 | 2 | 94.4% |

Judged on **admitting evidence**, which is the owner's actual standard, the
picture is much worse and is the real before-number:

| source / admitting evidence | placements |
| --- | --- |
| map / generic or name-only | **56** |
| map / product-level | 29 |
| keyword / generic or name-only | **26** |
| keyword / product-level | 10 |

**82 of 121 placements (67.8%) were shown with no product-level or documented
evidence.** The material judgement said 92.6% correct; the evidence standard says
two thirds should never have been recommended. The gate targets the 67.8%, not
the 7.4%.

## 3. Is the gate satisfiable with the evidence we hold

Partly, and the honest answer has two halves.

**At directory scale, no.** Of 44,354 active suppliers:

| | suppliers |
| --- | --- |
| item-level capability rows | 226 (205 not specialty-inferred) |
| non-generic specialty ≥ 0.85 | 6,199 |
| — of those, **name- or category-derived** | **5,405** |
| — of those, documented/product-evidenced | 741 |
| **admissible under the owner's standard (union)** | **945 (2.1%)** |

The evidence strings say it outright: `GOOGLE_NAME_ONLY: term "كهرباء" in name`
(531 rows), `term "مواد بناء" in category` (536 rows). The directory's specialty
layer is overwhelmingly *derived from company names*, which is discovery evidence
being spent as admission evidence.

**Per line, yes — provided the gate runs before ranking, on the full pool.** Every
one of the 14 map-served intents retains eligible suppliers:

| intent | full pool | eligible |
| --- | --- | --- |
| socket_outlet | 2,570 | 159 |
| ventilation_opening | 1,940 | 87 |
| stone_slab | 803 | 74 |
| wc_sanitaryware | 774 | 112 |
| aluminium_window_door | 764 | 33 |
| mineral_wool_insulation | 508 | 18 |
| cement_render | 400 | 15 |
| handrail_balustrade | 358 | 32 |
| car_park_shade | 356 | 3 |
| gypsum_board | 191 | 29 |
| fire_hydrant | 158 | 62 |
| precast_chamber | 19 | 8 |
| kerbstone | 19 | 1 |
| paving_block | 17 | 1 |

`kerbstone`, `paving_block` and `car_park_shade` land on 1–3 and are one
de-listing away from zero.

### The measurement error worth keeping

Gating the **visible page of five** put `wc_sanitaryware` at zero. Gating the
**full pool** puts it at 112. Same gate, same data. Today's ranking places none
of the 112 evidenced sanitary suppliers in the top five, filling them instead
with suppliers whose specialty strings are generic hardware bundles that happen
to contain the token `sanitary`. That is the same failure class the UI saw,
reproduced on the server, and it is an argument for gating before ranking rather
than after.

## 4. What was built

- `api/lib/construction/supplier-eligibility-gate.js` — three verdicts,
  `ELIGIBLE` / `UNKNOWN` / `EXCLUDED`. Admission requires a catalogue product, an
  explicit non-generic classification, a documented page or a confirmed record;
  names, cities, proximity and generic activity phrases discover only. Hard
  exclusions return before any evidence is weighed, so no score can outvote them.
  `gatePool` returns the three groups separately and `preselectable` is a
  narrower field than `eligible` — the falsifying report was eight suppliers
  already **ticked for sending**, so the default selection is what has to be
  conservative, not just the ordering.
- `api/tests/construction-supplier-eligibility-gate.test.js` — 8 tests, all
  passing, written as attacks. The name-derived evidence kinds in them are real
  rows from the directory.

`genericOnly` strips on **residue, not presence**: `مواد بناء، أدوات صحية` keeps
its specific token and stays eligible, because punishing a company for its own
breadth is a different wrong answer.

## 5. Item-by-item cost, as required

28 items have a discovered pool today. After the gate: **16 still recommend, 12
reduce to zero, and 0 of the map-served items are among the 12.** Median eligible
count among still-served items is 32.

Every one of the 12 is a line that never became a canonical identity, zeroed by
the `LINE_NOT_IDENTIFIED` rule — an unidentified line cannot be eligible *for*
anything:

| # | verdict | line |
| --- | --- | --- |
| 1 | FAMILY_ONLY | بلاط تيرازو (60 unknown) |
| 2 | UNRESOLVED | صناديق خراطيم الحريق (23 unknown) |
| 3 | FAMILY_ONLY | قواطع زجاجية (≥100 unknown) |
| 4 | UNRESOLVED | خشب (≥100 unknown) |
| 5 | FAMILY_ONLY | حديد تسليح (≥100 unknown) |
| 6 | UNRESOLVED | أبواب ونوافذ خشبية (≥100 unknown) |
| 7 | FAMILY_ONLY | أنابيب يو بي في سي (46 unknown) |
| 8 | FAMILY_ONLY | لوحات تحويل مصادر الكهرباء (≥100 unknown) |
| 9 | FAMILY_ONLY | إنارة داخلية (≥100 unknown) |
| 10 | FAMILY_ONLY | أبواب زجاجية سحاب (≥100 unknown) |
| 11 | FAMILY_ONLY | محابس (≥100 unknown) |
| 12 | FAMILY_ONLY | أبواب زجاجية (≥100 unknown) |

These are **not** the 31 coverage zeros — those return nothing today. These 12
return keyword results today and would stop being *recommended*. They do not
disappear: they remain in `unknown`, offerable as candidates. What they lose is
the endorsement and the pre-tick, which is precisely what was wrong about them.

This is a real trade and the owner should make it knowingly: 12 lines move from
"here are ≥100 keyword guesses, eight pre-selected" to "no confirmed supplier,
here are candidates we have not verified."

## 6. The 31 coverage zeros, left alone as instructed

Listed for the record only. 20 `FAMILY_ONLY`, 11 `UNRESOLVED`. Concentrated in
`cement_binders` (5× «خرسانة أسمنت», «ألواح أسمنت»), `floor_tiling` (6×
«بورسلين و سيراميك»), `paints_coatings` (4×), `pipes_fittings` (4×),
`power_cables` (2×), `hvac_equipment` (2×), `sanitary_ware` (1×), plus 11
unresolved lines (metal doors and gates, water tanks, access control, distribution
boards, circuit breakers, heaters).

## 7. Open items and coordination

- **No payload change was made.** The gate reads evidence tables and the
  ontology's existing identity; it adds no vocabulary. Nothing here invalidates
  the v10 fingerprints being certified by the Arabic-morphology lane.
- **A vocabulary change is not needed for this fix**, which is worth saying
  explicitly since the original hypothesis pointed at one. For the record,
  «بورسلين» is a `floor_tiling` strong term and appears on no other node — but the
  resolver already reads «مراحيض بورسلين شرقية» as `wc_sanitaryware`, so the term
  is not bridging anything. That hypothesis is dead by measurement, not by
  instruction.
- **The `ITEM_NAME_SPECIALTY_MAP` in `supabase-repository.js` is a separate,
  real defect** and is reported rather than folded in: it has a `tiles` pattern
  matching «بورسلان|بلاط|porcelain|ceramic» ordered **above** its only sanitary
  pattern, and its sanitary pattern is `(ادوات صحية|sanitary ware)` — which
  contains no word for a toilet. A BOQ line saying «مراحيض» matches **no**
  pattern and can never reach the `sanitary` specialty, while a line saying
  «بلاط بورسلان» reaches `tiles` immediately. That is the owner's fourth
  requirement (generic material must not outrank product type) living in a second
  place, and it needs its own fix.
- **Wiring is not done.** The gate is a tested library; it is not yet called from
  `matchSuppliers`. That wiring touches the large candidate SQL and should land as
  its own reviewable change.
- **The real response to the toilet zero** is a capability backfill for the 13
  sanitary items, not a matching change. 112 evidenced candidates are already
  identified and could seed it.
