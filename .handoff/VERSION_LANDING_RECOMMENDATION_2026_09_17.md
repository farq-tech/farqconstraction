# Which generation production should land on, and what the indivisible unit is

**Date** 2026-09-17 · **Recommendation** `cpo-v10`, conditional · **Not committed**

---

## 1. The emitter fix

`attributeRuleConformance.test.ts` was emitting

```ts
ontology_version: normalizeProcurementText('') === '' ? undefined : undefined,
```

— a placeholder that resolves to `undefined` on both branches, so the key was
dropped from the JSON entirely. It now stamps `ONTOLOGY_VERSION`, and three
things were added around it rather than just the one line:

1. **A `reader_contract` field in the fixture**, stating that the version is to
   be compared *first* and that a mismatch there means resync rather than
   investigate. The consumer needs to know which reaction is called for, and a
   field they read is a better place to say it than a handoff note they may not
   have.
2. **The version is asserted before the cases**, with a message that names the
   failure as a generation gap: *"fixture was recorded under cpo-v9 and the
   resolver is cpo-v10 — a GENERATION GAP, not a behaviour divergence."* I
   verified this by stamping a stale version and reading the failure.
3. **A test that the stamp exists and is well-formed**, because an unstamped
   fixture reads as current to whoever consumes it — which is precisely how a
   version gap gets reported as a divergence.

Version and behaviour are now separately detectable: the version catches a
generation gap, and `cases` equality catches a real behavioural move even when
the versions agree. Those were indistinguishable before.

Payload and resolver are untouched, so this stays `cpo-v10` — hashes
`fafa97d20586ca1f` / `d6a2d876af6757a6` unchanged, provenance passing, 463
tests green. The patch is regenerated to include it.

**The retirement record is worth keeping** as the lane suggested: the
hand-copied rule was in exact sync at retirement — 41 keys, zero drift — which
is the fixture having worked as designed, and it is the evidence that
derived-rather-than-mirrored is the right direction.

---

## 2. Recommendation: land `cpo-v10`

### The measurement that decides it

I reconstructed v6 (it *is* base commit `13ea40a5`) and ran it against v10 on
everything we have.

| | v6 → v10 |
|---|---|
| held-out b3–10, 81,752 rows | **byte-identical** (`58e6be7dbffa7579`) |
| held-out b11–20, 102,190 rows | **byte-identical** (`6b36a5f38fed9008`) |
| intents | 218 → 218, **zero added, zero removed** |
| families / categories | 102 → 102, 15 → 15 |
| booklet, 68 real items | **18 of 68 moved** |

On the booklet — the register the owner actually uploads — every one of the 18
moves is in the right direction:

| | count |
|---|---|
| confident errors **fixed** | **4** |
| confident errors **introduced** | **0** |
| answers **gained** | **14** |
| answers **lost** | **0** |

The four errors fixed: «قواطع زجاج سيكوريت» leaving `interior_systems` for
`glazing/tempered_glass`; «هيكل لألواح الجبس» moving from `gypsum_board` to
`drywall_framing`; «خرسانة أرضيات» leaving `floor_tiling` for
`ready_mix_concrete`; «نظام التحكم بالأبواب» leaving `turnstile_gate` for
`access_controller`. The fourteen gains are mostly family → specific intent:
«قاطع 32 امبير» → `mcb`, «قاطع 100 امبير» → `mccb`, «لوحات توزيع» →
`distribution_board`, «بلوك اسمني مفرغ» → `concrete_block`, «كابلات الجهد
المتوسط» → `mv_power_cable`.

So the jump is **strictly monotone on measured data**. There is no line where
v6 was right and v10 is wrong.

### Why v10 rather than v9

Because on everything measurable, **v10 is v9**:

- The two payloads are **identical apart from the version string and the
  `morphology_rule` documentation block** — I diffed them with both removed.
  Same 3,529 strong terms, 667 weak, 1,366 context, 31 guards, same clause
  rules.
- **0 of 68 booklet lines differ** between v9 and v10.
- Both held-out corpora are byte-identical between them.

v10 is therefore a pure resolver change with no measurable output difference
from v9, plus the removal of 34 latent cross-family collisions including the
glass/mineral-fibre one that has bitten three times. Landing v9 means
deliberately shipping a known defect class — «لوحة» never matching «لوحات», the
most common plural in the language — for no measured safety gain, and then
paying for a second five-artefact migration shortly after. Each migration is
where the coordination errors happen. Pay once.

Landing v9 would also put production one generation behind the drift detector
the moment it lands, since the fixture now stamps v10.

### The risk v10 carries that v9 does not — stated, because it is real

The two halves of the morphology change fail in opposite directions:

- **The derivation gate is fail-closed.** It *suppresses* a derived form, so it
  errs toward abstention, which falls back rather than hijacks. This direction
  is safe by construction.
- **The plural rule is fail-open.** It *widens* what a term matches: 332 terms
  gained a plural form. On text we have not measured, a term can now match
  where it previously could not.

That widening is bounded — the collision audit puts the cross-family cost at 8,
and I checked every one at line level, where the head concept resolves all of
them correctly («هاردنر أرضيات» → `industrial_flooring_coating`, «شاحن
بطاريات» → `power_tools`). But the bound is measured against **the ontology's
own vocabulary**, not against arbitrary booklet prose. A booklet word that
happens to look like the plural of a term is the unmeasured case, and it does
not exist in v9.

I judge that acceptable because the risk it removes is of the same kind and
larger: 34 collisions, three of them the mineral-fibre case, all in the
direction of confident-wrong rather than abstention. But that is a judgement
about unmeasured risk on both sides, not a measurement.

### What would change my answer

**Any line where the v10 adjudication finds a difference from v9.** I measure
zero differences across 183,942 archive rows and 68 booklet items, so if the
adjudication finds one, my corpora are blind to something it can see — and at
that point v9, which is adjudicated and already committed, becomes the right
landing and v10 waits for its own round. Specifically I would change my
recommendation on:

- any confident-wrong introduced by the plural widening;
- any line where the derivation gate suppresses a term the trade genuinely owns
  (this is the class that cost «باب زجاجي سحاب» its family mid-round, and the
  phrase exemption is the fix — a second instance would mean the exemption is
  too narrow);
- movement in either held-out corpus, since three generations of byte-stability
  means a move is real behaviour.

---

## 3. The indivisible unit

### For [الإيداع والنشر] — what lands in one commit

**Four files, one atomic set, no partial landing:**

```
src/lib/procurementOntology.data.json      the payload
src/lib/procurementOntology.ts             the resolver
fixtures/ontology/attribute-rule-conformance.json   the vendored fixture
<the API-side port implementation>         the reader
```

This is not a tidiness preference. v9 moved the clause rule into the payload and
v10 moved morphology, so **the resolver now reads rules it used to carry**. I
measured both half-landings:

**Resolver ahead of payload** (v10 resolver, v6 payload) — **throws**:
`Cannot read properties of undefined (reading 'attribute_clause_keys')`. Loud,
and therefore the safe direction. It reports the version as `cpo-v6`, because
the version comes from the payload.

**Payload ahead of resolver** (v10 payload, v6 resolver) — **silent, and this is
the one to design against**:

- It reports `cpo-v10`. **The stamp lies.**
- It runs v6 morphology: «لوحة» does not match «لوحات» (`termIndex` = −1), and
  «ارض» matches «أرضيات» (`termIndex` = 0). Both v10 defects are live under a
  v10 label.
- It does not crash, because the payload's *vocabulary* is readable by an old
  resolver even when its *rules* are ignored. So you get the v7–v10 vocabulary
  gains — «قاطع 32 امبير» still reaches `mcb` — and none of the rule fixes.

That last state is the one that produces a confident-wrong number and attributes
it to the wrong generation, which is exactly the outcome to avoid before a
measurement lands. Note the fixture *does* catch it: versions agree while
behaviour differs, so it reports a genuine divergence. That is the detector
earning its keep, and it is the argument for vendoring the fixture with the
payload as the lane already chose to do.

### For [المرحلة 2 للمحرك] — what the map rebuild depends on

**The intent ID surface does not change: 218 intents v6 → v10, zero added, zero
removed, 102 families, 15 categories.** So the rebuild is **not** needed for key
coverage — no intent will resolve to zero suppliers because its key is missing,
which was the v5 → v6 situation and is not this one.

The rebuild is needed for **content**, because what changed is how supplier text
matches:

- **v9** gave supplier prose its own register. That is the change that stopped
  qualified suppliers scoring zero on a preposition, so map rows built before it
  carry that defect.
- **v10** changed Arabic term compilation, which affects archetype and term
  matching on supplier text as well as on lines.

So: **build the map against the exact generation that will deploy.** If the map
is built at v10 and the payload deploys at v9, supplier sets were computed under
different matching than the lines resolving against them — and because the IDs
agree, nothing will fail loudly. That is the same shape of defect as the
unstamped fixture: two generations that look compatible because their keys line
up.

The map may be built ahead of the deploy, since the keys are stable. It must not
be **swapped in** ahead of the resolver.

### The one-line version

> Payload, resolver, port, vendored fixture and map are one artefact wearing five
> filenames. The IDs agreeing across generations is what makes a partial landing
> look survivable, and it is why it isn't.

---

## 4. What could degrade on data we have not measured

Named now, so it is not attributed to something else later.

1. **The plural widening**, as above: 332 terms gained forms, bounded at 8
   cross-family collisions against known vocabulary, unbounded against unseen
   prose. This is the only v10-specific exposure.
2. **The guards arriving together.** v6 → v10 adds 10 term guards (21 → 31) over
   8 more nodes. Guards are fail-closed and the ablation in the v5 round showed
   they abstain rather than misfire on short lines, so the expected failure is a
   line that *stops* resolving rather than one that resolves wrongly. On the
   booklet that cost nothing — 0 answers lost — but the booklet is 68 lines.
3. **The clause rule's provisional openers.** «لال» rests on one observation and
   «بال» on two, and they are marked provisional in the payload pending ~1,000
   booklet lines. They err toward suppression, so the expected failure is again
   abstention. If the owner's next booklets show lines losing a family with no
   obvious cause, these are the first thing to check.
4. **What no corpus we hold can see.** v6 and v10 produce byte-identical output
   on all 183,942 archive rows. Those corpora **cannot distinguish four
   generations of this work**, so "zero measured regression" there is not
   evidence of safety — it is evidence that the archives are the wrong
   instrument for this jump. The 68-item booklet is the only instrument that
   sees it, and 68 lines is a thin basis for a four-generation jump. The honest
   statement to the owner is that the landing is well-evidenced on the register
   he uploads and unevidenced elsewhere, because elsewhere is blind rather than
   clean.

---

## Housekeeping

I made no commits and no stashes. I used `/tmp` worktrees built from
`git archive` plus the published patches, so the shared working directory was
never moved off its branch and nothing was stashed in it. The reconstruction
recipe for any generation is in `scripts/verify-ontology-provenance.mjs`; v6
needs no patch because it is the base commit.

**One premise has changed under us, and it affects the landing plan.** The brief
said v10 is "committed nowhere". During this session another lane committed
`cda1465 wip: preservation snapshot of the ontology lane and today's reports`
onto `wip/ontology-cpo-v10-and-reports-2026-09-17`, and that snapshot contains
the v10 payload and the v10-stamped fixture. So the count is now:

| generation | where it lives |
|---|---|
| `cpo-v6` | production port |
| `cpo-v9` | standalone release branch |
| `cpo-v10` | `wip/ontology-cpo-v10-and-reports-2026-09-17` (this repo) |

That is still three generations in three places, which does not change the
recommendation — but it does mean the preservation snapshot is **not** a release
candidate and should not be mistaken for one: it was taken mid-session and
captured the fixture before the emitter fix was regenerated. Whoever lands this
should take the payload and resolver at `fafa97d20586ca1f` /
`d6a2d876af6757a6` and regenerate the fixture rather than lifting the snapshot's
copy, or simply apply `.handoff/cpo-v10-arabic-inflection-class.patch` to
`13ea40a5`, which the provenance script verifies reproduces both hashes exactly.

Given three lanes in one working directory, the caution about branches over
stashes generalises: a preservation commit made while another agent is mid-edit
captures a tree that no one has asserted is coherent. The provenance script is
the check that distinguishes a snapshot from a release, and it passes for v10.
