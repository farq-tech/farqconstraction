# The reader served the wrong column, and the count hid it

2026-09-17. Branch state: two commits on top of `7c8b508` — `cf8cead` (the
signal) and `798f150` (the fix). Deployed to `farq-construction.vercel.app`.

## Do not look for booklets in the owner's two zips

`دفعات_مقاولات_عامة_3_الى_10.zip` and `دفعات_مقاولات_عامة_11_الى_20.zip`
contain **no booklets and no PDFs**. Each extracts to 18 files (`.xlsx`,
`.csv`, `.txt`) of **10,219 rows each** — bulk item catalogues used for
held-out ontology evaluation. They carry a unit column but **no quantity
column**, so they cannot drive an upload journey and cannot test the reader.
Nobody should spend time hunting for booklets in them again.

Every booklet PDF we do hold is contaminated: each theme appears in
`procurementOntology.data.json` and in vocabulary patches (datacenter 32
mentions, warehouse 33, safety 118, site equipment 10). There is no clean
booklet available. The only genuinely unseen PDF on the machine is a two-page
phone photograph with no `/Font` object, which would read zero items.

## What was wrong

`datacenter-cyber-01.pdf` read **180 of 180 items in 12.5 seconds with every
quantity and unit correct**, and **154 of the 180 descriptions were the
neighbouring `الفئة` category plus a fragment of `المواصفة`**. The item name
was never served. Row count, wall clock and units were all green.

Two mechanisms, both measured before anything was changed:

1. **The header was rejected outright.** `findBoqHeader` requires a number
   column, whose labels are `الرقم` / `م` / `رقمالبند`. This booklet heads its
   numbering `الرمز` and prints no `الرقم` at all, so the entire table was
   discarded (`rows=0`, `pages=[]`) and the flattened-text path ran instead.
   That path groups by visual row, so it served whatever shared the number's
   y-band — the category cell — and never the item name.
2. **The number cell would not parse even once the header matched.** The
   category's `DC-` prefix is printed hard against the numbering and overlaps
   it by a few points, so the cell read `001DC-` and an exact-digits test threw
   away all 180 rows as `صف بلا رقم بند`.

`booklet-02-extra.pdf` and `site-safety-02.pdf` had the same defect and had
never been noticed.

## The signal (`cf8cead`)

Item names are near-unique per row; category labels are not. Share of rows
sharing a name, measured on every booklet we hold:

| booklet | source before | repeated rows |
|---|---|---|
| reference-etimad-2020-48 | pdf-table | 2.9% |
| warehouse-ops-02 | pdf-table | 0.0% |
| site-or-wh-1__2 | pdf-table | 0.0% |
| datacenter-cyber-01 | pdf-text | 77.8% |
| booklet-02-extra | pdf-text | 80.6% |
| site-safety-02 | pdf-text | 80.6% |

The populations do not overlap. The threshold is **35%**, in the empty middle:
above any real repetition, below every broken read. When it fires the screen
leads with the read being unusable rather than with the count, and stops
saying `اكتملت`.

## The fix (`798f150`)

`الرمز` is promoted to the number column **only** where the block has no
dedicated number label and no `الانشائي` beside it. That matters because in
the Etimad booklet `الرمز الإنشائى` is a structural code (2001–2107) which
must never be read as an item number — that is the defect the coordinate
reader exists to prevent, and that booklet also prints `الرقم`.

The number cell now takes a short number followed by a non-digit, and still
refuses a longer digit run, so `2085` cannot become item 208.

## Fixtures

`fixtures/boq/datacenter-cyber-01-groundtruth.json` — 180 items with names,
quantities and units taken from **pymupdf**, not from this parser.
`src/lib/boqBookletLayouts.test.ts` fails loudly on either layout.

Measured after the fix: all six booklets read via `pdf-table`, reference still
68 of 68, datacenter 180 of 180 with **every quantity and unit exact** and 170
of 180 names whole. The ten that lose or mangle one word (`عمق`, `بوصة`,
`سعة`, and the bidi split of `تحليلات` on row 59) are listed by number in the
test; the material word survives in all of them.

## What this does not fix

Signed in on the deployed link, the same booklet now resolves **5 of 180**
lines to a material. That is an engine result, not a parser one — the
ontology is construction materials and this booklet is servers, GPUs and
network test gear. **No vocabulary work should be triggered by it.**

Newly visible and not addressed: the specification note reads `المواصفات
الفنية لم تصل بعد لـ 180 من 180 بندًا` while the cards plainly carry
specification text. `specsFromApi` counts only API-sourced specifications, so
a booklet whose own table has a `المواصفة المختصرة` column is reported as
having none. Same false-confidence class, different direction.
