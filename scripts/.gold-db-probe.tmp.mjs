/**
 * READ-ONLY probe of the production supplier side. No writes, no DDL.
 * Every statement here is a SELECT, and the session is set read-only first.
 */
import pg from '/Users/m4pro/farq/api/node_modules/pg/lib/index.js'
import { config } from '/Users/m4pro/farq/api/node_modules/dotenv/lib/main.js'
config({ path: '/Users/m4pro/farq/api/.env' })

// Session mode (5432) is capped at 20 clients and was saturated; transaction
// mode (6543) is the right port for a short read-only probe.
const conn = process.env.DATABASE_URL.replace(/([?&])sslmode=[^&]*/g, '$1').replace(/[?&]$/, '').replace(':5432/', ':6543/')
const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })
await client.connect()
await client.query('set default_transaction_read_only = on')
await client.query('set statement_timeout = 60000')

const q = async (label, sql) => {
  try {
    const r = await client.query(sql)
    console.log(`\n--- ${label} ---`)
    console.log(JSON.stringify(r.rows, null, 1).slice(0, 2600))
  } catch (e) {
    console.log(`\n--- ${label} --- ERROR: ${e.message}`)
  }
}

await q('supplier directory size', `select count(*)::int as suppliers from construction.suppliers`)
await q('supplier columns', `select column_name, data_type from information_schema.columns where table_schema='construction' and table_name='suppliers' order by ordinal_position`)
await q('intent_supplier_map state', `select count(*)::int rows, count(distinct intent_key)::int intents, min(builder_version) minv, max(builder_version) maxv from construction.intent_supplier_map`)
await q('map ontology fingerprints', `select distinct source_fingerprint from construction.intent_supplier_map limit 5`)
await q('tables in construction schema', `select table_name from information_schema.tables where table_schema='construction' order by table_name`)

await client.end()
