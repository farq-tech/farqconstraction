/**
 * READ-ONLY. What the supply side actually contains, because the end-to-end
 * metrics the owner asked for are bounded by it: Precision@5 is meaningless if
 * there is no evidence to be precise about, and every zero has to be
 * attributable to a defect or to an honest absence.
 */
import pg from '/Users/m4pro/farq/api/node_modules/pg/lib/index.js'
import { config } from '/Users/m4pro/farq/api/node_modules/dotenv/lib/main.js'
config({ path: '/Users/m4pro/farq/api/.env' })

const conn = process.env.DATABASE_URL.replace(/([?&])sslmode=[^&]*/g, '$1').replace(/[?&]$/, '').replace(':5432/', ':6543/')
const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })
await client.connect()
await client.query('set default_transaction_read_only = on')

const q = async (label, sql) => {
  try {
    const r = await client.query(sql)
    console.log(`\n--- ${label} ---`)
    for (const row of r.rows) console.log('  ' + JSON.stringify(row))
  } catch (e) {
    console.log(`\n--- ${label} --- ERROR ${e.message}`)
  }
}

await q('directory totals', `
  select count(*)::int total,
         count(*) filter (where active)::int active,
         count(*) filter (where coalesce(supplied_items_text,'') <> '')::int with_items_text,
         count(*) filter (where active and coalesce(supplied_items_text,'') <> '')::int active_with_items,
         count(*) filter (where legal_entity_verified)::int legal_verified
  from construction.suppliers`)

await q('directory_visibility', `select directory_visibility, count(*)::int from construction.suppliers group by 1 order by 2 desc limit 10`)
await q('qualification_status', `select qualification_status, count(*)::int from construction.suppliers group by 1 order by 2 desc limit 10`)
await q('business_type', `select business_type, count(*)::int from construction.suppliers group by 1 order by 2 desc limit 12`)
await q('source_system', `select source_system::text, count(*)::int from construction.suppliers group by 1 order by 2 desc limit 10`)

// Product-level evidence, which is the other place a pool could come from.
await q('catalog_products', `select count(*)::int products, count(distinct supplier_id)::int suppliers_with_products from construction.catalog_products`)
await q('supplier_item_capabilities', `select count(*)::int rows, count(distinct supplier_id)::int suppliers from construction.supplier_item_capabilities`)

// What the searchable text looks like for the ones that have it.
await q('sample of suppliers WITH items text', `
  select left(coalesce(name_ar, name_en), 40) as name, left(supplied_items_text, 90) as items, city, qualification_status
  from construction.suppliers
  where coalesce(supplied_items_text,'') <> '' and active
  limit 8`)

// And the shape of a typical directory row that has NO product evidence.
await q('sample of suppliers WITHOUT items text', `
  select left(coalesce(name_ar, name_en), 50) as name, business_type, city, directory_visibility
  from construction.suppliers
  where coalesce(supplied_items_text,'') = '' and active
  limit 6`)

await client.end()
