/**
 * READ-ONLY. Candidate sources for the two components that must come from
 * reality: the 60-line real RFQ, and the fresh held-out sample.
 *
 * Production buyer-entered lines are the strongest candidate for "unseen",
 * because no ontology lane has database access — the vocabulary was never
 * fitted to them, and they are what the owner actually sends.
 */
import pg from '/Users/m4pro/farq/api/node_modules/pg/lib/index.js'
import { config } from '/Users/m4pro/farq/api/node_modules/dotenv/lib/main.js'
config({ path: '/Users/m4pro/farq/api/.env' })

const conn = process.env.DATABASE_URL.replace(/([?&])sslmode=[^&]*/g, '$1').replace(/[?&]$/, '').replace(':5432/', ':6543/')
const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })
await client.connect()
await client.query('set default_transaction_read_only = on')
await client.query('set statement_timeout = 120000')

const q = async (label, sql) => {
  try {
    const r = await client.query(sql)
    console.log(`\n--- ${label} ---`)
    for (const row of r.rows) console.log('  ' + JSON.stringify(row).slice(0, 220))
  } catch (e) { console.log(`\n--- ${label} --- ERROR ${e.message}`) }
}

await q('rfqs and lines', `
  select (select count(*) from construction.rfqs)::int rfqs,
         (select count(*) from construction.rfq_lines)::int rfq_lines,
         (select count(*) from construction.items)::int items,
         (select count(*) from construction.item_specifications)::int item_specs`)

await q('rfq_lines columns', `select column_name from information_schema.columns where table_schema='construction' and table_name='rfq_lines' order by ordinal_position`)
await q('items columns', `select column_name from information_schema.columns where table_schema='construction' and table_name='items' order by ordinal_position`)
await q('rfqs by department and date', `select left(rfq_token,3) dept, count(*)::int n, min(created_at)::date first, max(created_at)::date last from construction.rfqs group by 1 order by 2 desc limit 12`)
await q('sample real item names', `select left(coalesce(name_ar,name_en),110) as line from construction.items order by created_at desc limit 25`)

await client.end()
