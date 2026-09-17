/**
 * Per-line resolution dump for the 10,219-line catalogue, so two ontology
 * payloads can be diffed line by line rather than compared on totals.
 *
 * Totals hide the two things that matter: which specific lines a guard stopped,
 * and whether any correct resolution was lost to make that happen.
 *
 *   node scripts/.guard-diff.tmp.mjs --out /tmp/lines.json
 */
import { createServer } from 'vite'
import { writeFileSync } from 'node:fs'
import readXlsxFile from 'read-excel-file/node'

const args = process.argv.slice(2)
const argOf = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const FILE = argOf('--file', '/Users/m4pro/Downloads/بنود_مناقصات_مقاولات_عامة_10219_بند.xlsx')
const OUT = argOf('--out', '/tmp/lines.json')

const SHEET = 'بنود_المقاولات'
const COL = { n: 0, department: 1, category: 2, item: 3, unit: 5 }

const book = await readXlsxFile(FILE, { getSheets: true })
const sheet = book.find((s) => s.sheet === SHEET)
const header = sheet.data[0]
if (String(header[COL.item]) !== 'البند') throw new Error('wrong item column')

const lines = sheet.data.slice(1).map((r, i) => ({
  id: String(r[COL.n] ?? i),
  item: String(r[COL.item] ?? '').trim(),
  department: String(r[COL.department] ?? ''),
  category: String(r[COL.category] ?? ''),
}))

const server = await createServer({
  configFile: './vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
})
try {
  const cpo = await server.ssrLoadModule('/src/lib/procurementOntology.ts')
  const batch = cpo.resolveOntologyBatch(lines.map((l) => ({ id: l.id, name: l.item })))
  const byId = new Map(batch.lines.map((row) => [String(row.line_id), row.resolution]))
  const out = lines.map((l) => {
    const r = byId.get(l.id)
    return {
      id: l.id,
      item: l.item,
      department: l.department,
      category: l.category,
      level: r.level_code,
      sector: r.sector,
      family: r.family,
      intent: r.intent,
      poolable: r.poolable,
      pool_key: r.pool_key,
      matched_term: r.debug?.matched_term ?? null,
      decided_by: r.debug?.decided_by ?? null,
    }
  })
  writeFileSync(OUT, JSON.stringify({ ontology_version: cpo.ONTOLOGY_VERSION, lines: out }, null, 1))
  console.log(`${cpo.ONTOLOGY_VERSION}: ${out.length} lines -> ${OUT}`)
} finally {
  await server.close()
}
