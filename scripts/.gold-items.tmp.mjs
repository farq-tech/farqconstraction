import pg from '/Users/m4pro/farq/api/node_modules/pg/lib/index.js'
import { config } from '/Users/m4pro/farq/api/node_modules/dotenv/lib/main.js'
config({ path: '/Users/m4pro/farq/api/.env' })
const conn = process.env.DATABASE_URL.replace(/([?&])sslmode=[^&]*/g,'$1').replace(/[?&]$/,'').replace(':5432/',':6543/')
const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })
await c.connect(); await c.query('set default_transaction_read_only = on')
for (const [label, sql] of [
  ['items by category', `select category, count(*)::int n from construction.items group by 1 order by 2 desc limit 25`],
  ['items by source_key prefix', `select split_part(source_key,'-',1) src, count(*)::int n from construction.items group by 1 order by 2 desc limit 12`],
  ['custom vs catalog', `select is_custom, count(*)::int n from construction.items group by 1`],
  ['non-RAK sample', `select left(coalesce(name_ar,name_en),100) line, category from construction.items where coalesce(name_ar,'') not like 'راك%' order by random() limit 20`],
]) {
  try { const r = await c.query(sql); console.log(`\n--- ${label} ---`); for (const row of r.rows) console.log('  '+JSON.stringify(row).slice(0,200)) }
  catch (e) { console.log(`\n--- ${label} --- ERROR ${e.message}`) }
}
await c.end()
