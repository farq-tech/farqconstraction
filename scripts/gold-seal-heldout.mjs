/**
 * Component 4 of the Gold Set — the fresh sample, sealed.
 *
 * WHY THIS SOURCE. Every BOQ corpus in the repo is either already fitted against
 * (batches 3–10 and 11–20, the 68-item booklet) or explicitly synthetic (every
 * `FARQ-TEST-*` booklet says «بيانات افتراضية غير رسمية» on its first page).
 * Production `construction.items` is the one real, diverse, unseen source: 3,084
 * real product lines from real Saudi vendors, in the short Arabic register, that
 * live ONLY in the production database. No ontology lane has database access, so
 * this vocabulary was never available to fit against — which is what "unseen"
 * has to mean to be worth anything.
 *
 * HOW IT STAYS UNSEEN.
 *   · Plaintext is written OUTSIDE the repository, to $HOME/.farq-gold-heldout,
 *     directory mode 700, files mode 600. Nothing in git ever contains a line.
 *   · The repository carries only a MANIFEST: a per-item HMAC-SHA256 under a key
 *     that also lives only outside the repo. That proves the set has not changed
 *     between runs and lets anyone verify an item they already hold, while making
 *     the set unrecoverable from what is committed. A plain SHA256 would not do:
 *     the candidate space is small enough to dictionary-attack from the archives.
 *   · The draw is reproducible from a recorded seed, so a disputed sample can be
 *     re-derived by someone with database access without being published.
 *
 * WHO MAY LOOK. The measuring lane only — whoever is adjudicating, and not while
 * also tuning. Engine lanes receive AGGREGATE metrics per component, never lines.
 * If the adjudicating lane ever tunes the ontology, this sample is burnt for that
 * lane and must be redrawn with a new seed.
 *
 * DECAY. A held-out set stops being held out on contact. This sample is stamped
 * with its draw date and a `measured_count`; once it has been measured twice it
 * must be redrawn, because by then it has begun to inform decisions.
 */
import pg from '/Users/m4pro/farq/api/node_modules/pg/lib/index.js'
import { config } from '/Users/m4pro/farq/api/node_modules/dotenv/lib/main.js'
import { createHmac, randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync, existsSync, readFileSync, chmodSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

config({ path: '/Users/m4pro/farq/api/.env' })

const VAULT = join(homedir(), '.farq-gold-heldout')
const KEY_PATH = join(VAULT, 'manifest-hmac.key')
const SET_PATH = join(VAULT, 'heldout-2026-09-17.jsonl')
const SEED = 0.20260917 // recorded so the draw is reproducible
const TARGET = 120
const PER_CATEGORY_CAP = 10 // forces breadth: without it the sample is mostly porcelain tile

mkdirSync(VAULT, { recursive: true, mode: 0o700 })
chmodSync(VAULT, 0o700)
if (!existsSync(KEY_PATH)) {
  writeFileSync(KEY_PATH, randomBytes(32).toString('hex'), { mode: 0o600 })
  console.log('generated a new manifest HMAC key (stays outside the repo)')
}
const key = readFileSync(KEY_PATH, 'utf8').trim()

const conn = process.env.DATABASE_URL.replace(/([?&])sslmode=[^&]*/g, '$1').replace(/[?&]$/, '').replace(':5432/', ':6543/')
const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })
await client.connect()
await client.query('set default_transaction_read_only = on')
await client.query('set statement_timeout = 120000')

/**
 * Stratified, reproducible draw. `md5(id || seed)` gives a stable pseudo-random
 * order without needing a session-level setseed, and the row_number window caps
 * each category so one vendor's catalogue cannot dominate.
 */
const { rows } = await client.query(
  `with ranked as (
     select id, coalesce(name_ar, name_en) as line, category, source_key,
            row_number() over (partition by category order by md5(id::text || $1)) as rn
     from construction.items
     where active and coalesce(name_ar, name_en) is not null
       and length(coalesce(name_ar, name_en)) between 8 and 160
   )
   select id, line, category, source_key from ranked
   where rn <= $2
   order by md5(id::text || $1)
   limit $3`,
  [String(SEED), PER_CATEGORY_CAP, TARGET],
)
await client.end()

const hmac = (s) => createHmac('sha256', key).update(s).digest('hex').slice(0, 32)
const items = rows.map((r, i) => ({
  id: `HELD-${String(i + 1).padStart(3, '0')}`,
  line: r.line,
  category: r.category,
  source_key: r.source_key,
  supplier_id: r.id,
}))

writeFileSync(SET_PATH, items.map((it) => JSON.stringify(it)).join('\n') + '\n', { mode: 0o600 })

const byCategory = {}
for (const it of items) byCategory[it.category] = (byCategory[it.category] || 0) + 1
const manifest = {
  component: 'gold_set_component_4_fresh_heldout',
  drawn_at: '2026-09-17',
  source: 'construction.items (production) — real vendor product lines, database-only, never available to any ontology lane',
  why_unseen: 'ontology lanes work in the repository and have no database access; this vocabulary was never fittable',
  seed: SEED,
  per_category_cap: PER_CATEGORY_CAP,
  count: items.length,
  category_distribution: byCategory,
  plaintext_location: SET_PATH.replace(homedir(), '$HOME'),
  plaintext_mode: '0600, directory 0700, outside the repository',
  manifest_hmac: 'HMAC-SHA256, key at $HOME/.farq-gold-heldout/manifest-hmac.key, also outside the repository',
  may_read_plaintext: ['the measuring/adjudicating lane, when not concurrently tuning'],
  may_read_aggregates_only: ['ontology lane', 'API/Phase-2 lane', 'retriever+verifier lane'],
  redraw_required_after_measurements: 2,
  measured_count: 0,
  items: items.map((it) => ({ id: it.id, hmac: hmac(it.line), category: it.category })),
}
mkdirSync('fixtures/gold/heldout', { recursive: true })
writeFileSync('fixtures/gold/heldout/MANIFEST.json', JSON.stringify(manifest, null, 1))

console.log(`sealed ${items.length} items`)
console.log(`  plaintext : ${SET_PATH}  (mode 600, outside the repo)`)
console.log(`  manifest  : fixtures/gold/heldout/MANIFEST.json  (HMACs only)`)
console.log(`  categories: ${Object.keys(byCategory).length}`)
console.log(Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([k, v]) => `    ${String(v).padStart(3)}  ${k}`).join('\n'))
