# المجموعة الذهبية — بُنيت، وخط الأساس لـ cpo-v10 (17 سبتمبر 2026)

## الملخص العربي

الأرشيف (183,942 صفًا) لم يعد بوابة الإصدار. بُنيت **المجموعة الذهبية**: 265 بندًا حقيقيًا،
في `fixtures/gold/`، مع تعريفات المقاييس **مثبّتة قبل القياس** في `METRICS.md`.

**التركيب:** 68 بندًا من كراسة اعتماد حقيقية، 17 بندًا لكل خطأ حقيقي من v4 إلى v10 (كل بند
يحمل الجيل الذي كسره والجيل الذي أصلحه)، و120 بندًا **حُجبت** من قاعدة الإنتاج. طلب عرض السعر الحقيقي بـ60 سطرًا يقع في مشروع
`farq` **الموقوف**، فحمَلت بديلًا حقيقيًا مسمّى بوضوح (60 سطرًا من كتالوج الإنتاج) بدل
تركه فارغًا، ورفضت كل الكراسات الاصطناعية.

**أهم ثلاث نتائج:**

1. **المحرّك ينهار على البنود الحقيقية غير المرئية.** 98.5% من كراسة الاعتماد تصل إلى عائلة،
   و61.7% من بديل طلب عرض السعر، مقابل **42.5% فقط** من العيّنة المحجوبة. التدرّج نفسه هو
   الدليل: كلما ابعدنا عن البيانات التي ضُبط عليها المحرّك، انهار أكثر.
2. **`construction.intent_supplier_map` غير موجود في الإنتاج.** الجدول لم يُبنَ قط، فالعلم
   `CONSTRUCTION_INTENT_SUPPLIER_MAP_ENABLED` لا يشغّل شيئًا. المسار الحقيقي هو بحث نصي.
3. **42 من 47 صفرًا سببها `ZERO_BECAUSE_MAPPING_BROKEN`** — أي أن جانب العرض يملك موردين
   موثّقين لا يصل إليهم المسار الحي. «باب خشب» يعيد صفرًا بينما 478 موردًا لديهم تخصص «timber».

---

## 1. What was built and where it lives

| artefact | path | purpose |
|---|---|---|
| metric definitions | `fixtures/gold/METRICS.md` | **fixed before measurement**; changing it invalidates comparison |
| Precision@5 criterion instance | `fixtures/gold/material-evidence.json` | family → supplier specialty tags that count as evidence |
| error corpus (component 3) | `fixtures/gold/error-corpus.json` | 17 items, each naming the generation that broke and fixed it |
| held-out manifest (component 4) | `fixtures/gold/heldout/MANIFEST.json` | **HMACs only** — no lines in git |
| held-out plaintext | `$HOME/.farq-gold-heldout/` | mode 600, dir 700, **outside the repository** |
| harness | `scripts/gold-set-run.mjs` | `--version=v10` pins a generation; `--no-heldout` for shareable runs |
| verdict tool | `scripts/gold-set-compare.mjs` | judges a candidate against a baseline; this is what judges the shadow run |
| baselines | `fixtures/gold/baseline-cpo-v10.*`, `baseline-cpo-v11.*` | report + per-item rows, held-out lines redacted |

Composition: **68** booklet + **60** RFQ substitute + **17** error corpus + **120** held-out
= **265** items.
Nothing committed.

### Component 2 is absent and I did not fake it

No 60-line real RFQ exists in either repository. Production holds **one** RFQ with **two**
lines. Every other multi-line candidate declares itself synthetic on page one
(«وثيقة اختبار آلي», «بيانات افتراضية غير رسمية», `FARQ-TEST-*`), including
`site-safety-02`, `datacenter-cyber-01`, `warehouse-ops-02`, `large-boq-480-lines.csv` and
`booklet-02-extra`. Filling the slot with one of those would reintroduce precisely the
unrepresentative-fixture failure the Gold Set exists to prevent. **The owner needs to supply
a real RFQ he actually sent.** The slot is reserved and the harness already counts it as zero.

## 2. How the held-out portion is protected

**Source.** Production `construction.items` — 3,084 **real** product lines from real Saudi
vendors (Makita, RAK, Saudi Ceramics, Opal and Al-Wasid block factories, Proto, Tyrolit, Leo
pumps), in the short Arabic register buyers type. 120 drawn, stratified over **63 categories**,
capped at 10 per category.

**Why it is genuinely unseen:** every ontology lane works in the repository and has **no
database access**. This vocabulary was never reachable, so it could not have been fitted
against. "Unseen" here means unreachable, not un-looked-at.

**Controls:** plaintext outside the repo at `0600` in a `0700` directory; git carries only
per-item **HMAC-SHA256** (a plain SHA256 would be dictionary-attackable from the archives);
the key also lives outside the repo; the draw is reproducible from seed `0.20260917` so a
disputed sample can be re-derived without publishing it.

**Access:** plaintext — the measuring lane only, and **not while also tuning**. Aggregates
only — ontology lane, API/Phase-2 lane, retriever+verifier lane.

**Decay:** `measured_count` is now **1**. After **2** it must be redrawn.

**Leak audit:** every held-out line was searched literally against `fixtures/`, `scripts/` and
`.handoff/`. **3 of 120 are burnt** and recorded in `MANIFEST.json` under `burnt_items`;
**117 are clean**. `HELD-036` «خرسانة جاهزة» was never unseen (a generic phrase already
everywhere); `HELD-052` «بلوكات حرارية» I burnt myself by naming the v11 regression, which was
the necessary trade; `HELD-053` «وصلات أدوات حمام» was drawn independently into component 2 by
a concurrent lane. Future runs must exclude the burnt three or redraw.

**One accident, caught and fixed:** the first run wrote all 205 per-item rows — including 120
held-out lines — into the repo. That would have burnt the sample on its own first use. Held-out
rows are now redacted to their HMAC in the repo copy and the unredacted rows go to the vault.
This is the failure mode you warned about, and it took one run to occur.

## 3. Metric definitions, fixed in advance

Full text in `METRICS.md`. The parts that matter:

- **Precision@5** is reported as **three numbers, never one** — appropriate, wrong-material,
  unsure — out of positions actually filled. A single averaged percentage would hide `unsure`
  in a denominator.
- A supplier is `APPROPRIATE` only when its **own recorded evidence** carries a tag belonging
  to the item's material family. **Generic tags carry no material evidence** and can never
  establish it: `general-supply`, `hardware-general`, `maintenance`, `transport`, `manpower`,
  `siteworks`, `finishing`, `mechanical`, `electronics`, `it`, `equipment`, `rental-parts`.
  These are what would let a 245,729-row directory appear to serve everything.
- `UNSURE` is a real verdict. A family deliberately absent from `material-evidence.json`
  yields `UNSURE`, never `APPROPRIATE` — omission forces explicit extension over silent default.
- Every judgement is written with supplier id, name, the evidence string, and the deciding
  tag. **No score is used as evidence.**
- **Precision@5 is refused on the `specialty` path** and printed as `REFUSED`, because that
  path retrieves on the same evidence the metric judges; its precision would be 100% by
  construction. Only `live_text` precision means anything.

## 4. Baseline — `cpo-v10` (payload `fafa97d20586ca1f`, resolver `d6a2d876af6757a6`)

Supply side: 245,720 visible suppliers; 10,315 active specialty rows over **5,707** suppliers.

| | overall (265) | booklet_68 | rfq_60_sub | error_corpus | fresh_heldout (120) |
|---|---|---|---|---|---|
| resolves to a family | 171 (64.5%) | **67/68 (98.5%)** | 37/60 (61.7%) | 16/17 | **51/120 (42.5%)** |
| returned suppliers at all (`live_text`) | 205 (77.4%) | 48 | 47 | 7 | 103 |
| Precision@5 appropriate | 444 | 150 | 134 | 14 | 146 |
| Precision@5 **wrong-material** | **42** | 32 | 1 | 3 | 6 |
| Precision@5 unsure | 469 | 29 | 90 | 7 | 343 |
| zeros | 60 | 20 | 13 | 10 | 17 |
| — `ZERO_BECAUSE_MAPPING_BROKEN` | **51** | 18 | 9 | 9 | 15 |
| — `ZERO_BECAUSE_NO_CONFIRMED_SUPPLIER` | 4 | 2 | 0 | 1 | 1 |
| — `ZERO_BECAUSE_UNRESOLVED` | 5 | 0 | 4 | 0 | 1 |

The gradient across components is the finding: **98.5% → 61.7% → 42.5%** as the lines get
further from what the ontology was fitted against. The 60-line substitute was assembled
independently by another lane and lands squarely between the two, which is the closest thing
to corroboration this measurement has.

Error corpus: **0 regressions of 17**. Fifteen HOLD. Two are `NOT WRONG, BUT NOT RIGHT` and
both were already marked `open` in the corpus: `ERR-14` «الياف معدنيه» resolves to nothing,
and `ERR-05` «مواسير مرنه لتمديد الكابلات الكهربائيه» lands on `pipes_fittings` rather than
`electrical_conduit_trunking` — not the cable error it used to be, but not conduit either.

### What the numbers say

1. **The demand side collapses on unseen real lines.** 98.5% on the booklet the ontology has
   been fitted against, 61.7% on an independently drawn real catalogue sample, **42.5%** on
   the fresh held-out sample. Every coverage number quoted to date describes lines the engine
   has already met.
2. **`UNSURE` is a demand-side failure, not supply-side ambiguity.** **382 of 384** unsure
   verdicts are «the item resolved to no family, so there is nothing to be appropriate to».
   Only 2 are suppliers with genuinely uninformative evidence. The buyer is shown a large pool
   that nobody can vouch for because the line was never understood.
3. **42 of 47 zeros are `ZERO_BECAUSE_MAPPING_BROKEN`.** «باب خشب» returns zero suppliers while
   478 suppliers hold the `timber` specialty; «قاطع 32 امبير» returns zero while 549 hold
   switchgear evidence. The live path searches **Arabic product phrases** against a directory
   whose evidence is **English category tags**. That mismatch, not an empty directory, is the
   most likely mechanical cause of the «غير متوفر» replies.
4. **The pool is a firehose.** Median 83 candidates per item, 145 on the held-out sample, 96
   items returning >100. Ordering is therefore doing all the work, and it is currently
   `verified-first, then match count`.

### Two biases in the criterion, stated rather than discovered later

- **Mis-tagged suppliers count against the engine.** «ابراهيم استانلس درابزين وخشب» — a
  handrail maker whose name says so — is tagged `glass,tyres,pools` and scores
  `WRONG_MATERIAL` for a handrail. **21 of 41** wrong-material verdicts have an item word
  inside the supplier's name, so the honest figure is a **range, 20–41**, and the upper end is
  a directory data defect as much as a routing defect.
- **Non-construction businesses land in `UNSURE`, not `WRONG_MATERIAL`,** because a tyre dealer
  has no ontology family to be evidence for. This under-counts wrong-material.

Both are left in place. The criterion was fixed in advance and changing it after seeing
results is how a metric drifts. Fixing either means editing `METRICS.md` deliberately and
re-scoring.

## 5. The working tree moved from v10 to v11 mid-session

The tree now reads **`cpo-v11`** (payload `dfb34f19c807563f`, resolver `a3e96860aa9aedb6`).
My first run silently measured v11 while labelled v10, and **only the recorded fingerprint
caught it** — which is the entire argument for `METRICS.md` §7. The harness now takes
`--version=` and pins to a reconstructed generation, and output files are named after the
version actually measured rather than the one intended.

I then ran both, which gave the instrument its first real verdict:

```
cpo-v10  ->  cpo-v11   (205 gold items)
  items resolving to a family      134 ->   133   -1
  items returning suppliers        158 ->   158
  appropriate in top-5             310 ->   309   -1
  WRONG-MATERIAL in top-5           41 ->    41
  unsure in top-5                  379 ->   384   +5
  FAMILY CHANGED (1):
    HELD-052  «بلوكات حرارية»  masonry_blocks -> null
VERDICT: REGRESSION (1 net item lost its family — pool survives but can no longer be
         vouched for: «بلوكات حرارية»)
```

**v11 loses a real held-out line that v10 resolved.** «بلوكات حرارية» — thermal blocks, with
«بلوكات» the genuine sound plural of «بلوك» — resolved to `masonry_blocks` under v10 and to
nothing under v11. The pool did not empty, so a pool-only metric would have called this "no
move"; the verdict tool now reports family loss separately for exactly that reason. If v11
narrowed the sound-plural rule in response to my precision-cost finding about non-words like
«زاويات», it narrowed it too far and took a real plural with it. **That is the ontology lane's
to answer, and it is the first named regression the Gold Set has produced.**

## 6. Ready for the shadow run

`scripts/gold-set-compare.mjs <baseline> <candidate>` answers the one question the cascade
will be asked. Its verdict ladder, in order:

1. `FAIL (bought coverage with N new confident errors)` — any new confident error alongside a
   coverage gain. **No threshold. One is a failure, not a wash.**
2. `FAIL (N new confident errors, no coverage gain to show for it)`
3. `REGRESSION (N net items lost their pool)`
4. `REGRESSION (N net items lost their family — pool survives but can no longer be vouched for)`
5. `PASS (coverage up, zero new confident errors)`
6. `NO MOVE`

For the API lane: the run records `payload_sha16`, `resolver_sha16` and `ontology_version`
now, and reserves `request_resolver_version` / `intent_contract_hash` /
`supplier_mapping_hash` for when the three-way split lands. Until then it stamps
`supplier_side = live_directory_query` and notes that
`construction.intent_supplier_map` **does not exist**, because a supplier metric with no
supply-side fingerprint is not comparable across days.

## 7. What I need from others

1. **The owner's real 60-line RFQ** — it lives in the paused `farq` Supabase project.
   Component 2 currently carries a named real substitute; unpausing that project is the only
   way to replace it with the thing he actually sent.
2. **The ontology lane on «بلوكات حرارية»** — v11 lost it; was that intended?
3. **Whoever owns the supply side on the Arabic/English mismatch** — 42 of 47 zeros are a
   query-language defect, not a directory gap. This is the highest-value fix visible in the
   baseline, and it is worth more than any further ontology generation.
4. **The two non-negotiables from the v10 adjudication remain open** and the Gold Set now
   holds them as named entries: `ERR-14` (mineral-wool vocabulary gap) and `ERR-07`
   (the «عزل» guard collision). Neither may be scored as fixed while marked `open`.
