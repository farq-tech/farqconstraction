/**
 * End-to-end check of the supplier upload against a running Farq API.
 *
 *   node scripts/verify-supplier-import.mjs                    # dry run, CSV and xlsx, compared
 *   node scripts/verify-supplier-import.mjs --format xlsx --commit
 *   node scripts/verify-supplier-import.mjs --sheet 3          # the merged-banner sheet
 *   node scripts/verify-supplier-import.mjs --revert <batchId>
 *
 * Runs the real parsers the UI ships over fixtures/suppliers/messy-supplier-list.{csv,xlsx}
 * and calls the real endpoint, so the numbers reported are measured rather than
 * predicted. Without --commit it stops after the dry run and writes nothing.
 *
 * The two formats hold the same nine rows. Comparing their verdicts row by row
 * is the point: a supplier list must not change meaning because it was saved
 * differently, and the xlsx path has hazards the CSV path does not — a phone
 * stored as a number, a cover sheet in front of the data, a merged title banner
 * pushing the header off row 1.
 */

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildSync } from 'esbuild'
import readXlsxFile from 'read-excel-file/node'

const API = process.env.API_BASE || 'http://127.0.0.1:3000'
const DEMO_USER = process.env.CONSTRUCTION_DEMO_BUYER_USER_ID || '44cdaadd-e084-4654-a84b-a95e6c920580'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const flag = (name, fallback = null) =>
  argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback
const COMMIT = argv.includes('--commit')
const SHEET = Number(flag('--sheet', '0')) || 0
const FORMAT = flag('--format', COMMIT ? 'xlsx' : 'both')

// ------------------------------------------------------- the shipped parsers
// Bundling the real modules rather than reimplementing them is what makes these
// numbers mean anything. The browser-only xlsx reader is left external: only
// `selectSupplierSheet`, which is pure, is exercised here.
const work = mkdtempSync(join(tmpdir(), 'farq-supplier-import-'))
const entry = join(work, 'entry.mjs')
writeFileSync(
  entry,
  `export { parseSupplierCsv } from ${JSON.stringify(join(here, '../src/lib/supplierImportCsv.ts'))}\n` +
    `export { selectSupplierSheet } from ${JSON.stringify(join(here, '../src/lib/supplierImportExcel.ts'))}\n`,
)
const bundle = join(work, 'parsers.mjs')
buildSync({
  entryPoints: [entry],
  outfile: bundle,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  external: ['read-excel-file/browser'],
  logLevel: 'error',
})
const { parseSupplierCsv, selectSupplierSheet } = await import(pathToFileURL(bundle).href)

// ------------------------------------------------------------------- the API

async function api(path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-construction-demo-user': DEMO_USER,
      ...(init.headers || {}),
    },
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || payload?.ok === false) {
    throw new Error(
      `${response.status} ${payload?.errors?.[0]?.code || payload?.message || ''} ${payload?.errors?.[0]?.message || ''}`,
    )
  }
  return payload.data
}

const revertId = argv.includes('--revert') ? argv[argv.indexOf('--revert') + 1] : null
if (revertId) {
  const out = await api(`/api/construction/suppliers/import-batches/${revertId}/revert`, { method: 'POST' })
  console.log(`REVERTED ${revertId} — deactivated ${out.deactivated_count}`)
  process.exit(0)
}

// ----------------------------------------------------------------- the files

function toInputs(parse) {
  return parse.rows.map((row) => ({
    row_number: row.rowNumber,
    name_ar: row.name_ar || row.name_en,
    name_en: row.name_en || undefined,
    city: row.city || undefined,
    email: row.email || undefined,
    whatsapp: row.whatsapp || undefined,
    contact_name: row.contact_name || undefined,
    supplied_items: row.supplied_items || undefined,
    cr_number: row.cr_number || undefined,
  }))
}

async function loadCsv() {
  const text = readFileSync(join(here, '../fixtures/suppliers/messy-supplier-list.csv'), 'utf8')
  const parse = parseSupplierCsv(text)
  return { name: 'messy-supplier-list.csv', note: 'نص CSV بترميز UTF-8 مع BOM', parse }
}

async function loadXlsx() {
  const path = join(here, '../fixtures/suppliers/messy-supplier-list.xlsx')
  const raw = await readXlsxFile(path)
  const workbook = selectSupplierSheet(raw)
  const index = SHEET
    ? workbook.sheets.findIndex((sheet) => sheet.position === SHEET)
    : workbook.selected
  const sheet = workbook.sheets[index]
  if (!sheet?.parse) throw new Error(`sheet ${SHEET || workbook.selected + 1} holds no suppliers`)
  console.log(
    `workbook sheets: ${workbook.sheets
      .map((s) => `${s.position}:«${s.name}»${s.parse ? '' : ' (no suppliers)'}${s.position === sheet.position ? ' ←read' : ''}`)
      .join('  ')}`,
  )
  return {
    name: 'messy-supplier-list.xlsx',
    note: `ورقة «${sheet.name}» — العناوين في الصف ${sheet.parse.headerRowNumber}`,
    parse: sheet.parse,
  }
}

function report(title, result) {
  console.log(`\n=== ${title} ===`)
  console.log(`rows=${result.row_count}  insert=${result.insert_count}  match=${result.match_count}  reject=${result.reject_count}`)
  if (result.batch?.id) console.log(`batch=${result.batch.id}  label=${result.batch.label || '—'}  file=${result.batch.filename || '—'}`)
  for (const row of result.rows) {
    const detail =
      row.outcome === 'MATCH'
        ? `matched_on=${row.matched_on} → «${row.matched_supplier_name}»`
        : row.outcome === 'REJECT'
          ? (row.reasons || []).map((reason) => `${reason.code}: ${reason.message_ar}`).join(' | ')
          : ''
    console.log(`  row ${String(row.row_number).padStart(2)}  ${row.outcome.padEnd(6)}  ${row.name}${detail ? '  — ' + detail : ''}`)
  }
}

async function dryRun(file) {
  const suppliers = toInputs(file.parse)
  console.log(`\n${'─'.repeat(72)}`)
  console.log(`FILE ${file.name} — ${file.note}`)
  console.log(`parsed ${file.parse.rows.length} rows; headers: ${file.parse.headers.join(' | ')}`)
  if (file.parse.unreadableRowNumbers.length) {
    console.log(`unreadable rows: ${file.parse.unreadableRowNumbers.join(', ')}`)
  }
  // The phone column is where the formats genuinely differ on disk.
  for (const row of suppliers) {
    if (row.whatsapp) console.log(`  phone as parsed — row ${row.row_number}: ${row.whatsapp}`)
  }
  const result = await api('/api/construction/suppliers/import', {
    method: 'POST',
    body: JSON.stringify({
      suppliers,
      dry_run: true,
      dedupe_scope: 'DIRECTORY',
      filename: file.name,
      label: 'قائمة اختبار',
    }),
  })
  report(`DRY RUN ${file.name} (nothing written)`, result)
  return { file, suppliers, result }
}

const wanted = FORMAT === 'both' ? ['csv', 'xlsx'] : [FORMAT]
const loaded = []
for (const format of wanted) loaded.push(await (format === 'csv' ? loadCsv() : loadXlsx()))

const runs = []
for (const file of loaded) runs.push(await dryRun(file))

// -------------------------------------------------------------- the comparison

if (runs.length === 2) {
  const [a, b] = runs
  console.log(`\n${'═'.repeat(72)}`)
  console.log('COMPARISON — same nine rows, two formats')
  const counts = (run) =>
    `${run.result.insert_count} inserted / ${run.result.match_count} matched / ${run.result.reject_count} rejected`
  console.log(`  ${a.file.name.padEnd(28)} ${counts(a)}`)
  console.log(`  ${b.file.name.padEnd(28)} ${counts(b)}`)

  // Row numbers legitimately differ when a banner shifts the header, so verdicts
  // are compared in order, and the row numbers are shown to be checked by eye.
  const differences = []
  a.result.rows.forEach((row, offset) => {
    const other = b.result.rows[offset]
    if (!other) return differences.push(`row ${row.row_number}: missing in ${b.file.name}`)
    if (row.outcome !== other.outcome) {
      differences.push(`row ${row.row_number}/${other.row_number}: ${row.outcome} vs ${other.outcome} — ${row.name}`)
    }
    if (row.outcome === 'MATCH' && row.matched_on !== other.matched_on) {
      differences.push(`row ${row.row_number}/${other.row_number}: matched on ${row.matched_on} vs ${other.matched_on}`)
    }
    const codes = (candidate) => (candidate.reasons || []).map((reason) => reason.code).sort().join(',')
    if (row.outcome === 'REJECT' && codes(row) !== codes(other)) {
      differences.push(`row ${row.row_number}/${other.row_number}: ${codes(row)} vs ${codes(other)}`)
    }
  })

  const sameCounts =
    a.result.insert_count === b.result.insert_count &&
    a.result.match_count === b.result.match_count &&
    a.result.reject_count === b.result.reject_count

  console.log(
    `\n  row numbers  csv: ${a.result.rows.map((row) => row.row_number).join(',')}`,
  )
  console.log(`               xlsx: ${b.result.rows.map((row) => row.row_number).join(',')}`)

  if (sameCounts && !differences.length) {
    console.log('\n  IDENTICAL — every row reached the same verdict for the same reason.')
  } else {
    console.log('\n  DIFFERENT:')
    for (const difference of differences) console.log(`    ${difference}`)
    process.exitCode = 1
  }
}

if (!COMMIT) {
  console.log('\n(dry run only — pass --commit to write)')
  process.exit(process.exitCode || 0)
}

if (runs.length !== 1) {
  console.error('\n--commit needs one --format; committing both would make the second run all matches.')
  process.exit(1)
}

const [only] = runs
const committed = await api('/api/construction/suppliers/import', {
  method: 'POST',
  body: JSON.stringify({
    suppliers: only.suppliers,
    dry_run: false,
    dedupe_scope: 'DIRECTORY',
    filename: only.file.name,
    label: `قائمة اختبار ${FORMAT}`,
    created_by_label: 'المالك',
  }),
})
report(`COMMITTED ${only.file.name}`, committed)

const { batches } = await api('/api/construction/suppliers/import-batches')
console.log('\n=== BATCHES ===')
for (const batch of batches.slice(0, 5)) {
  console.log(`  ${batch.id}  ${batch.label || '—'}  status=${batch.status}  live=${batch.live_supplier_count}  ins=${batch.inserted_count} match=${batch.matched_count} rej=${batch.rejected_count}`)
}
