# cpo-v10 — Arabic inflection as a class, not as three more fixes

**Date** 2026-09-17 · **Payload** `fafa97d20586ca1f` · **Resolver** `d6a2d876af6757a6`
**Patch** `.handoff/cpo-v10-arabic-inflection-class.patch` (base `13ea40a5`)
**Tests** 462 passing · **Not committed**

---

## The answer to the judgement question first, because it shaped everything else

**Yes, a class-level close is available — but only for part of the territory, and
the boundary is a fact about Arabic rather than a limit of effort.**

The distinction that closes the recurrence is the one the language itself makes:

- **INFLECTION** changes a word's *form* and keeps its meaning. The definite
  article, the conjunctions, the sound plurals. «لوحة» and «لوحات» are one
  lexeme, so matching across them is always right and the rule may generate
  them freely.
- **DERIVATION** builds a *new word*. The nisba does this: «خشب» wood → «خشبي»
  wooden, «أرض» ground → «أرضية» flooring, «معدن» metal → «معدني», which also
  means mineral. The result is a different lexeme that may name a different
  product, so generating it is a **guess**, not a transformation.

v7 added the nisba as though it were inflection, because «خشب / خشبي» happen to
be procurement-synonymous. «أرض / أرضية» and «معدن / معدني» are not — and those
are two of the three defects you sent. So the defects were not three unrelated
bugs and not a suffix list that was too short; **they were one category error**,
and both directions of it: a missing inflection (defect 1) and an over-applied
derivation (defect 2).

That is the class-level close, and it is why fixing one did not have to worsen
the other. They pull in opposite directions only if both are called
"morphology".

**Where the close stops.** Derivation cannot be made safe by computation alone,
and I have the measurement that proves it rather than an intuition. The gate I
built refuses a derived form that another family already owns — and the *same*
gate that correctly refuses «معدن» → «معدني» also refused «زجاج» → «زجاجي» and
cost «باب زجاجي سحاب» its family, taking booklet confident-wrong from 0.00% to
1.47%. The two cases are structurally identical; what separates them is that
«معدني» is polysemous and «زجاجي» is not. **No structural rule can see
polysemy.** So derivation is gated but not solved, and the honest statement is
that the nisba remains the one place where a human judgement is still encoded —
in vocabulary, where it is visible.

**Broken plurals are out of scope, permanently and for a stateable reason.**
«حريق» → «حرائق», «لوح» → «ألواح», «كتاب» → «كتب»: the plural is formed by
re-templating the root, not by adding to it. No affix rule reaches them — not
this one and not a longer suffix list. They are **vocabulary**, which is how
«حرايق» was handled in v9. This limit is now enforced by a test rather than
described in a comment, because a reader who assumes plurals are covered is half
right and the wrong half is silent.

---

## The three defects

### 1. «لوحة» did not match «لوحات» — the sound feminine plural

The most common plural formation in the language, and unreachable by the old
rule for a structural reason: it **replaces** the taa marbuta rather than
following it, so a rule that only ever appended could not produce it however
many suffixes it listed. Fixed, and two things had to move together —

There was a second, quieter reason it could not have worked: the cheap
prefilter probed the *stem*, and «لوحه» is not a substring of «لوحات», so the
line was rejected before the pattern ran. The probe is now the longest common
**prefix** of the forms a word may match, which is a genuine necessary
condition.

**And the same fix removed a collision.** «لوح» sheet and «لوحة» board are
different words; «لوحات» is the plural of the second, while the first pluralises
to the broken «ألواح». So when both are vocabulary, the sound plural is
attributed to the feminine and **withheld from the bare noun**. One attribution
gained «لوحة» its plural and took «لوحات توزيع» away from «لوح» — two entries on
your collision list that were pointing at each other. It also cleaned up
«شبك» (rebar mesh) claiming «شبكات» (networks) and «بلاط» claiming «بلاطات سقف».

### 2. «ارض» matched «ارضيات» — derivation across a trade boundary

This was the epoxy hazard arriving from the suffix direction, and the gate now
refuses it: a derived form is generated only where no family owns it that does
not also own the base. An unknown base is refused rather than waved through,
because a word the ontology does not carry has no claim on a form some family
does. «أرض» → «أرضيات» is refused; «خشب» → «خشبي» is untouched, because wood
owns both.

**The phrase exemption, which the measurement forced.** Gating a word in
isolation was too blunt: glazing already carries «باب زجاج», and «باب زجاجي»
is the same product written two ways — «باب خشب / باب خشبي» exactly. The
derivation was being refused on evidence from «صوف زجاجي» and «ألياف زجاجية»,
where the neighbouring word was doing the disambiguating all along. So
derivation is free inside a multi-word term and gated when the word stands
alone. Bare «زجاج» still does not reach «صوف زجاجي».

### 3. «حرائق» — broken plural

Out of scope, as above. Vocabulary, and now with a test that keeps the limit
honest.

---

## Measured against the collision list, as instructed

I could not reproduce your 36 exactly and I think the definitions differ — mine
counts weak terms as well as strong, and counts a collision whenever one
family's term reaches another family's term through morphology that a literal
match would not have produced. On that definition **v9 had 67**.

| | count |
|---|---|
| v9 | **67** |
| v10 | **41** |
| removed | **34** |
| added | **8** |

**All three glass/mineral-fibre collisions are in the removed list** — «زجاج»
reaching «ألياف زجاجية», «خزان ألياف زجاجية» and «صوف زجاجي». So the case that
had bitten three times is gone from the suffix direction too, not just from the
v7 tier demotion. The rest of the removals: «اسمنت»×5, «شبك»×5, «لوح»×8,
«امن»×3, «بلاط»×3, «صوت»×2, «رمل», «عمود», «مغناطيس», «خرساني»×2.

**The 8 additions, stated plainly rather than netted away:** «لوحة» →
«لوحات إنذار حريق» and «لوحات مرورية», «بطاقة» → «قارئ بطاقات» and
«بطاقات rfid», «بطارية» → «شاحن بطاريات», «أرضية» → «هاردنر أرضيات»,
«أرضيات مرتفعة», «ماكينة تنظيف أرضيات».

Every one is a *correct* plural of a word that genuinely is that lexeme, which
is categorically different from the removals — those were the wrong lexeme. And
every one was checked at **line** level:

| line | resolves to |
|---|---|
| «هاردنر أرضيات» | `industrial_flooring_coating` |
| «أرضية إيبوكسي» | `industrial_flooring_coating` |
| «شاحن بطاريات» | `power_tools` |
| «قارئ بطاقات» | `physical_security/card_reader` |
| «لوحات إنذار حريق» | `fire_detection_alarm/fire_alarm_panel` |
| «خزان ألياف زجاجية» | `water_tanks` |

None misresolves, because the head concept decides there. **The epoxy hazard is
not revived.** Worth carrying forward as a method note: a term-level collision
count is an upper bound on risk, not a prediction of behaviour — the machinery
that resolves these cases lives a layer above the one the audit measures.

**One precision cost I should name.** The sound plural is generated whether or
not the word actually takes it, so 332 terms gain a plural form and some of
those forms are not Arabic — «زاويه» → «زاويات» when the real plural is the
broken «زوايا». Those forms are inert, because a string that does not occur
cannot match, and the collision audit is what bounds the risk that one
accidentally lands on a real word: 8 additions, all legitimate.

---

## The seven fixture cases

The port kept them so the arrival of the fix would be observable. **Four
flipped, five held**, and the direction is the point:

| | v9 | v10 | case |
|---|---|---|---|
| FLIP | false | **true** | «لوحة» :: «لوحات توزيع كهربائية» |
| FLIP | true | **false** | «معدن» :: «ألواح جبس معدنية» |
| FLIP | true | **false** | «معدن» :: «بلاط سقف مستعار ألياف معدنية 600x600» |
| FLIP | true | **false** | «ارض» :: «أرضيات إيبوكسي صناعية» |
| held | true | true | «باب خشبي» :: «باب خشب زان» |
| held | true | true | «باب خشب» :: «باب خشبي زان» |
| held | true | true | «كابل» :: «كابلات نحاس معزولة» |
| held | true | true | «ري» :: «شبكة ري بالتنقيط» |

The third flip is worth pausing on: its own note says *"mineral fibre must not
read as metal"* while it recorded `decides: true`. The port captured the defect
faithfully, including the contradiction between what it wanted and what it got.
The five holds are the ones that must never move — the v7 nisba pair, the
loanword plural, and the two-letter stem floor.

Four new cases were added for the supply side to mirror, including the phrase
exemption («باب زجاج» vs bare «زجاج») and the plural attribution («شبك»).
Fixture is now 40 cases.

---

## Held-out corpora did not move

| corpus | rows | v8 | v9 | v10 |
|---|---|---|---|---|
| b3–10 | 81,752 | `58e6be7dbffa7579` | `58e6be7dbffa7579` | `58e6be7dbffa7579` |
| b11–20 | 102,190 | `6b36a5f38fed9008` | `6b36a5f38fed9008` | `6b36a5f38fed9008` |

**183,942 rows, byte-identical across three versions**, by full-file SHA256.

You asked me to treat a move as a finding. **The non-move is the finding**, and
it needs saying because it could be misread as the change being inert. Two
reasons, and both are informative:

1. The archives are long, over-specified lines — 12 to 15 words — where explicit
   vocabulary and the head concept already decide. Morphology is what short
   lines depend on, which is the booklet register, not this one.
2. The ontology already hand-lists the plurals of its common terms: «لوحات
   توزيع» is itself a term. So the general rule largely reproduces what was
   written out by hand — which is evidence that the generalisation is **the
   right one**, since it independently derives the forms a human had already
   decided were needed.

What the change actually buys is therefore not measured in these corpora: it is
34 latent cross-trade collisions removed, a plural formation that no longer
depends on someone remembering to hand-list it, and a class of defect closed.

Booklet is unchanged and still clean: **actionable completeness 67/68, correct
abstentions 1, confident-wrong 0.00%**, Level A 55.88%, true unknown 0.00%.

---

## For the supply lane

1. The morphology rule is now in the payload as `morphology_rule`, including the
   inflection/derivation split, the plural attribution rule, the phrase
   exemption, and the out-of-scope statement. Port the **distinction**, not the
   suffix list.
2. Four new conformance cases cover the parts most likely to be got wrong: the
   phrase exemption and the plural attribution.
3. The probe is now a common **prefix**, not a stem. If your port carries the
   stem prefilter, the sound feminine plural will silently never match however
   correctly you implement the pattern — that is the bug I hit first, and it is
   invisible because it looks like the pattern not matching.
4. Broken plurals are vocabulary on both sides. If you find one in supplier
   prose the way «حرائق» turned up, list it; no rule will grow into it.
