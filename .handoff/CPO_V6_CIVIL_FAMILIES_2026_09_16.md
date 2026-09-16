# cpo-v6 — civil/architectural families + the head-concept rule

**Status:** frozen, uncommitted. Patch reproduces the payload exactly.
**Do not rebuild `intent_supplier_map` until this lands** — see *Map* below.

| | |
|---|---|
| patch | `.handoff/cpo-v6-civil-families-and-head-concept.patch` |
| applies to | the `cpo-v5` baseline, sha16 `97eb29e8e68a6036` |
| produces | payload sha16 `1483e668f2d3012f`, version `cpo-v6` |
| verified | reconstructed v5 from its own patch, applied this one, hash matched |
| tests | 237 pass (191 inherited + 46 new), no ratchet relaxed |
| ids | 26 added, **0 removed** — every cpo-v5 id survives |
| families / intents | 97 → 102 · 197 → 218 · archetypes 61 → 63 |

The patch is a v5→v6 delta, not an amendment of v5, because v5 is now a measured
baseline. Nothing in this repo is committed, so the delta was produced by
reconstructing v5 from `.handoff/cpo-v5-ontology-accuracy.patch` and diffing
against the working tree.

---

## 1. The one mechanism that mattered

The held-out report named seven symptoms on batches 11-20 and judged them one
defect. That judgement was right, and the mechanism is visible in the corpus:

**a Saudi BOQ line names the product first, then lists its attributes, each one
introduced by an explicit keyword.**

```
توريد وصلة PP-RCT Tee Equal مقاس 50 مم PN20  ربط Solvent Cement
                                              ^^^^ joining method
توريد VCD Opposed Blade مقاس 600×400 مم      مادة Aluminium
                                              ^^^^ material
توريد Backflow Preventer DN80 PN16 جسم SS316 توصيل Lug
                                              ^^^^^ connection type
```

Every word after such a keyword *describes* the product. Matching it as though
it *named* the product is how `solvent` sent 1,984 pipe fittings to lubricants
and `lug` sent 64 backflow preventers to cable terminations. The perverse
consequence the report identified — that a more detailed line resolved worse —
follows directly: each added attribute was another chance for a stray word to
win.

`bestHit` now computes the line's attribute clauses and **a term may decide only
if its match starts outside every one of them.** The rule is positional rather
than a keyword blacklist, and that distinction is what keeps «مقياس ضغط» working:
the term starts at «مقياس», before the «ضغط» clause opens, so a real product
name that happens to contain an attribute word is untouched while a bare «ضغط»
appearing only as a value is refused.

Two boundaries are deliberate and tested:

- **Context still reads the whole line.** «مادة Aluminium» must not name a
  product, yet it is exactly the evidence that a weak «قطاع» is a façade
  profile. The rule restricts deciding, never corroborating.
- **Losing the right to decide does not cost the recovery signal.** A term
  buried in a clause still proves the line speaks known vocabulary, so it stays
  in Level B semantic recovery instead of falling to a false unknown. This now
  covers the strong tier too, which the guard fallback previously missed.

## 2. The conduit 90 — and why the earlier "fixed" was wrong

**They are zero.** They were never conduit.

The 90 rows are «توريد ماسورة HDPE Corrugated قطر N مم SN8 وصلة Socket Rubber
Ring». A corrugated wall plus an **SN ring-stiffness class** is a buried
gravity-drainage designation — a rating no pressure plumbing pipe carries. They
sat in `pipes_fittings` because «ماسوره» is that family's strong term and
nothing else competed. They now resolve to
`precast_drainage/buried_drainage_pipe`, whose supplier is a drainage pipe
extruder rather than a plumbing fittings distributor.

The reason my previous "fixed" claim was empty is worth recording, because it is
a measurement error rather than an ontology one: **the held-out report had this
cell in its four *sensitivity* cells, not its seven adjudicated ones, and my
re-measurement was scoped to the seven.** It returned 0/0 truthfully for what it
covered and silently omitted this. Re-measurements should be scoped to the union
of a report's cells, not to the subset it committed to.

## 3. The material-word class on 11-20

Measured on the final payload, `1483e668f2d3012f`, zero AI calls.

| cell | rows | cpo-v5 wrong | cpo-v6 wrong |
|---|---|---|---|
| «ربط Solvent Cement» joining method | 6,996 | 1,984 | **0** |
| `Floor-to-Floor` location | 729 | 729 | **0** |
| `Ceiling Joint` location | 720 | 720 | **0** |
| `Wall-to-Wall` + «مادة Aluminium» | 722 | 241 | **0** |
| «توصيل Lug» connection type | 1,024 | 64 | **0** |
| `Vinyl Sheet` shape word | 208 | 166 | **0** |
| «مادة Aluminium» on a damper | 270 | 90 | **0** |
| **confident-wrong of adjudicated poolable** | 11,164 | **41.85%** | **0.00%** |

Stopping the stray word was only half of it. The other half is that **1,449
covers became floor tiling on the word `floor` because the ontology had no
expansion joint cover** — a location named the product only because the product
was unknown. `movement_joint_systems` closes that, and it is its own family
rather than an intent under `floor_tiling` because a ceiling joint cover is not
flooring.

### 3-10 did not regress

| cell | rows | cpo-v5 | cpo-v6 |
|---|---|---|---|
| HDPE Corrugated SN (the 90) | 90 | 90 | **0** |
| EMT / IMC / PVC conduit | 180 | 0 | 0 |
| Cable Ladder Elbow | 1,008 | 0 | 0 |
| fire sprinkler «رشاش» | 812 | 0 | 0 |
| irrigation pop-up sprinkler | 210 | 0 | 0 |
| electrical enclosure | 7,824 | 0 | 0 |
| metal ceiling tile, Arabic «معدني» | 500 | 0 | 0 |
| **confident-wrong** | 11,770 | 0.83% | **0.00%** |

One cell in my previous adjudication was **my error, not the resolver's**: I had
asserted `fasteners` for anything matching `...nut`, which made an `EMT Locknut`
(a conduit accessory) and a `UPVC Locknut` (a pipe fitting) count as wrong. Both
are correct. The cell is now split by what the line actually names.

A v5→v6 diff of every row in both corpora shows **27 distinct family/intent
moves and not one in the wrong direction**, including `Vacuum Breaker` leaving
`switchgear_panels` on the word `breaker` for `valves`.

## 4. `acoustic_ceiling_tile` now generalises — and the guard bit back

The previous fix keyed on the Arabic «معدني» and died when a batch wrote
`Galvanized Steel`. The durable discriminator is the **material, in whatever
language it arrives**, so the mineral-fibre intent declines any tile whose
material is named as a metal and the metal intent claims it on material context
instead of on a spelling. 991 `Galvanized Steel` tiles on batches 11-20 moved
from `acoustic_ceiling_tile` to `metal_ceiling`.

Then the fix committed the very defect it was written to stop. **«ألياف معدنية»
is *mineral* fibre**, and reading «معدنية» as metal sent 4 real mineral-fibre
tiles to the roll-former. Naming the material explicitly on the acoustic side
settles it by specificity rather than by another layer of blocking.

This is worth the owner's attention as a method point: it was invisible to the
cross-trade sweep, because family and department were both right, and it was
caught only by the intent-level audit against the catalogue's own category
names. That audit is the only instrument that sees this class.

**4 lines remain flagged and I judge them correct.** «بلاطة سقف ألمنيوم مثقب» —
perforated aluminium tile — is acoustically rated, but the trade is a metal
ceiling roll-former either way. The catalogue's category name says acoustic; that
is a taxonomy difference, not a trade error. Flagging rather than tuning the
audit, since the audit's ground truth should stay the catalogue's.

## 5. The new civil and architectural families

Sourced from the trade register, and checked against the supply side first. The
owner's observation that `ready_mix_supplier` already existed proved to be the
general pattern: **six of the eight gaps needed no new archetype.**

| gap | resolution | archetype |
|---|---|---|
| ready-mix concrete + grades | **new family** `ready_mix_concrete`, 3 intents | `ready_mix_supplier` — already existed |
| plaster and rendering | **new family** `plaster_render`, 3 intents | `cement_supplier` — already carried «بلاستر», «مونه» |
| aggregate and mortar | **new family** `aggregates_fill`, 2 intents | **`aggregate_supplier` — new**, a quarry trade absent on both sides |
| canopies and shades | **new family** `shade_structures`, 4 intents | **`shade_structure_supplier` — new** |
| gypsum board and partitions | new intent `interior_systems/gypsum_board` | existing |
| handrails and balustrades | new intent `metal_grating_walkway/handrail_balustrade` | existing |
| manholes and covers | already existed; added the plural and the «مانهول» transliteration | existing |
| ventilation outlets and grilles | already existed; added `ventilation_opening` + `volume_control_damper` | existing |

**Grade is a facet, not an intent**, and there is a test for it: a batching plant
that mixes C25 mixes C40, so splitting per grade would fragment one supplier pool
into twenty.

### On not letting booklet wording leak

The constraint shaped what I refused as much as what I added. Two examples:

- «بلوك اسمني مفرغ» carries a misspelling of «اسمنتي». I added «مفرغ» (hollow),
  a real trade word, and not the misspelling.
- «خشب لعزل جدران» is the one booklet item that still keys no pool. It is
  idiosyncratic phrasing and I left it alone.

Where the booklet did reveal a real gap, it was almost always a **mechanism**
rather than a phrase, and those are the additions I trust to generalise:

- **Arabic plurals.** «لوحه توزيع» was strong and «لوحات توزيع» was simply
  absent, so a distribution board written in the plural reached Level C. Same
  class as «رشاش»/«رشاشات» last round.
- **Arabic unit words.** The switchgear context list carried `a` and `ka` but
  not «امبير», so «قاطع 32 امبير» — a circuit breaker written the way Saudi
  buyers write it — could not corroborate its own weak term. This is the tier
  asymmetry defect in a new place.
- **Structural element names as concrete context.** «خرسانة قواعد» and «خرسانة
  للأعمدة والكمرات» resolved to a bare family, because naming the element is
  precisely what makes «خرسانة» ready-mix.
- **Aluminium windows and doors.** The family modelled curtain walling and
  louvers and never the most-tendered aluminium item there is.
- **«سيكوريت»** is the Gulf trade word for toughened glass, absent while
  `tempered glass` was strong — the English side deciding where Arabic could not.

## 6. Measured result on the real booklet

68 real short-form items, 0 AI calls.

| | cpo-v5 (their measurement) | cpo-v6 |
|---|---|---|
| Level A | 16.18% | **33.82%** |
| true unknown | 14.71% | **0.00%** |
| poolable | 66.18% | **98.53%** |
| distinct pools | — | 30 across 67 items |

Level A doubled and true unknown went to zero, but read the A number honestly:
two-word lines mostly resolve at **family** level, and that is the correct
behaviour, not a shortfall. «خرسانة جاهزة» is a poolable answer; there is no
further intent to reach without a grade or an element, and inventing one would
fragment the pool.

## 7. The 10,219-line general-contracting set, for regression

| | cpo-v5 | cpo-v6 |
|---|---|---|
| poolable coverage | 99.6% | **99.6%** |
| confident-wrong | 0.08% | **0.04%** (4 of 7,966 Level A) |
| C rate | 0.11% | **0.11%** |
| A / B / C | — | 77.95% / 21.94% / 0.11% |
| unique pools | — | **153** |

All ten original P0 error families remain fixed. The 4 confident-wrong are the
perforated aluminium tiles discussed in §4.

## 8. Held-out three-level contract, final payload

| | Level A | Level B | Level C | semantic recovery |
|---|---|---|---|---|
| batches 3-10 (81,752) | 81.45% | 15.67% | 2.88% | 4,062 |
| batches 11-20 (102,190) | 77.42% | 22.39% | 0.19% | 5,830 |

Both corpora are unchanged from the mid-round payload, which is expected and
mildly reassuring: the civil short-form vocabulary simply does not occur in
catalogue-shaped archive lines, so the additions were targeted rather than broad.

## 9. Kept as they are

- **Guards were not relaxed.** Abstention beats confident error, and the ablation
  already showed they are not what suppresses short lines.
- **The 52 asymmetric nodes stand.** The language audit now flags the new civil
  nodes too — `readymix` and `shotcrete` decide in English while «خرسانه» is
  weak — and that is correct on both counts. «خرسانه» bare is genuinely generic
  and promoting it would manufacture errors; the Arabic for "readymix" is a
  two-word phrase, so existing only as a phrase is language structure, not
  asymmetry.

## 10. Map rebuild — still a precondition

Production runs 64 intents against **218**. 154 would resolve to zero suppliers.
Rebuild once, after this round, against `1483e668f2d3012f`.

One cross-lane exposure remains open and is unchanged from the v5 handoff: **the
API-side map builder does not read `term_guards`.** Every accuracy gain in this
round and the last applies to BOQ line resolution only. The attribute-clause rule
lives in the resolver as well, so supplier-side matching has neither. Until the
builder honours both, a supplier whose profile text contains «مادة Aluminium»
can still be mapped on `aluminium`.

## 11. Repo health — for the owner's attention

`git` prints `error: non-monotonic index` on **every** invocation in this repo:

```
.git/objects/pack/._pack-e6b8bf8e76d5a24aa9a9c0f60f38c99583ef0a99.idx
```

These `._*` files are macOS AppleDouble resource forks, created when the volume
is written by a system that does not support native extended attributes — this
repo lives on an external `/Volumes/Extreme SSD`. There are also `._*` twins
beside dozens of fixtures and scripts.

Commands still succeed, so it reads as cosmetic. It is not: this repo holds
**weeks of uncommitted work**, and the files sit inside `.git/objects/pack/`,
where git resolves history. Recommended, in order:

1. Back up the working tree off this volume **before** touching `.git`.
2. `find .git -name '._*' -delete`, then `git fsck` to confirm the object store
   is intact.
3. Add `._*` to `.gitignore` and set `COPYFILE_DISABLE=1` for archive operations.
4. Commit. The uncommitted state is the actual risk; the AppleDouble files are
   the warning about it.
