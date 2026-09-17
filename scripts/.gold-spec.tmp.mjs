import pg from '/Users/m4pro/farq/api/node_modules/pg/lib/index.js'
import { config } from '/Users/m4pro/farq/api/node_modules/dotenv/lib/main.js'
config({ path: '/Users/m4pro/farq/api/.env' })
const conn = process.env.DATABASE_URL.replace(/([?&])sslmode=[^&]*/g,'$1').replace(/[?&]$/,'').replace(':5432/',':6543/')
const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })
await c.connect(); await c.query('set default_transaction_read_only = on')
for (const [l,s] of [
  ['supplier_specialties', `select count(*)::int rows, count(distinct supplier_id)::int suppliers from construction.supplier_specialties`],
  ['specialty columns', `select column_name from information_schema.columns where table_schema='construction' and table_name='supplier_specialties' order by ordinal_position`],
  ['top specialties', `select specialty, count(*)::int n from construction.supplier_specialties group by 1 order by 2 desc limit 25`],
  ['capabilities sample', `select specialty_or_item, count(*)::int n from construction.supplier_item_capabilities group by 1 order by 2 desc limit 15`],
]) { try { const r = await c.query(s); console.log(`\n--- ${l} ---`); for (const row of r.rows) console.log('  '+JSON.stringify(row).slice(0,180)) } catch(e){ console.log(`\n--- ${l} --- ERROR ${e.message}`) } }
await c.end()
