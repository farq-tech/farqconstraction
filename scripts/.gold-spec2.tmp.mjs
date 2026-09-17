import pg from '/Users/m4pro/farq/api/node_modules/pg/lib/index.js'
import { config } from '/Users/m4pro/farq/api/node_modules/dotenv/lib/main.js'
import { writeFileSync } from 'node:fs'
config({ path: '/Users/m4pro/farq/api/.env' })
const conn = process.env.DATABASE_URL.replace(/([?&])sslmode=[^&]*/g,'$1').replace(/[?&]$/,'').replace(':5432/',':6543/')
const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })
await c.connect(); await c.query('set default_transaction_read_only = on')
const r = await c.query(`select specialty_id, specialty_level, count(*)::int n,
   count(distinct supplier_id)::int suppliers
   from construction.supplier_specialties where active group by 1,2 order by 4 desc limit 90`)
console.log('specialty vocabulary (active), by supplier count:')
for (const row of r.rows) console.log(`  ${String(row.suppliers).padStart(6)}  lvl=${row.specialty_level}  ${row.specialty_id}`)
writeFileSync('scripts/.gold-specialties.json', JSON.stringify(r.rows,null,1))
const k = await c.query(`select evidence_kind, count(*)::int n from construction.supplier_specialties group by 1 order by 2 desc`)
console.log('\nevidence_kind:'); for (const row of k.rows) console.log('  '+JSON.stringify(row))
const t = await c.query(`select count(distinct specialty_id)::int distinct_specialties from construction.supplier_specialties where active`)
console.log('\n'+JSON.stringify(t.rows[0]))
await c.end()
