# `cpo-v8` — the rating is the device name, and the supply side gets a chokepoint

| | |
|---|---|
| base | commit `13ea40a` = `cpo-v6`, payload `1483e668f2d3012f` |
| produces | payload **`03fc7b2251bd6762`**, resolver **`ad285bc1b648b3a7`**, version `cpo-v8` |
| patch | `.handoff/cpo-v8-rating-vocabulary-and-supply-chokepoint.patch` |
| verify | `node scripts/verify-ontology-provenance.mjs` — v6, v7, v8 all fully reconstructible |
| tests | 438 pass (301 ontology + 3 conformance + 134 other) |
| not done | no commit, no deploy, no map rebuild, no other repo touched |

Three corrections and one condition were handed over. All four are closed. The
fourth item — the one framed as "not yours to fix" — turned out to be **partly
mine**: the four supply-side paths deciding on raw `termIndex` are in this
module, not only in the production port.

---

## 1. Completeness: **100.00%** against the corrected ceiling

| 68 real booklet items | `cpo-v6` | `cpo-v7` | `cpo-v8` |
|---|---|---|---|
| Level A | 33.82% | 50.00% | **55.88%** (38) |
| true unknown | 0.00% | 0.00% | **0.00%** |
| poolable | 98.53% | 98.53% | **98.53%** (67) |
| **completeness to ceiling** | 88.24% | 94.12%\* | **100.00%** (68) |
| **confident-wrong** | 4.41% | 0.00% | **0.00%** |

\* **The ceiling was corrected, and the correction is against me.** Three
breaker lines were adjudicated "the family is the complete answer" on the
grounds that 32A could be either device. That reasoning was wrong: the English
writer already reached the intent from «MCB 32A», so the Arabic writer was being
charged for a language asymmetry rather than for a genuine ambiguity. Under the
corrected ceiling v7 scores **94.12%**, not the 98.53% I reported.

**On the 92.65% figure:** the held-out lane measures 63/68, this table measures
64/68 for v7 — one line apart. The adjudication table is mine and theirs is
theirs, so I have recorded the difference in the eval script rather than
reverse-engineering their number to match. Both corrections point the same way
and both are now moot at v8, but the discrepancy should be resolved by sharing
one table, not by either side guessing.

---

## 2. The asymmetry is now in **units**

«MCB 32A» reached an intent; «قاطع 32 امبير» stopped at family. Same purchase —
the English writer names the device, the Arabic writer names the rating.

The rating is the discriminator **the trade itself uses**, so the standard
rating series is the context: IEC 60898 (6–63A) for `mcb`, IEC 60947-2
(100–800A) for `mccb`. A closed standard series, not booklet wording. Both
languages are in the vocabulary this time, which is the lesson from the three
previous rounds applied before being caught rather than after.

**63A–100A is deliberately in neither series.** An 80A breaker genuinely is
either device, so «قاطع 80 امبير» stays at family. That is the honest answer,
and picking one at 0.90 confidence is the exact failure the owner ranks as worse
than a Level C.

**The guard is what carries the rule, not the vocabulary.** A bare «قاطع»
inherits «امبير» from the family, so without `require_any` it would have claimed
every breaker line that mentions amps — including RCDs and ACBs. Verified:

| line | resolves |
|---|---|
| «قاطع 32 امبير» | `mcb` |
| «قاطع 100 امبير» | `mccb` |
| «قاطع 80 امبير» | family only — ambiguous by fact |
| «قاطع تسرب ارضي 63 امبير» | `residual_current_device` |
| «قاطع هوايي 800 امبير» | `acb` |
| «قاطع عزل 100 امبير» | family only |

**One thing to know:** I grew `DEMOTIONS_TO_OWN_FAMILY` — a may-only-shrink list
— by four entries. These are **depth** guards, not trade guards: guarding
«قاطع» at the family too would cost «قاطع 80 امبير» its pool, and an 80A breaker
is still bought from a breaker supplier. Same class as the `distribution_board`
entries already on the list, and each one is written out rather than waved
through, but it is a ratchet moving the wrong way and you should see it.

---

## 3. «اسمني»: **declined** — and the line closes anyway

I did not take the misspelling, and it costs nothing, because the defect was not
spelling.

«بلوك مفرغ» was **already** a strong term. «بلوك اسمني مفرغ» failed for exactly
one reason: the misspelled word sits **between** the two words and breaks
adjacency. Fixing the spelling would have fixed one sentence; the adjacency is
the fault.

So hollow/solid — which is what actually distinguishes this intent from
lightweight and clay blocks — now decides with «بلوك», **whatever adjective, or
whatever misspelling, sits in the middle**. A test walks the entire payload and
asserts «اسمني» appears in no term list.

**What happens to the line if the typo appears without «مفرغ»** — the question
as asked: «توريد بلوك اسمني للمباني» keys the `masonry_blocks` pool at family
level and reaches a real block supplier. It does not silently key nothing. That
floor is why declining the typo is free, and if that floor did not exist I would
have taken it.

The general form of this: **a typo only blocks a line when the vocabulary needs
two words to be adjacent.** Reducing adjacency dependence closes typos as a
class; encoding them closes them one at a time.

---

## 4. Provisional openers are marked **in the payload**

The clause vocabulary moved out of resolver code into `clause_rule` in the
payload, carrying its own evidence:

| opener | observations | status |
|---|---|---|
| «لل» | 7 | adopted |
| «بال» | 2 | **provisional** |
| «لال» | **1** | **provisional** |
| bare «ب» / «ل» | 14 / 12 | rejected — and the refusals are recorded as the evidence of derivation |

`provisional_review.after_booklet_lines = 1000`, `booklet_lines_seen = 136`, and
the payload states the reason the flag is tolerable rather than fatal: the error
direction suppresses, and suppression falls back instead of hijacking. A test
fails if an opener under the observation floor loses its flag.

**The second reason for the move matters more than the marking.** Vocabulary in
versioned data is *read* by consumers; vocabulary in code is *copied* by them.
That is precisely how the supply side came to be running v6's clause words
against a v7 payload.

---

## 5. Four supply-side paths were bypassing the rule — in **this** module

The bypass hunt reported the supply side as having no chokepoint. Those four
raw-`termIndex` decision points are in `procurementOntology.ts`:
`classifySupplierArchetypes`, the `search_terms` loop, the `supplier_terms`
loop, and `negative_terms`. **None of them ran the clause rule.** Reproduced
here before changing anything:

| supplier text | before | after |
|---|---|---|
| «مصنع دهانات» | `HARD_VETO` | `HARD_VETO` |
| «مصنع دهانات **تصنيف** رشاش حريق» | **`PREFERRED` + `auto_tick`** | `HARD_VETO` |
| «شبكات ري **مادة** رشاش حريق» | **`PREFERRED` + `auto_tick`** | `NO_MATCH` |
| «شركة مكافحة حريق ورشاشات» | `PREFERRED` | `PREFERRED` |
| «شركة مكافحة حريق **مادة** دهانات» | — | `PREFERRED`, no `paint_only` |

A paint factory went from vetoed to preferred **by adding a classification
clause**. Every positive claim now goes through `supplierClaims` → `bestHit`.

**`negative_terms` stays raw, on purpose.** A positive claim must be clause-clean
to count; a negative signal counts wherever it appears. Same fail-closed
direction the term guards already use, so a supplier cannot buy its way past an
exclusion by burying the disqualifying word inside a clause.

**Known bound:** a keyword at position 0 opens no clause — it is the product
itself — so «تصنيف رشاش حريق» *alone* is still a claim. In production the name,
activity and category are concatenated, so position 0 is the company name, which
is the case measured above. I kept one semantics for both sides rather than
forking the rule for supplier text; forking it would be a new drift surface.

---

## 6. Nothing moved in the held-out archive

183,942 rows across batches 3–10 and 11–20, re-run on `cpo-v8` and compared to
the v7 rows: **full-file SHA256 equality**, zero moved cells.

| set | rows | v7 → v8 |
|---|---|---|
| b3-10 | 81,752 | `58e6be7d…` = `58e6be7d…` |
| b11-20 | 102,190 | `6b36a5f3…` = `6b36a5f3…` |

So the 19 adjudicated cells hold at zero **by identity**, and the new vocabulary
touched no line that was already right. Confident-wrong cannot have moved
because no cell moved.

---

## 7. Derived, not mirrored — the view you asked for

**It is feasible, and that is the load-bearing fact.** The resolver is a
dependency-free module: one import (its own payload) and zero platform calls.
Nothing about it requires a reimplementation.

The shared question is **one** question — may this term name a product in this
text? — and **five rules** answer it: normalization, Arabic term compilation
(nisba and sound plurals), the clause regions, the opener-is-not-part-of-the-
value correction, and the position-0 exemption. Anyone who reimplements the
question reimplements all five, and then tracks all five forever.

Ranked plainly:

1. **Vendor the module.** One generated copy, never hand-edited — the same
   discipline the payload already has, extended to the code. I have exported
   `termDecidesIn(text, term)` as the **entire** shared surface, and it is the
   same code path the conformance fixture publishes, not a summary of it. One
   import replaces five rules.
2. **Publish the rule as data** — done here for the clause vocabulary. Ends
   **vocabulary** drift only; the algorithm still lives in code.
3. **Behavioural conformance fixture** — 34 cases now. A ratchet that *detects*
   drift after the fact; it does not prevent it.

(2) and (3) are what you do when (1) is impossible. **(1) is not impossible
here.** The only real cost is a TS→JS build artifact for the plain-JS API side,
which is one generated file. Against that: a hand-maintained second
implementation will drift by default, and this one already has — silently,
while passing its own tests, because both sides agreed on the algorithm and
disagreed on the words.

My recommendation is (1), with (3) kept permanently as the thing that proves (1)
is still true.

---

## 8. Coordination and repo health

- **The conformance fixture is now 34 cases, up from 30.** The four new ones are
  supplier-claim rows, and they will turn the supply side's test red until it
  syncs. That is the intended direction of the correction, not a surprise.
- **The vendored payload in `farq/api/data/construction/` is still `cpo-v7`.** I
  did not modify another repository.
- **Repo health, still open and still not cosmetic:** macOS AppleDouble `._*`
  files inside `.git/objects/pack/` produce `non-monotonic index` on every git
  command. This repo holds weeks of uncommitted work.
