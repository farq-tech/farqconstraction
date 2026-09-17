/**
 * READ-ONLY. The controlled tag vocabulary inside `supplied_items_text`.
 * This is the evidence Precision@5 will be judged against, so it has to be
 * enumerated BEFORE the criterion is written, not chosen afterwards.
 */
import pg from '/Users/m4pro/farq/api/node_modules/pg/lib/index.js'
import { config } from '/Users/m4pro/farq/api/node_modules/dotenv/lib/main.js'
import { writeFileSync } from 'node:fs'
config({ path: '/Users/m4pro/farq/api/.env' })

const conn = process.env.DATABASE_URL.replace(/([?&])sslmode=[^&]*/g, '$1').replace(/[?&]$/, '').replace(':5432/', ':6543/')
const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })
await client.connect()
await client.query('set default_transaction_read_only = on')
await client.query('set statement_timeout = 120000')

const r = await client.query(`
  with tags as (
    select trim(t) as tag, qualification_status
    from construction.suppliers s,
         unnest(string_to_array(s.supplied_items_text, ',')) as t
    where coalesce(s.supplied_items_text,'') <> ''
  )
  select tag,
         count(*)::int as suppliers,
         count(*) filter (where qualification_status = 'VERIFIED_DIRECTORY')::int as verified
  from tags
  where tag <> '' and tag !~ '[\u0600-\u06FF]'
  group by tag order by suppliers desc limit 200`)

console.log(`distinct latin tags (top 200 of the vocabulary):\n`)
for (const row of r.rows) console.log(`  ${String(row.suppliers).padStart(7)}  verified ${String(row.verified).padStart(5)}  ${row.tag}`)
writeFileSync('scripts/.gold-tag-vocabulary.json', JSON.stringify(r.rows, null, 1))

const tot = await client.query(`
  with tags as (
    select trim(t) as tag from construction.suppliers s, unnest(string_to_array(s.supplied_items_text, ',')) as t
    where coalesce(s.supplied_items_text,'') <> ''
  ) select count(distinct tag)::int as distinct_tags from tags where tag <> ''`)
console.log(`\ndistinct tags overall (incl. Arabic free text): ${tot.rows[0].distinct_tags}`)

await client.end()
