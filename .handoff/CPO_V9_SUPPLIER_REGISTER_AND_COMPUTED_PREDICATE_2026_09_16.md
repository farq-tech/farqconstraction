# cpo-v9 — supplier prose gets its own register; the ratchet becomes a predicate

**Date** 2026-09-16 · **Payload** `f93c05e3a1c151cc` · **Resolver** `f1e4a97a2049b1a1`
**Patch** `.handoff/cpo-v9-supplier-register-and-computed-predicate.patch` (base `13ea40a5`)
**Tests** 445 passing · **Not committed**

---

## 1. The supply-side chokepoint: what the derivation said

The instruction was to reuse the *question* and derive supplier prose its own
vocabulary and its own position rule, from real supplier descriptions, the way
the BOQ openers were derived from booklet lines.

**Corpus** 10,104 real supplier records — `name_ar` + `name_en` +
`supplied_items_text` + `business_type`, which is what `evaluateSupplier`
actually receives.

**Result: the derived vocabulary is empty.** Not small — empty. Every BOQ
opener is either absent from this register or inverted by it, and no
replacement construction survived falsification.

### The finding that settles it

| opener | occurrences | attributive | what it actually does |
|---|---|---|---|
| «لل» | **6,298** | **0** | introduces the trade the company **is** |
| «بال» | 78 | 0 | locational — `بالرياض`×37, `بالدخول`×27 |
| «لال» | 2 | 0 | «لالواح» — the company's product line |
| «في» | 31 | 0 | locational or topical — «في الدمام», «في مجال السلامة» |
| «من» | 8 | 0 | «الوقاية **من** الحريق» **is** the trade |
| «ماده», «تصنيف», +13 more | **0** | 0 | absent entirely |
| «عرض»×7, «تيار»×2, «ربط»×1, +7 | 11 | 0 | company names — «تيار البرق للطاقة», «ربط الكهرباء» |

The top continuations of «لل» are `للتجاره`×751, `للمشاريع`×623, `للتبريد`×619,
`للادوات`×387, `للتكييف`×250, `للاسمنت`×210, `للرخام`×193, `للبلاستيك`×177.
Every one is a trade being **claimed**. In an Arabic company name «لـ» is the
particle that says what the company does — «مؤسسة النجم **للتبريد والتكييف**».

So the BOQ rule is not merely unhelpful in this register. It is **inverted**: in
6,298 records it suppresses precisely the words that identify the supplier. That
is the mechanism behind every reported regression, and it is the strongest
possible confirmation of the lane's diagnosis — supplier prose has no product
head with attributes trailing it, so a positional clause rule has nothing to
anchor to.

A second pass tried constructions specific to prose — exclusion («عدا»,
«باستثناء», «بدون», «غير»), third-party reference («لصالح», «عملاء», «clients»),
likeness («مثل», «بديل», «similar to»), and record field labels («النشاط»,
«التصنيف», «category»). Every one is absent or a false positive: «بديل الرخام
والخشب» is a marble-and-wood **substitute**, which is the company's actual
product; «مؤسسة بدون تردد للتكييف» is a name.

### What shipped

`supplier_clause_rule` in the payload, a full register descriptor with an empty
vocabulary, `opens_at_index_0: true`, and all eleven refusals recorded with
their counts. An empty vocabulary is a **result**, so it carries its evidence
like any other result rather than looking like skipped work.

The chokepoint itself **stays**. Every positive supplier claim still goes
through `bestHit`; only the vocabulary it applies is register-scoped, selected
by a `ClauseRegister` parameter that defaults to `boq_line`. That is what makes
this a one-parameter change rather than a second implementation — and it means
that when a prose opener is eventually earned, it plugs into the same code path
with no resolver edit. `negative_terms` stay raw: an exclusion is not a claim.

The index-0 policy is now **declared per register** rather than assumed — `false`
for BOQ, where a keyword with nothing before it *is* the product; `true` for
prose, which has no such guarantee. Moot while the prose vocabulary is empty,
recorded so it is already settled when it is not.

### Measured effect

| supplier text | v8 | v9 |
|---|---|---|
| «مأسسة الحماية **من** الحريق — رشاشات حريق ومضخات» | NO_MATCH, 0 | **PREFERRED, 23** |
| same business, «الحماية **ضد** الحريق» | PREFERRED, 23 | PREFERRED, 23 |
| «شركة مكافحة الحرائق **في** الرياض» | zeroed | **PREFERRED** |
| «شركة مكافحة الحرائق **بالرياض**» | zeroed | **PREFERRED** |

The two phrasings of one business now score **identically**, which is the
property that was broken.

### One correction to the report

«شركة مكافحة الحرائق» was attributed to the chokepoint. It was not. It scored
zero **before the chokepoint existed**, because «حرائق» is the **broken plural**
of «حريق» and a broken plural cannot be derived by suffixing the way the nisba
and «ات» rules derive theirs. It has to be listed, and now is. The «في»/«بال»
part of that string was a real clause casualty; the archetype miss underneath it
was a separate, older vocabulary gap that the clause fix alone would have left
in place.

**Still open, and it is not the clause rule's job.** With the prose vocabulary
empty there is no clause-based defence against the adversarial strings, and the
conformance fixture now records them as deciding. The honest reading is that the
clause rule was never what defended that case: «تصنيف» has **zero** occurrences
in 10,104 real records, so the attack string cannot arise from this register.
What actually lets a paint factory qualify is **archetype cancellation** — any
mention of the trade's words creates a qualifying archetype, and a qualifying
archetype cancels the `hard_conflicts` veto. That is a scoring-precedence
defect, in the supply lane's territory, and it should be fixed there rather than
by borrowing a rule from the other register.

### `extractFacets`

Fixed, and it was a v6-era latent defect rather than new in v8: facets were
reading through the clause rule, so a line that *declared* its material got no
material facet while one that merely implied it did — and `material` is
`supplier_pool_affecting`, so the explicit line split the pool **less**.

| line | v8 | v9 |
|---|---|---|
| «باب صناعي **مادة** المنيوم» | `{}` | `{material: aluminium}` |
| «باب صناعي المنيوم» | `{material: aluminium}` | `{material: aluminium}` |

An attribute clause is exactly where a facet value lives. Facets describe; they
never decide, so they read the clause.

---

## 2. The ratchet is gone

Replaced by a computed classification with **no adjudicated entries**. The
ruling was right and worth repeating: a may-only-shrink list that grew is a
comment, not a ratchet.

A guard on a descendant whose ancestor carries the same word freely is one of
two things, and the payload itself says which:

- **DEPTH GUARD** — every word it blocks on is this family's own vocabulary. It
  separates siblings, so the ancestor answering is the honest fallback. Benign,
  automatically.
- **TRADE GUARD** — it blocks on a word that *decides* another family and that
  this family never uses. It pushes the line out of the family, so an unguarded
  ancestor re-catches exactly what the intent just declined. Must be mirrored.

Current state: **6 depth-guard offences, 0 unmirrored trade guards.** A second
assertion requires the depth count to stay above zero, so the first cannot pass
vacuously.

### It caught the defect it was pointed at

Bare «عزل» is insulation's word, so its presence classified the breaker guards
as trade guards and failed the test — the same borrowing that cost
«قاطع 32 امبير **عزل** مزدوج» its intent. Swapping it for «مفتاح عزل» and
«قاطع عزل», which switchgear owns, fixes the line and the classification at
once:

- «قاطع 32 امبير عزل مزدوج» → **`mcb`** (was family)
- «قاطع عزل 100 امبير» → **`isolator_switch`** (was family)

«هوايي» and bare `isolator` were the same class and were fixed with it —
«قاطع هوايي», «مفتاح عزل», `switch disconnector`.

### It also found four older ones

`distribution_board`, `respirator_filter` and `data_cable` carried trade guards
their families did not mirror, so each was mirrored upward. Behaviour is
unchanged on every probe — the family guard only fires when the other trade's
words are present, which is when the family should have been declining anyway.

`metal_ceiling` was the instructive one. It blocks on mineral-fibre words to
steer toward its sibling, not out of the family — but `interior_systems` did not
*own* those words, so the predicate read it as a trade guard, and mirroring it
on that reading sent «سقف مستعار صوف صخري» to a thermal-insulation supplier
instead of a ceiling-tile one. The fix is ownership, not exemption: a family
that discriminates using a word has to own that word, so the fibre materials
joined `acoustic_ceiling_tile`'s **context** tier, where they never decide
alone. The guard then classified as a depth guard correctly and the mirror came
back out.

**Where the predicate has a known limit, stated rather than discovered later.**
It reasons structurally, so it over-approximates: it cannot see that competition
between families already resolves a case. «فلتر زيت محرك» reaches
`lubricants_chemicals` and «جهاز اختبار كابلات شبكة» reaches
`network_test_tools` whether or not the ancestor is guarded, because the other
family's strong term wins. Mirroring those guards was therefore belt-and-braces
rather than a bug fix. The over-approximation is in the safe direction — it asks
for a guard that changes nothing rather than missing one that matters — which is
why it is acceptable as a gate.

---

## 3. Booklet: two numbers

| | cpo-v7 | cpo-v9 |
|---|---|---|
| Level A | 50.00% | **55.88%** (38) |
| Level B | 50.00% | 44.12% (30) |
| true unknown | 0.00% | **0.00%** (0) |
| poolable | 98.53% | 98.53% (67) |
| **actionable completeness** | — | **67/68 = 98.53%** |
| **correct abstentions** | — | **1** |
| confident-wrong | 0.00% | **0.00%** (0) |

The residual is line #22 «خشب لعزل جدران» — timber, and the insulating job the
timber is for. The lane scores it a shortfall; this script scored it complete.
Both are defensible, so both are reported.

**Why the abstention is the better outcome.** The line names two trades and
commits to neither. Resolving it means choosing between a timber supplier and an
insulation supplier on no evidence, and being wrong half the time — at 0.90
confidence, `poolable`, `auto_tick`. That is the exact failure the owner has
already lived: an RFQ sent to a supplier who cannot supply it. An abstention
costs him a line he has to read himself. The second number is not a consolation
for the first; it is a different, cheaper cost, and worth paying deliberately.

---

## 4. Demand side is byte-stable

Required, and verified by full-file SHA256 rather than asserted:

| corpus | rows | v8 | v9 |
|---|---|---|---|
| b3–10 | 81,752 | `58e6be7dbffa7579` | `58e6be7dbffa7579` |
| b11–20 | 102,190 | `6b36a5f38fed9008` | `6b36a5f38fed9008` |

**183,942 rows, byte-identical.** Every v9 change is either supply-side, a
facet, or a guard whose blocking condition does not occur in these corpora. The
demand-side movements — the three breaker/isolator lines and the ceiling
ownership fix — are all in the booklet register, not the archives.

Provenance passes: v9 rebuilds from base `13ea40a5` plus one patch, payload and
resolver both exact. v5's resolver remains unreconstructible and is still
recorded as such.

---

## 5. For the supply lane

1. **`termDecidesIn` now takes a register.** `termDecidesIn(text, term, register)`,
   defaulting to `boq_line`. The conformance fixture carries a per-case
   `register` field, and the five supplier rows moved to `supplier_prose`, where
   they now decide `true`. **Those four v8 rows flipping is the correction, not
   a regression** — do not mirror v8's suppression.
2. **Do not apply BOQ openers to company prose.** The counts are in
   `supplier_clause_rule.rejected_openers`. If you derive prose openers later,
   derive them from supplier text and put them in that descriptor; the resolver
   reads it with no code change.
3. **Archetype cancellation is the real supply-side defect** (§1). A mention
   creating a qualifying archetype that then cancels a `hard_conflicts` veto is
   what lets a paint factory qualify. That is precedence, not vocabulary.
4. **Broken plurals need listing.** «حرائق» was one. Worth sweeping the
   archetype patterns for others; suffix morphology cannot reach them.
