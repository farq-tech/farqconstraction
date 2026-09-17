# cpo-v10 — adjudication: the boundary claim is falsified, and v10 is still releasable

**Date** 2026-09-17
**Payload** `fafa97d20586ca1f` **Resolver** `d6a2d876af6757a6` → verified `cpo-v10`,
reconstructible from base commit `13ea40a5` + `.handoff/cpo-v10-arabic-inflection-class.patch`.
v9 (`f93c05e3a1c151cc` / `f1e4a97a2049b1a1`) reconstructed and loaded alongside v10, so
every comparison below is one resolver against another, not a report against a report.

---

## 1. The boundary claim — REFUTED, and refuted structurally

### 1a. The central example is not a case the gate handles

«معدن» **is not in the vocabulary at all.** No term in the payload contains the bare
word. `derivationAllowed` is therefore *never asked* about «معدن» → «معدني». «معدني» and
«معدنيه» are themselves listed words, owned directly by `metal_grating_walkway`,
`industrial_doors`, `interior_systems` and (for the feminine) `concrete_admixtures` and
`shade_structures`. Same for «أرض», which is also unowned.

So the mineral/metal defect was never a derivation the gate refused. It was a collision
**between listed forms**. The claim "the same gate that correctly refuses «معدن» →
«معدني» also refused «زجاج» → «زجاجي»" describes a symmetry between one real refusal and
one that does not occur.

### 1b. The gate's real scope is 1.2% of the rule

`constrained` is decided per TERM (`words.length > 1`), so the gate only ever fires for
**single-word** terms.

| | count |
|---|---|
| base/suffix pairs where the derived form is owned, so the gate decides | **17** |
| base/suffix pairs waved through because the derived form is unowned | **1,359** |

The gate judges **1.2%** of the derivations the rule performs. It is not a wall around a
dangerous space; it is a fence on a small, evidence-bearing part of the perimeter.

### 1c. A structural signal DOES separate the two cases

Two signals the resolver's morph index currently discards:

- **SECTOR** — a foreign owner of the derived form in the base's own sector is a trade
  neighbour; one in another sector is precisely who a wrong RFQ would reach.
- **POSITION** — if the foreign family uses the derived form as its HEAD or whole term,
  the contest is head-to-head. If it only ever uses it as a *modifier*, that family's own
  term is longer and outscores the bare base, because
  `score = (inHead ? 1000 : 300) - index * 2 + normalized.length * 3`.

Applied together as `derivationAllowed`, over the 17 decisions the gate actually makes:

| line | v10 | sector+position signal |
|---|---|---|
| «زجاجي» alone | C, unresolved | **B, `glazing`** |
| «باب زجاجي سحاب» | B `glazing` | B `glazing` |
| «صوف زجاجي» | A `thermal_insulation/mineral_wool_insulation` | unchanged |
| «ألياف زجاجية» | unresolved | unchanged |
| «ألياف معدنية» | unresolved | unchanged |
| «بلاطة سقف معدني» | A `interior_systems/metal_ceiling` | unchanged |
| «شبكي», «فلتر شبكي», «طابعة شبكية», «جهاز لوحي», «بوابة أمنية» | — | all unchanged |

Measured cost of the signal:

| | result |
|---|---|
| gate decisions changed | **1** — «زجاج» → «زجاجي», the case declared unfixable |
| collisions added (my definition) | **1** — «زجاج» → «صوف زجاجي», **benign at line level** |
| booklet items moved | **0 of 68** |
| archive lines moved | **0 of 26,278** sampled |

So the two cases are **not** separated only by polysemy. They are separated by sector
adjacency and by whether the foreign family owns the form as a head. The lane's
falsification proved that *its own* gate cannot see the difference, which is a fact about
that gate, not about the level of description.

**Honest limit:** the signal is validated on 17 decisions of which exactly one differs.
It fixes the case declared unfixable at zero measured cost, but one differing case is not
proof at scale, and the sector half inherits whatever the sector taxonomy gets wrong.

### 1d. The phrase exemption — right result, wrong reason

Attacked as instructed. The justification is «the head has already pinned the trade».
That is **false by construction in 142 exposures**: multi-word terms whose head word is
owned by three or more families (e.g. «لوح» is owned by seven), where the exemption fires
and the head has pinned nothing.

I then resolved **207 foreign-owned lines** drawn from those exposures. Families that
lost their own term: **2**, and neither is derivation-caused —

- «بوابة أمنية» → `physical_security` instead of `network_security_appliances`: both
  families list that exact term. A duplicate, not a morphology reach.
- «كاميرا حرارية» → `measuring_instruments` instead of `physical_security`: also listed
  directly, and a thermal camera genuinely is both.

So the exemption does not currently misfire. But what protects those 142 exposures is the
**length term in the score**, not the head. That matters because it predicts the wrong
failure mode: the exemption will break when a foreign family adds a term that is *shorter
than or equal to* the exempted phrase, not when the head is generic. The head-position
check in 1c is the guard that actually corresponds to the risk.

---

## 2. The eight collisions — direction holds, count does not

My definition, stated so it can be disagreed with: an ordered pair (term T of family A,
term U of family B), A≠B, T≠U, where T **matches** line U through `termIndex` but T's
tokens are **not** a contiguous run of U's tokens. Morphology manufactured the reach.

> Method note against myself: my first pass excluded any pair where T was a literal
> substring of U and reported v9 = 0. In Arabic that filter is wrong — suffixation means
> the base is always a substring of the form it derives, so it deleted every nisba
> collision. Token containment is the correct filter. Corrected numbers below.

| | count |
|---|---|
| v9 | **78** |
| v10 | **59** |
| removed | **36** |
| added | **17** |
| net | **−19** |
| of removed, **cross-sector** (the ones that misroute an RFQ) | **26** |
| of added, cross-sector | **6** |

**Direction holds under my counting** (−24%), and the removals are concentrated in exactly
the class that costs money. Absolute numbers differ from 67 → 41 because I count ordered
pairs, so several terms reaching the same target count separately — which is why I find 17
additions where the lane finds 8. Its 8 is a term-level count; mine is a reach-level count
of the same phenomenon.

**All glass and mineral-fibre collisions are removed, confirmed on lines and not on the
term list. Zero remain in v10:**

- `glazing:زجاج → thermal_insulation:صوف زجاجي` — removed
- `glazing:زجاج → concrete_admixtures:ألياف زجاجية` — removed
- `glazing:زجاج → water_tanks:خزان ألياف زجاجية` — removed
- `floor_tiling:بلاط → interior_systems:بلاطات سقف معدنية` — removed

**All 17 additions adjudicated at line level: none misresolves.** 14 resolve to the correct
family; 3 are the bare word «بطاقات», which falls back unresolved — safe, and genuinely
ambiguous between `it_peripherals`, `physical_security` and `server_components`.

One thing the removal does not do: «ألياف معدنية» and «ألياف زجاجية» are now
**unresolved** rather than correctly resolved. Mineral wool's Arabic name is not in
`thermal_insulation`'s vocabulary at all, so the correct answer is unreachable. The
collision was closed by making the line fall back, not by teaching the engine the line.
That is the right direction and it is still a vocabulary gap.

---

## 3. Short lines do not move, and that settles the corpus question

| corpus | lines | moved v9 → v10 |
|---|---|---|
| archive lines, full | 183,942 | 0 (byte-identical, confirmed independently) |
| **short** lines in the archive register (1–3 word heads) | 319 distinct | **0** |
| **real booklet short-form items** | 68 | **0** |

The lane's explanation is that archive lines are long enough to decide without morphology
and that morphology is what short lines depend on. The first half is right. The second half
is **unverified**, because on the short lines that actually exist — including the 68 real
Etimad booklet items, which are the register the argument is about — v10 and v9 are
identical.

So v10's benefit is real but **latent**: 36 removed collisions, 26 of them cross-sector,
none of which any corpus we hold currently exercises. Its behavioural claim on short lines
is unmeasured, not confirmed.

This strengthens the position I have held for three rounds: **no corpus we own can
adjudicate a morphology change.** The archives are template-collapsed — 184,010 lines
contain only **2,874 distinct tokens**. Releases that turn on Arabic word formation have to
be judged on fresh real booklets, and the 68-item set is too small to detect anything.

---

## 4. The precision cost — «inert» is measured, but it is not a category truth

By my reconstruction the rule generates **909** sound-plural forms that are not already
vocabulary (the lane's 332 counts source terms; mine counts generated forms).

Against a dictionary built from **184,010 real lines**: **0 of 909** occur. So inertness is
measured rather than assumed.

But the category claim "a string that does not occur cannot match" is not the same as
"none of these is a real word", and **two of them are real Arabic words with different
meanings**:

| generated | from | what it really means |
|---|---|---|
| «درجات» | «درج» (stairs) | **degrees / grades** — «درجات الحرارة» is temperature |
| «حجرات» | «حجر» (stone) | **rooms** — plural of «حجرة» |

Both are ordinary words in Saudi tender prose. Measured behaviour today:

- «درجات» and «حجرات» appear in **0** of 184,010 lines — while «درجة» appears in **3,007**.
  So the singular is everywhere and the plural happens to be absent from this corpus.
- Probe lines «درجات الحرارة», «حجرات النوم», «تكييف حجرات المرضى», «دهان حجرات المكاتب»:
  **none** moved v9 → v10, and none resolved to stairs or stone. The tier system declines
  to let a weak bare term decide.

So no harm exists today. The safety is narrower than claimed: it rests on those plural
forms being absent from this particular corpus and on the tier system refusing a bare weak
term — not on the forms being unmatchable. A booklet writing «درجات الحرارة» plus a word
that gives «درج» context is the shape that would break it.

---

## 5. Three generations in three places

Production port reads **v6**. The release branch carries **v9**. The working tree holds
**v10**, uncommitted.

This does not undermine anything I measured — every number above is a (payload, resolver)
pair I reconstructed and hashed myself, and v10 is reconstructible. What it undermines is
**relevance**. The confident-wrong rate the owner is exposed to is v6's, and v6 predates
the supply-side chokepoint (v8), the computed predicate (v9) and this morphology class
(v10). Four generations of adjudication have been spent on payloads no buyer has met. That
gap is now the largest risk in the engine, larger than anything inside v10.

---

## Verdict

| item | ruling |
|---|---|
| provenance | **verified**, v10 reconstructible, working tree is v10 |
| boundary claim (class-level close impossible for derivation) | **REFUTED** — sector adjacency + head position separates «زجاج»→«زجاجي» from the 16 that must stay refused, with 1 added collision that is benign, and zero movement on booklet or archives |
| the lane's central example | «معدن» is **not in the vocabulary**; the gate is never asked about it |
| gate scope | judges **17** of 1,376 derivations (**1.2%**) |
| phrase exemption | **behaviourally safe** — 0 derivation-caused losses in 207 foreign-owned lines — but its stated reason is false in 142 exposures; the score's length term is what protects them |
| collisions, my counting | **78 → 59**, −36/+17, **26 cross-sector removed**; direction holds |
| glass and mineral fibre | **all four removed, zero remain**, confirmed on lines |
| the additions | **17 under my counting, all benign at line level** (14 correct, 3 safe fallbacks) |
| short lines | **0 of 319** archive-register and **0 of 68** booklet items move; benefit is latent and unmeasured |
| 909 generated plurals | **0 occur** in 184,010 lines; **2 are real words with other meanings** («درجات», «حجرات») — no harm today, safety narrower than claimed |
| **releasable** | **YES** — no regression anywhere, 26 cross-sector collisions removed, booklet unchanged. Release it as a **hygiene** change, not as a short-line accuracy improvement, because that part is unverified. |

**Two things I would not let stand.** First, the impossibility claim should be withdrawn or
narrowed to "this gate cannot see the difference", because a signal exists and costs one
benign collision. Second, «ألياف معدنية» and «ألياف زجاجية» resolve to nothing; the
vocabulary gap that makes the correct answer unreachable should be filled before the next
version claims the mineral-fibre class is closed.
