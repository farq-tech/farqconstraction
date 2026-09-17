import pg from '/Users/m4pro/farq/api/node_modules/pg/lib/index.js'
import { config } from '/Users/m4pro/farq/api/node_modules/dotenv/lib/main.js'
config({ path: '/Users/m4pro/farq/api/.env' })
const conn = process.env.DATABASE_URL.replace(/([?&])sslmode=[^&]*/g,'$1').replace(/[?&]$/,'').replace(':5432/',':6543/')
const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })
await c.connect(); await c.query('set default_transaction_read_only = on')
const r = await c.query(`select l.line_number, left(coalesce(i.name_ar,i.name_en),90) as line, l.quantity, l.uom
  from construction.rfq_lines l left join construction.items i on i.id = l.item_id order by l.line_number`)
console.log('production rfq_lines:'); for (const row of r.rows) console.log('  '+JSON.stringify(row))
await c.end()
