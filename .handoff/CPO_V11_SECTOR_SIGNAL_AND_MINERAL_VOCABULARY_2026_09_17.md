# cpo-v11 — the sector signal adopted, and three corrections to v10's record

2026-09-17 · demand lane · **frozen, not the landing target** · not committed

Answers [الدفعات 3–10](98295b01-fd62-4aff-9db5-8fc8138529f1)'s v10 adjudication
(`.handoff/CPO_V10_ADJUDICATION_BOUNDARY_FALSIFIED_2026_09_17.md`). Its four items are
taken in order. **Its central refutation is correct and I verified it independently before
acting on it.**

---

## 0. The verdict on v10, restated as asked

**v10 is a structural hygiene change, not a short-line accuracy improvement.** 0 of 319
archive short lines and 0 of 68 booklet items move between v9 and v10. The short-line
benefit the lane claimed for it is real in mechanism and **latent and unverified** in
behaviour. Anyone quoting v10 as an accuracy gain is quoting something that has not been
measured.

And the corpus point, which belongs in every future morphology report:

> **No corpus we own can adjudicate a morphology change.** 184,010 archive lines contain
> only **2,874 distinct tokens**. Byte-identical held-out output across v6 → v11 is
> evidence that **the archives are blind to word formation**, not that word formation is
> safe. The next version will be tempted to quote archive stability as proof. It is not
> proof; it is the absence of a measurement.

This is now recorded in the payload itself (`morphology_rule.measured.corpus_limit`) so it
travels with the artefact rather than living in a report someone has to find.

---

## 1. The central example does not exist — conceded, and worse than reported

**Verified independently.** Bare «معدن» occurs in the payload exactly **once**, as a
`context_terms` entry in `welding_equipment`. Context terms never decide. So the gate is
never asked about «معدن» → «معدني» in any deciding capacity, and the mineral-fibre defect
was a collision **between two separately listed forms** («معدني», «معدنية»), not a
derivation the gate refused.

My v10 proof therefore compared a real refusal against one that does not occur. The
symmetry was invented. I had the evidence in hand — a word-index probe had already told me
«معدن» was not a term word — and built the argument on the fixture probe anyway. That is
the failure worth recording: **the counter-example was available and I did not let it
change the conclusion.**

The claim is narrowed in the payload from a statement about the level of description to a
statement about the artefact:

> ~~No structural rule can see polysemy.~~
> **That gate could not see the difference, because it discarded sector and position.
> Both signals were already in the index.**

### The signal — adopted

| | |
|---|---|
| gate decisions changed | **1 of 17** — «زجاج» → «زجاجي», the case v10 declared unfixable |
| collisions added | **1** — «زجاج» reaching «صوف زجاجي», benign at line level |
| collisions total | v9 **67** → v10 **41** → v11 **42** |
| booklet items moved | **0 of 68** |
| held-out rows moved | **0 of 183,942**, full-file SHA256 equal on both sets |

I reproduced the lane's result exactly: one decision, one benign collision. «صوف زجاجي»
still resolves to `thermal_insulation/mineral_wool_insulation`, «خزان ألياف زجاجية» still
to `water_tanks`, «بلاطة سقف معدني` still to `metal_ceiling`, «شبكي» still refused.

**Adopted, and the reason is the one the lane gave rather than the measurement.** One
differing case is not proof at scale, and I would not adopt a signal on that evidence
alone. What makes it right is that the gate was **judging 17 of 1,376 derivations and
waving 1,359 through with no evidence at all.** A gate with 1.2% coverage is not a wall;
it is a fence on the one stretch of perimeter where evidence happens to exist. Improving
the 17 cannot cost what the other 1,359 already give away. The asymmetry between what the
gate inspects and what it permits is what makes the signal close to free — not the single
measured case.

What the two signals are, and why each is the right shape:

- **SECTOR.** A foreign owner inside the base's own sector is a **trade neighbour**.
  `glazing` and `thermal_insulation` are both `BUILDING_ENVELOPE`, so «صوف زجاجي» carrying
  «زجاجي» costs nothing like `rebar_mesh` losing «شبكي» to `DATACENTER_ICT` — which is
  exactly who a wrong RFQ reaches. It also splits the two cases the owner has been bitten
  by: «زجاجي» stays inside `BUILDING_ENVELOPE` and is allowed; «زجاجية» crosses into
  `MEP_WATER` and `CIVIL_CONCRETE` and stays refused. **One signal, both answers.**
- **POSITION.** If the foreign family uses the form as its **head**, the contest is
  head-to-head. If it only ever uses it as a **modifier**, that family's term is strictly
  longer and outscores the bare base anyway, so there was never a contest to lose.
- **UNKNOWN BASE.** Still refused, and now for a stateable reason rather than caution: the
  sector test asks who the base's trade neighbours *are*, and a word the payload does not
  carry has no trade to be adjacent to. This is what keeps «أرض» out of «أرضيات» and
  «معدن» out of «معدنية», so both of the owner's original defects hold by rule.

**What would make one measured case enough, since the lane asked and the answer outlives
this version:** a corpus with enough distinct Arabic tokens to exercise derivation at all.
2,874 tokens cannot. Until then the honest basis for adopting a morphology signal is the
argument about what the gate inspects versus what it permits — not a stability number.

**Inherited risk, named:** the sector half is only as good as the sector taxonomy. Thirteen
sectors carry it, and a family filed in the wrong sector silently becomes a trade
neighbour of the wrong trades. That is a new dependency of the morphology rule on a
taxonomy that was built for a different purpose.

---

## 2. The phrase exemption — reason corrected, protection made a checked condition

**Conceded.** "The head has already pinned the trade" is false by construction in 142
multi-word terms whose head is owned by three or more families, «لوح» by seven. I verified
the mechanism the lane names: in `bestHit`,

```
score = (inHead ? 1000 : 300) - index * 2 + normalized.length * 3
```

and `normalized` is `normalizeTerm(term)` — the **term**, not the line. So on «باب زجاجي»
the phrase «باب زجاج» (9 characters) outscores a bare foreign «باب» (4). Length is what
protects those 142, not the head.

The lane is right that this matters beyond wording. **A wrong stated mechanism predicts the
wrong failure mode**, so a monitor watches the wrong quantity while the thing fails. The
recorded reason now says the failure mode is *a foreign family adding a term at least as
long as the exempted phrase*.

Three things done rather than one:

1. **Reason corrected** in the resolver comment and in
   `morphology_rule.derivation.phrase_exemption_corrected_reason`.
2. **The one case length cannot rescue is now refused explicitly.** A foreign family owning
   the derived form **as a head** gets the 700-point head bonus, which swamps any length
   difference. `foreignHeadOwner()` refuses that configuration instead of leaving it to
   arithmetic.
3. **The length relationship is asserted, not assumed.** A test walks every *contested*
   derivation of every multi-word term and fails if the inflected line resolves to a
   family that does not own the term. A guarantee resting on a scoring constant is the
   same shape as the ratchet that turned out to be a comment, so it is now checked.

**I did not remove the exemption, and the reason is measured.** Gating every word uniformly
— the apparently principled "one rule" answer — loses **133 of 8,064** multi-word inflected
variants, and some are ordinary Arabic: «كمرة حديدية», «درابزين زجاجي». The exemption earns
its place; what it lacked was a stated condition.

One methodological note against myself. The first version of the invariant test reported
**5 failures**, and all five were artefacts of my own variant generator producing
non-Arabic strings — «فحصي», «برايمري». They failed for an unrelated reason: the
conjunction proclitic «ف» made «فحصي» parse as «ف» + «حصي» (gravel), so the test was
exercising the proclitic rule by accident. Narrowing it to **contested** derivations — the
only ones with a competitor to lose to — removed the noise and kept the invariant. A test
that reports false failures gets disbelieved, which is the same lesson the fixture emitter
taught this week.

---

## 3. The vocabulary gap — filled, and it is the language-asymmetry class for the fourth time

**Conceded, and it is worse than the lane found.** It reported «ألياف معدنية» and «ألياف
زجاجية» resolving to nothing. Checking the neighbourhood, **«صوف معدني» — mineral wool, the
direct Arabic translation of the intent's own name — resolved to nothing either.** The
intent is called `mineral_wool_insulation` and carried five English spellings:

| | |
|---|---|
| English present | `mineral wool`, `stone wool`, `rockwool`, `glasswool`, `glass wool` |
| Arabic present | «صوف صخري» (rock wool), «صوف زجاجي» (glass wool) |
| Arabic **absent** | **«صوف معدني»** — the name of the product |

So this is not a new gap. It is the **fourth appearance of the class the owner has named
three times** — «باب خشب / خشبي», «اسمني / اسمنتي», «امبير» absent while `a` was present —
and this time it is in **vocabulary rather than morphology**, which is why the morphology
work did not catch it. A concept whose authority depends on the language of the buyer, in a
system whose buyers write Arabic.

Fixed, with the tier chosen to match how ambiguous each phrase actually is:

| line | v10 | v11 |
|---|---|---|
| «صوف معدني» | **nothing** | `thermal_insulation/mineral_wool_insulation` A@0.90 |
| «عزل صوف معدني» | nothing | `mineral_wool_insulation` A@0.90 |
| «عزل ألياف معدنية» | nothing | `thermal_insulation` B@0.82 |
| «عزل ألياف زجاجية» | nothing | `thermal_insulation` B@0.82 |
| «ألياف معدنية» bare | nothing | **still abstains — by decision** |
| «ألياف زجاجية» bare | nothing | **still abstains — by decision** |
| «خزان ألياف زجاجية» | `water_tanks` | `water_tanks` (unchanged) |
| «بلاط سقف مستعار ألياف معدنية» | `acoustic_ceiling_tile` | unchanged |
| «سقف مستعار صوف صخري» | `acoustic_ceiling_tile` | unchanged |

«صوف معدني» is a **strong term**, because mineral wool is one product and not a material
serving three trades. The bare material phrases are **context terms**, because «ألياف
معدنية» genuinely serves insulation, acoustic ceilings and concrete admixtures — so
abstaining is the **correct answer** rather than a missing one. The difference v11 makes is
that the abstention is now **deliberate**: the vocabulary exists, three trades own it, and
nothing decides. Before, it abstained because the engine had never heard of the material.
Those look identical in a coverage report and are not the same fact.

**The lane's warning, adopted:** a future version must not report this class as closed
while the term keys nothing. Tests now assert both halves — that «صوف معدني» resolves, and
that the bare materials abstain.

---

## 4. The two homographs — excluded explicitly

**Excluded.** «درجات» (degrees, generated from «درج»/stairs) and «حجرات» (rooms, from
«حجر»/stone) are declared in `morphology_rule.generated_form_exclusions` with what they
actually mean, and the resolver reads that list rather than carrying a copy.

The lane's framing of the cost is the accurate one and I am adopting it over my own:
inertness was **measured** (0 of 909 generated forms occur in 184,010 lines), but the
safety rested on **absence from one corpus** plus the tier system declining to let a bare
weak term decide — not on the forms being unmatchable. Given the corpus limit in §0, an
absence measured on 2,874 distinct tokens is close to no evidence at all. A finite list of
909 can afford to name its two known hazards.

Why exclusion rather than a rule: the gate compares **ownership and sector**, and a
homograph of an unrelated lexeme is indistinguishable from ordinary vocabulary at that
level. This is the same answer broken plurals got, for the same reason — **a fact about the
words, not a relation the ontology encodes.** Note that this is consistent with the
*narrowed* claim in §1 and would have been inconsistent with the sweeping one: the gate
cannot see polysemy, which is why polysemous forms are listed rather than derived.

Base words still work: «درج خشبي», «حجر طبيعي», «ألواح حجر» all match.

---

## Verification

| | |
|---|---|
| tests | **472 passed** (up from 463; 9 new) |
| provenance | **passes** — v11 rebuilds from base `13ea40a5` + one patch, payload and resolver both |
| held-out b3–10 | **byte-identical to v10**, full-file SHA256 `58e6be7dbf…` |
| held-out b11–20 | **byte-identical to v10**, full-file SHA256 `6b36a5f38f…` |
| booklet, 68 items | A 55.88% · completeness **100%** · actionable **67/68** · correct abstentions **1** · **confident-wrong 0.00%** |
| collisions | 42 (v10: 41) — the one added is benign at line level |

Byte-stability now spans **v6 → v11**, which per §0 measures the archives' blindness rather
than v11's safety.

Patch: `.handoff/cpo-v11-sector-signal-and-mineral-vocabulary.patch`
(base `13ea40a5fe6ba1055c2da3fb90dff16336424cf1`, payload `dfb34f19c807563f`, resolver
`a3e96860aa9aedb6`).

---

## v11 holds until production lands v10

**Recommendation: do not move the landing target.** Land v10 as planned; hold v11.

The reasons are about sequencing, not about v11's quality:

1. **v11 changes the payload, so it forces another supplier-map rebuild.** v10's map is
   being built now. Retargeting means paying that cost twice and landing production on an
   artefact set that has had less adjudication, not more.
2. **v11's gains are unmeasurable on anything we own.** Zero booklet movement, zero
   held-out movement, one gate decision. There is no number that argues for urgency,
   and per §0 there cannot be one until a fresh booklet arrives.
3. **v6 → v10 is already the largest behavioural jump this engine has taken.** Adding v11's
   gate relaxation to that arrival makes attribution harder if anything goes wrong — and
   after it lands, whatever happens will be attributed to something else.
4. **The vocabulary fix in §3 is the one item with a real user behind it.** «صوف معدني» is
   a line an owner could type tomorrow. If that is judged urgent, it is separable: it is
   three vocabulary entries and no resolver change, and it could be cherry-picked onto the
   v10 payload as `cpo-v10.1` without the gate change. **I do not recommend this** —
   splitting a frozen payload is how version strings start meaning two things — but it is
   the only part of v11 with a claim to not waiting.

**The indivisible unit is unchanged from the v10 recommendation:** payload, resolver,
vendored conformance fixture, and the production port move together, or a v6 resolver reads
a v10 payload and silently produces v6 behaviour while reporting `cpo-v10`. v11 does not
change that shape; it adds one more generation that must never be half-landed.

**What would change this recommendation:** a fresh booklet measuring a case the sector
signal fixes, or a decision that «صوف معدني» is urgent enough to justify a payload
cherry-pick.

---

## For the sibling lanes

**[المرحلة 2 للمحرك](c2299a00-424d-45dd-8e45-25a61c5ef15e) — port:**

- **Do not port v11 yet.** Build the map against **v10**, as planned.
- The resolver reads `morphology_rule.generated_form_exclusions` from the payload, so when
  v11 does land the exclusions arrive as **data**, not as a second hand-copy. That is the
  derived-rather-than-mirrored direction continuing.
- v11 adds two things the port must read rather than reimplement when it comes: the
  **sector** of each family and whether a family owns a word **at position 0**. Both are
  computable from the payload alone — no new fields — but a port that hand-codes the gate
  will drift on exactly the 17 decisions it governs.
- The conformance fixture is regenerated under `cpo-v11`. **Expect one flip**:
  «صوف زجاجي» × «زجاج» goes `false` → `true`. Everything else holds.
- The emitter fix earned itself this round: when the v11 resolver met the v10 fixture it
  reported **"a GENERATION GAP, not a behaviour divergence"** rather than a false
  divergence. That is the detector working as a detector on its first real use.

**[الإيداع والنشر](ce400eff-e0de-42e1-b290-e204b259d52d) — landing:** target stays
**v10**. v11 is frozen and provenance-verified so it is ready when wanted, and it is
explicitly marked *not the landing target* in `verify-ontology-provenance.mjs` so nobody
reads "newest" as "next".
