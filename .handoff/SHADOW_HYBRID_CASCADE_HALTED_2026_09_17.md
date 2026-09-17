# Shadow hybrid retrieval cascade — built, measured, HALTED on owner's stop

Date: 2026-09-17 · lane: shadow retrieval cascade · status: **stopped mid-measurement, secured on a branch**
Branch: `shadow/hybrid-intent-cascade` · nothing wired into any production path · no user-visible output changed

---

## The answer first

**It does not beat `cpo-v10`.** Not once did both corpora clear the bar in the same run.
There were runs where each corpus cleared it separately, which is not the same thing and is
not what was asked for.

| run | payload | booklet 68 coverage | booklet confident-wrong | catalogue 60 coverage | catalogue confident-wrong |
|---|---|---|---|---|---|
| lexical + semantic, mid-session | `cpo-v11` | 67 → 67 poolable (+0) | **0 → 0** | 37 → 41 poolable (+4) | **5 → 7 (+2)** |
| lexical + semantic, final | `cpo-v9` | 67 → 67 poolable (+0) | **0 → 1 (+1)** | 39 → 41 poolable (+2) | **6 → 6 (+0)** |
| verifier = `gemma3:4b`, earlier | `cpo-v11` | 67 → 68 poolable (+1), 38 → 44 intents | **0 → 1 (+1)** | 37 → 47 poolable (+10), 12 → 20 intents | **5 → 14 (+9)** |

On the owner's booklet the cascade never once gained an answer. Its best booklet result is
"changed nothing", and its worst is one confident error. The coverage gains are entirely on
the catalogue corpus, and each time they appeared, confident errors appeared beside them.

The small-model verifier is the clearest result in the table and the most useful one: it buys
coverage at roughly **three new confident errors for every two answers gained**. It was not
reasoning over the candidate list, it was taking the first item.

## A measurement hazard that invalidates cross-run comparison

The two full runs above were measured against **different ontology payloads**: `cpo-v11`
(fingerprint `0d4e2df45ddcc52c`) and then `cpo-v9` (fingerprint `ff731475355d12a9`). Another lane
changed the payload in the shared tree between runs. The v10 baseline itself moved under me —
catalogue poolable 37 → 39, catalogue confident-wrong 5 → 6 — with no change of mine involved.

**Whoever resumes must pin the payload first.** Reconstruct a `cpo-v10` worktree from base
commit + patch and run both arms inside it. Every number above is provisional for that reason,
and the sole booklet error in the final run («هيكل لألواح الجبس», below) may be an artefact of the
v9 payload rather than of the cascade, because under v9 v10 reaches that line by
`weak_with_context` and the cascade is permitted to argue with that tier.

## What is built

- `src/lib/intentRetrieval.ts` — stage 2. One document per intent (Arabic and English names,
  synonyms, mined real examples, family, discriminating terms, exclusions taken from the payload's
  own negative terms and guards). Two retrieval paths, merged by reciprocal rank fusion, which
  needs no tunable weights. **218 vectors compared in memory. There is no vector database and the
  file says why one would be wrong here.**
- `src/lib/intentCascade.ts` — stages 1 and 3, plus the authority layer. Stage 1 is `cpo-v10`
  untouched. Stage 3 is a verifier that cannot invent an intent: it picks from the presented list
  or returns `FAMILY_ONLY` or `UNRESOLVED` as the contract already defines them.
- `src/lib/intentCascade.test.ts` — 28 tests, all passing at the halt, including the four named trap
  cases (mineral fibre vs metal, irrigation vs fire sprinkler, rebar vs ready-mix, conduit vs cable)
  and a test that the 68 booklet items stay exactly where v10 put them.
- `scripts/cascade-shadow-eval.mts` — the shadow harness. Reports coverage and confident-wrong side
  by side and lists every disagreement individually.
- `scripts/cascade-intent-examples.mjs` — mines real example lines from archive rows, excluding both
  measurement corpora so the documents cannot be seeded with the answers.
- `scripts/cascade-embed-probe.mjs`, `scripts/.templatic-probe.tmp.mjs` — the two probes whose
  results are quoted below.
- `fixtures/boq/catalogue-shortform-60.adjudicated.json` — 60 real Arabic lines sampled from
  `construction.items` and adjudicated in this lane. **This is not the owner's 60-line RFQ**; see
  limitations.

Embedding model: **bge-m3**, offline via Ollama, 1024 dims, chosen over `nomic-embed-text` and
`granite-embedding` for genuine multilingual Arabic. Its limits are measured, not assumed.

## Four findings worth more than the cascade itself

**1. Every guard in the payload was inert in the retrieval layer.** Guard relevance was matched
against each intent's *own* terms, but every guard in the payload sits at family or sector level on
a family term. The glazing guard that keeps «باب زجاج» off a server rack reached no intent at all.
Fixed, and it is the kind of defect that a passing test suite hides because the tests asserted the
guard fired on the family, not on an intent.

**2. Refusing more candidates made the answers worse, twice.** Refusals are not monotone in safety.
The FAMILY_ONLY rule authorised an answer when all surviving candidates sat in one family — so
correctly refusing a wrong candidate *manufactured* consensus. The booklet's only clean-run error,
«خشب لعزل جدران», was abstained on only because a wrong insulation candidate happened to sit at
lexical rank 5 and split the vote. **Safety that depends on a wrong answer showing up is not
safety.** Agreement is now read from the lexical retrieval before the guards cut it down.

**3. Character similarity cannot reach broken plurals. Measured, not argued.** Bigram Dice on the
left, root-consonant skeleton equality on the right:

```
SAME LEXEME (want a match)        DIFFERENT PRODUCT (must not match)
حريق / حرايق    0.571  skel Y     خزان / خزانه    0.857  skel n
لوحه / لوحات    0.571  skel n     ارض  / ارضيات   0.571  skel n
باب  / ابواب    0.400  skel Y     سلك  / سلوك     0.400  skel Y
لوح  / الواح    0.333  skel Y     بلاط / بلوط     0.333  skel Y
حجر  / احجار    0.333  skel Y     قاطع / قطاع     0.000  skel Y
ماسوره / مواسير 0.200  skel n     موتور/ مواتر    0.250  skel Y
```

The distributions do not overlap, they **invert**. The highest score in the table is «خزان» tank
against «خزانة» cabinet. The skeleton reaches every broken plural and also equates «قاطع» circuit
breaker with «قطاع» steel section. No threshold admits the left column and excludes the right,
because the property that makes a broken plural the same word is the property that makes a
derivation a different one. So the templatic tier was **removed** and the gap left named: broken
plurals are the embedding path's job or nobody's.

**4. A single Arabic proclitic decided the booklet's confident-wrong rate.** «لعزل» is «عزل»
wearing a ل. Stripping it is what lets «خشب لعزل جدران» reach an insulation candidate beside the
timber ones, and two trades in the list is what forces the abstention. Without the strip the timber
candidates stand unopposed and the cascade answers joinery. Also: the strip must be a *fallback*
after the plain comparison, because stripping first turns «لوحة» into «وحة» and «فولاذ» into «ولاذ».

## Individual disagreements at the halt

Final run, booklet — one, and it is the only booklet disagreement in either direction:

- «هيكل لألواح الجبس» — adjudicated `interior_systems/drywall_framing`; v10 correct via
  `weak_with_context`; cascade said `gypsum_board`. Evidence «جبس, الواح» is discriminating for the
  board, and the line's head is the *frame* for the boards. A product-head error inside the right
  family. Likely v9-payload-specific — verify against a pinned v10 before acting on it.

Final run, catalogue — three disagreements, one gain and two that need a human:

- «تي بي بي آر» → `pipes_fittings` family (v10: unresolved). Correct, on evidence «تي» alone, which
  is thin. **Right answer for a weak reason; do not read it as strength.**
- «بي في سي تي» → `pipes_fittings` family (v10: unresolved). Same, correct.
- «كبلن فيبر جلاس» → `measuring_instruments` family (v10: unresolved). **Wrong**; it is a pipe
  coupling in fibreglass. Transliterated Latin in Arabic script is where the lexical path invents
  evidence, and this class is not handled.

Four catalogue lines are **over-specified** — right trade, invented depth (`cable_tray` where the
family was the complete answer, twice; `socket_outlet`; `mixer_tap`). Not counted as confident-wrong
but the buyer sees a claim finer than the evidence supports.

## What I could not do, plainly

- **The owner's real 60-line RFQ was never measured.** The `farq` Supabase project is inactive and
  I had read-only scope, so I sampled and adjudicated 60 real lines from `farq-main`'s
  `construction.items` instead. Corpus B is a substitute of my own making, adjudicated by this lane
  and not by the owner. **Every catalogue number above carries that caveat**, and the owner's stated
  31-of-60 unidentified population is the thing that still needs measuring.
- **Never measured against a pinned `cpo-v10`.** See the hazard section.
- **The archive regression arm never ran** (`--archive=1`).
- Embeddings help recall and not discrimination: on the trap cases all three models placed «ألياف
  معدنية» nearer «باب معدني» than mineral wool, on the shared «معدني». The cascade therefore never
  lets a semantic-only candidate decide — a similarity may rank, and may neither decide nor veto.

## The population, for calibration

The owner's framing: booklet 29 of 68 unidentified, RFQ 31 of 60. My booklet run agrees — 38 of 68
reach an intent under v10, so ~30 do not. **The cascade moved zero of those 30 booklet lines into an
intent.** On the catalogue it moved 2–4 lines into families. That is the honest yield: the target
population is real and large, and this design did not reach it. What it reached instead was
transliteration cases and lines whose family was already obvious.

## Exact next step to resume without rediscovery

1. `git switch shadow/hybrid-intent-cascade` in a **separate worktree**, not the shared tree.
2. Pin the baseline: reconstruct `cpo-v10` (base commit + patch) and confirm the harness prints
   `payload cpo-v10` and its fingerprint. Do not compare across payloads.
3. Re-run `npx tsx scripts/cascade-shadow-eval.mts --semantic --archive=0`. Confirm the booklet is
   0 → 0 confident-wrong. If «هيكل لألواح الجبس» persists under a pinned v10, the product-head rule
   must extend to sibling choices inside one family — the frame is not the board.
4. Then, and only then, the open question: whether the four over-specified catalogue lines should
   make `FAMILY_ONLY` the default for any intent chosen on fewer than two discriminating terms.
5. Do not resume the model verifier without a constrained decoder and a forced justification field.
   Unconstrained, it guesses, and the measurement above prices the guessing.

Coverage work is deprioritised behind precision, so none of this is urgent. The findings in
"Four findings" are worth reading even by the precision lane — particularly the inert guards,
which are a precision defect and not a coverage one.
