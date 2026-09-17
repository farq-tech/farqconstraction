# The Gold Set — small, real, and lethal

The 183,942-row archive is no longer the release gate. It stays a regression test. This is
the instrument that replaces it as the measure of quality.

**Why it exists:** 184,010 archive lines contain only **2,874 distinct tokens**; `cpo-v6` and
`cpo-v10` are byte-identical across all of them while differing on the real booklet; and
**0 of 319** archive-register short lines moved under a morphology change. No corpus we own
could adjudicate a change to Arabic word formation. This one is built to.

Metric definitions are in [`METRICS.md`](METRICS.md), fixed **before** the first measurement.
The Precision@5 criterion is instantiated in [`material-evidence.json`](material-evidence.json).

---

## Composition — 265 items

| # | component | items | file | status |
|---|---|---|---|---|
| 1 | Real Etimad booklet, short-form register | **68** | `fixtures/boq/reference-booklet-68.shortform.txt` | present |
| 2 | Real 60-line RFQ | **60** | `fixtures/boq/catalogue-shortform-60.adjudicated.json` | **SUBSTITUTE — see below** |
| 3 | Every item that caused a real error in v4–v10 | **17** | `error-corpus.json` | present |
| 4 | Fresh sample, held out | **120** | sealed outside the repo | present |

### Component 2 is a named substitute, not the owner's RFQ

The owner's real 60-line RFQ lives in the **`farq` Supabase project, which is paused**;
unpausing production infrastructure is outside a read-only measurement. The active project
holds **one** RFQ with **two** lines. Every synthetic candidate — `site-safety-02`,
`datacenter-cyber-01`, `warehouse-ops-02`, `large-boq-480-lines.csv`, `booklet-02-extra` —
declares itself test data on its first page («بيانات افتراضية غير رسمية», `FARQ-TEST-*`) and
was refused.

A concurrent lane assembled `catalogue-shortform-60.adjudicated.json`: 60 **real** short-form
Arabic catalogue lines from the same production table, labelled a substitute everywhere it is
reported. It is carried here as component 2 with that status attached, because 60 real lines
in the right register are worth more than a reserved slot. **It is not held out** — that lane
has already adjudicated it. The owner's real RFQ still replaces it when available.

### Component 3 carries generation attribution

Every error entry names the generation that **broke** it and the generation that **fixed** it,
so a regression is identifiable by name rather than by a count moving. Two entries are
deliberately marked `open: true` and must not be scored as passes:

- `ERR-07` «قاطع 32 امبير عزل مزدوج» — the breaker guard's «عزل» still collides with
  insulation vocabulary. Open since v8.
- `ERR-14` «الياف معدنيه» — now resolves to **nothing** rather than wrongly. Safe, but the
  correct answer is unreachable because mineral wool's Arabic name is not in
  `thermal_insulation`'s vocabulary. Scoring this as fixed would let a fallback masquerade
  as a fix.

---

## Component 4 — how the held-out sample stays held out

**Source.** Production `construction.items`: 3,084 **real** product lines from real Saudi
vendors (Makita, RAK, Saudi Ceramics, Opal and Al-Wasid block factories, Proto, Tyrolit, Leo
pumps), in the short Arabic register buyers actually type. 120 drawn, stratified across
**63 categories**, capped at 10 per category so no single vendor's catalogue dominates.

**Why this is genuinely unseen.** Every ontology lane works in the repository and has **no
database access**. This vocabulary was never available to fit against. That is what "unseen"
has to mean to be worth anything — not "we didn't look", but "it was not reachable".

**Protection.**

| control | detail |
|---|---|
| plaintext location | `$HOME/.farq-gold-heldout/heldout-2026-09-17.jsonl` — **outside the repository** |
| permissions | file `0600`, directory `0700` |
| what git carries | `heldout/MANIFEST.json` — per-item **HMAC-SHA256** only, never a line |
| why HMAC and not SHA256 | the candidate space is small enough to dictionary-attack from the archives; a keyed digest is not |
| key location | `$HOME/.farq-gold-heldout/manifest-hmac.key`, also outside the repository |
| reproducibility | recorded seed `0.20260917`, so a disputed draw can be re-derived by someone with database access without publishing it |

**Who may look.**

- **Plaintext:** the measuring lane only — whoever is adjudicating, and **not while also
  tuning**. If the adjudicating lane ever tunes the ontology, this sample is burnt for that
  lane and must be redrawn under a new seed.
- **Aggregates only:** the ontology lane, the API/Phase-2 lane, and the retriever+verifier
  lane. They receive per-component metrics, never lines.

**Decay.** A held-out set stops being held out on contact. `MANIFEST.json` carries
`measured_count`; after **2** measurements it must be redrawn, because by then it has begun
to inform decisions. It is at 1 after the `cpo-v10` baseline.

---

## Running it

```
node scripts/gold-set-run.mjs              # full set
node scripts/gold-set-run.mjs --no-heldout # components 1 and 3 only, safe to share
```

Outputs `baseline-cpo-v10.report.json` and `.rows.jsonl`. Every Precision@5 judgement is
written with the supplier id, name, the evidence string it was judged on, and the tag that
decided it, so a reader who disagrees can find the row and the reason. No score is evidence.

### Two retrieval paths, and why both

`construction.intent_supplier_map` **does not exist** in production — the table was never
built, so the `CONSTRUCTION_INTENT_SUPPLIER_MAP_ENABLED` flag has nothing to switch on.

- **`live_text`** — what a buyer actually gets today: the resolver's Arabic search terms
  against the directory's names and item text.
- **`specialty`** — the evidence the intent-supplier map *would* key on:
  `construction.supplier_specialties`, 10,315 active rows over 5,707 suppliers.

Reporting both is what makes a zero attributable. A zero in `live_text` where `specialty`
has a pool is `ZERO_BECAUSE_MAPPING_BROKEN`, not `ZERO_BECAUSE_NO_CONFIRMED_SUPPLIER`.

Precision@5 is **refused** on the `specialty` path and reported as such: that path retrieves
on the same evidence the metric judges, so its precision would be 100% by construction.

## Known biases in the criterion, stated rather than discovered later

1. **Mis-tagged suppliers count against the engine.** The criterion judges a supplier on its
   *recorded* evidence, not its name. «ابراهيم استانلس درابزين وخشب» — a handrail maker whose
   name says so — is tagged `glass,tyres,pools` and is therefore scored `WRONG_MATERIAL` for
   a handrail. **21 of 41** wrong-material verdicts have an item word inside the supplier's
   name, so the honest wrong-material figure is a range, **20–41**, and the upper end is a
   directory data defect as much as a routing defect.
2. **Non-construction businesses land in `UNSURE`, not `WRONG_MATERIAL`,** because a tyre
   dealer has no ontology family to be evidence for. This under-counts wrong-material.
3. Both biases are left in place rather than patched, because the criterion was fixed in
   advance and changing it after seeing results is how a metric drifts. Fixing either
   requires editing `METRICS.md` deliberately and re-scoring the baseline.
