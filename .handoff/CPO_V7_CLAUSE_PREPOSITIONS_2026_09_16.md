# `cpo-v7` — the clause rule learns the language, not one register

| | |
|---|---|
| base | commit `13ea40a` = `cpo-v6`, payload `1483e668f2d3012f`, resolver `ae4000614c97c025` |
| produces | payload **`1c0a340ec23a58fb`**, resolver **`7f152fb1887572ae`**, version `cpo-v7` |
| patch | `.handoff/cpo-v7-clause-prepositions-and-tier-parity.patch` |
| verify | `node scripts/verify-ontology-provenance.mjs` |
| tests | 273 pass (270 ontology + 3 conformance) |
| not done | no commit, no deploy, no map rebuild |

Five defects were reported. Four of them turned out to be one defect wearing
different clothes: **a rule verified in one register, one language, one node or
one code path, and never checked in the other.** That is worth stating plainly,
because it is now the third round in a row where the mechanism was right and its
coverage was not.

---

## 1. The preposition case closes

«حديد تسليح للخرسانة المسلحة» → `rebar_mesh`. The keyword form still works, and
the bare form still works.

The vocabulary was **derived from the 136 real booklet lines, not guessed**, and
the derivation is the interesting part, because it refused two candidates that
any list either of us wrote would have contained:

| candidate | occurrences | genuinely prepositional | verdict |
|---|---|---|---|
| «لل» prefix | 7 | **7** | adopted |
| «بال» prefix | 2 | 2 | adopted, stem floor ≥ 4 |
| «لال» prefix | 1 | 1 | adopted (لـ+الـ with a hamza-initial noun) |
| «من» standalone | 1 | 1 | adopted, with the collision-free closed class |
| bare «ل» prefix | 12 | 10 | **REFUSED** |
| bare «ب» prefix | 14 | **0** | **REFUSED** |

Bare «ب» matched «بلاستيك», «بورسلان», «بورد», «بيتومين», «بلوك» — not one
preposition in fourteen. Bare «ل» was worse than its 83% suggests: the two
failures were **«لياسة»** and **«لوحات»**, which are the plaster family's own
term and the distribution-board term added in v6. Adopting it would have
suppressed precisely the vocabulary it was meant to protect.

The stem floors are not decoration. «بالته» is a pallet, not بـ+الـ+noun, and
it is a real term in the payload; requiring four letters after «بال» is what
keeps a clause from opening over a product's own name. Likewise «لال» rather
than bare «لا», which would have swallowed «لاصق».

## 2. English irrigation is fixed, and the cause was not language

`Irrigation Sprinkler Head` → `irrigation_systems/irrigation_emitter` at A@0.90.
`Pop-Up Lawn Sprinkler Gear Drive` likewise. Real fire sprinklers are untouched
in both languages.

**The guard already existed, listed `irrigation`, and was tested.** It never
fired because the resolution came from the legacy lexicon, and

```
const hit = bestHit(head, body, entry.terms)   // no guards, ever
```

was the whole of that code path. Every guard in the ontology was silently
conditional on the word being **absent from a dictionary that is overwhelmingly
English**. «رشاش» looked fixed because it is not a lexicon term, so it went
through the ontology and was refused properly.

So this was never the same bug three times in three languages. It was a
language-shaped **symptom** of a code path that skipped the three-tier layer,
and the fix is that the lexicon now resolves its target family's guards and
honours them. Sector-guarding, tier parity and the Arabic promotions were all
still necessary — they just could not be sufficient while this path existed.

Two further consequences, both found by auditing rather than by report:

- **A guard is only as good as its coverage of the nodes carrying the word.**
  `sprinkler` was guarded on the intent while the FAMILY and the CATEGORY
  carried it unguarded. Same for «رخام», where «لاصق رخام» reached a tiling
  supplier. There is now a **structural ratchet**: a term guarded on a node
  while its own ancestor decides it freely fails the test. Six legitimate
  intent→family demotions are listed explicitly, and the list may only shrink.
  It caught one of my own additions within a minute of being written.
- Irrigation needed to be able to **claim** the word, not merely have fire
  refuse it. Guarding alone turned a confident error into an abstention; the
  English side had only the pop-up named where Arabic had three forms.

## 3. The material-phrase class, including the case I had not disclosed

| line | v6 | v7 |
|---|---|---|
| «خزان ألياف زجاجية» | `concrete_fiber` | **`water_tanks`** |
| «ألياف زجاجية للخرسانة» | `concrete_fiber` | `concrete_fiber` |
| «ألياف معدنية للخرسانة» | `acoustic_ceiling_tile` | **`concrete_fiber`** |
| «بلاطة سقف ألياف معدنية» | `acoustic_ceiling_tile` | `acoustic_ceiling_tile` |
| «صوف صخري 50 مم» | `mineral_wool_insulation` | `mineral_wool_insulation` |

Your reading was right and mine was incomplete. The mirror case —
«ألياف معدنية للخرسانة» → a ceiling-tile supplier — was created by my own v6
fix, which bound that phrase to the ceiling trade to fix the other direction.
Bare material phrases are now **weak everywhere**, and the product head decides.

One thing this exposed: **«معدني» is two different materials.** It is METAL in
«سقف معدني» and MINERAL in «صوف معدني» and «ألياف معدنية». My v6 guard blocked
the bare word, so the guard built to catch a roll-formed metal tile fired on the
mineral-fibre tile it was protecting. The blockers now name metals explicitly,
or name the unambiguous compound «سقف معدني».

## 4. The shared-rule defect, and what the supply side must sync

Fixed. An opener is not part of the value it introduces, so a separate-token
keyword contributes its **end** as the value start while a proclitic contributes
its own start. All six exposed terms now decide away from position 0:
`material lift`, `voltage transformer`, `height rescue kit`, `thickness gauge`,
«مادة رابطة», «مادة معالجة». No term in the payload equals a clause keyword, so
nothing regained a right it should not have, and the suppressed-value cases stay
suppressed.

**3 of the 23 conformance cases change**, and one of them is a larger sync item
than the opener fix:

| case | `decides` | `term_index` |
|---|---|---|
| «تيار خفيف» in «كابل تيار خفيف 2x1.5» | false → **true** | 5 → 5 |
| «تيار خفيف» in «أنظمة تيار خفيف» | false → **true** | 6 → 6 |
| «معدن» in «بلاط سقف مستعار ألياف معدنية» | false → **true** | −1 → **22** |

The first two are the opener fix you predicted. **The third is not the clause
rule at all** — it is the new morphology in §5, and it means the shared surface
is now three rules, not one:

1. the opener is not part of its value;
2. prepositions and proclitics open clauses (the derived list, with its floors);
3. **term compilation folds the nisba and the sound plural.**

An independent normalizer that implements 1 and 2 but not 3 will agree on the
clause cases and then drift on every Arabic term with a nisba or «ات» variant.
I have regenerated the fixture on this side; please sync against all three
rather than only the opener, or the 24-of-24 agreement will be misleading.

## 5. Morphology, and the metric

«باب خشب» and «باب خشبي» are one product. So are «كابل جهد متوسط» and
«كابلات الجهد المتوسط» — that one closed a reachable-ceiling shortfall on its
own, with no vocabulary added.

**Appending is the safe direction; shortening is what manufactures matches.**
Stripping the plural «يات» alongside the nisba reduced «ارضيات» to «ارض», and
floor tiling immediately took epoxy flooring off an industrial-coatings
supplier. Only «ي» is ever stripped, with a three-letter floor. «لوحة» →
«لوحات» replaces the taa marbuta rather than appending to it, and a rule for
that would conflate «بلاطة» (a concrete slab) with «بلاط» (floor tiles), so
that plural is named rather than derived.

**The reachable-ceiling metric is adopted** and is what
`scripts/booklet-shortform-eval.mts` now reports. The 68-item adjudication is
recorded in that script so the number is reproducible and auditable — it is a
**measurement**, and nothing in it may be fed back as vocabulary.

## 6. Numbers

### The register the owner uploads — 68 real booklet items, 0 AI calls

| | `cpo-v5` | `cpo-v6` | `cpo-v7` |
|---|---|---|---|
| Level A | 16.18% | 33.82% | **50.00%** (34) |
| true unknown | 14.71% | 0.00% | **0.00%** |
| poolable | 66.18% | 98.53% | **98.53%** (67) |
| **completeness to ceiling** | — | 88.24% | **98.53%** (67) |
| **confident-wrong** | — | **4.41%** (3) | **0.00%** (0) |

The single remaining shortfall is «بلوك اسمني مفرغ»: «اسمني» is a misspelling of
«اسمنتي», the intent exists and is named, and the typo is not encoded.

Two of v6's three booklet errors were **wrong intent inside the right family** —
«هيكل لألواح الجبس» reaching `gypsum_board` instead of `drywall_framing`, and
«نظام التحكم بالأبواب» reaching `turnstile_gate` instead of `access_controller`,
which would have sent an access-control RFQ to a speed-gate manufacturer. That
second one was a v6 data error: the access-control terms landed on the turnstile
intent. Both are the class that hides from a cross-trade sweep.

### 10,219 general-contracting lines — regression

| | `cpo-v6` | `cpo-v7` |
|---|---|---|
| poolable coverage | 99.6% | **99.6%** |
| confident-wrong | 0.04% | **0.04%** (4 of 7,967 A) |
| C rate | 0.11% | **0.11%** |
| A / B / C | 77.95 / 21.94 / 0.11 | **77.96 / 21.93 / 0.11** |
| unique pools | 153 | **154** |

All ten original P0 error families remain fixed. The 4 are the perforated
aluminium acoustic tiles, unchanged and still arguably a roll-former either way.

### Held-out archives — unchanged, which is the point

| | Level A | Level B | Level C | semantic recovery |
|---|---|---|---|---|
| batches 3-10 (81,752) | 81.45% | 15.67% | 2.88% | 4,062 |
| batches 11-20 (102,190) | 77.42% | 22.39% | 0.19% | 5,830 |

Byte-identical to `cpo-v6` on both corpora, and **all 19 adjudicated
confident-wrong cells remain at zero** — the 3,994 rows on 11-20 and the 90 on
3-10 stay closed. The broad changes this round (a guarded lexicon path, two
morphology rules) could easily have disturbed them and did not.

## 7. Reconstructibility — answered rather than asserted

You were right that the recording was broken, and right that it matters. The
answer is now mechanical: `node scripts/verify-ontology-provenance.mjs` rebuilds
each version in a scratch directory and compares **both** hashes.

```
cpo-v5   payload ok             resolver NOT RECONSTRUCTIBLE
cpo-v6   payload ok             resolver ok
cpo-v7   payload ok             resolver ok
working tree: payload 1c0a340ec23a58fb resolver 7f152fb1887572ae -> cpo-v7
```

Two corrections to the picture, one in each direction:

- **`cpo-v5` is not gone.** Reverse-applying the v6 patch against commit
  `13ea40a` reproduces the v5 payload exactly, `97eb29e8e68a6036`, version
  string `cpo-v5`. So the payload half of "26 new, 0 removed" is checkable.
- **But its resolver is not reconstructible, and I am saying so plainly.** One
  of the five resolver hunks in the v6 patch no longer applies, because that
  patch was cut against a *reconstructed* baseline rather than against a commit.
  v5's code cannot be rebuilt byte-for-byte from what is recorded. `cpo-v6` and
  `cpo-v7` are both fully reconstructible, verified above.

The durable fix is that a version is now recorded as a **(base commit, patch,
payload sha, resolver sha)** tuple and verified, and the script fails when the
working tree matches no recorded version — so numbers can never again belong to
a payload/code pair that nobody can rebuild.

## 8. Standing judgments, unchanged

- Guards not relaxed. The abstention behaviour on short lines is intact, and the
  irrigation fix works by giving the right trade positive vocabulary rather than
  by weakening the guard.
- The 52 asymmetric nodes stand. The language audit shows `readymix` and
  `shotcrete` deciding bare in English while «خرسانه» is weak — that is correct,
  not asymmetry: one is an unambiguous compound, the other is the generic word
  for concrete, and English `concrete` is weak too.

## 9. Repo health — second flag, now louder

Every single git command in this session printed:

```
error: non-monotonic index .git/objects/pack/._pack-e6b8bf8e76d5a24aa9a9c0f60f38c99583ef0a99.idx
```

macOS AppleDouble `._*` files are inside `.git/objects/pack/`. There are also
`._`-prefixed copies of tracked source and fixture files throughout the tree,
including `._procurementOntology.test.ts`-class files under `src/lib` and
`fixtures/`. The repo survived this round, but this is a **corruption-shaped
warning in a repository whose only baseline is one snapshot commit** titled
"unreviewed preservation of the full working tree — DO NOT MERGE". Everything
frozen here depends on `13ea40a` remaining readable.

## 10. What I did not do

- **No ELV family.** «كابل تيار خفيف 2x1.5» resolves to `power_cables` at family
  level, poolable, which is honest; there is no low-current intent to reach and
  inventing one was outside this round.
- **No map rebuild**, no commit, no deploy. The gate you described is the right
  order: this round lands, then the 215-of-218 dry run runs once.
