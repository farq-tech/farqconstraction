/**
 * Mirrors UploadView → parseBoqFile against a real PDF on disk.
 * Usage: node scripts/parse-upload-fixture.mjs [path-to.pdf]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'

const pdfPath = resolve(
  process.argv[2] ||
    'fixtures/boq/site-safety-02.pdf',
)

const log = (step, data) => {
  console.log(`\n=== ${step} ===`)
  console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2))
}

const bytes = readFileSync(pdfPath)
log('file', { path: pdfPath, bytes: bytes.length, name: basename(pdfPath) })

// Step A: raw pdfjs-dist (same module UploadView/parseBoq uses)
let textViaMain = ''
let textViaLegacy = ''
try {
  const pdfjs = await import('pdfjs-dist')
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
      resolve('node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
    ).href
  } catch (e) {
    console.warn('workerSrc set failed', e.message)
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise
  const parts = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const strs = content.items.map((i) => ('str' in i ? i.str : '')).filter(Boolean)
    parts.push(strs.join(' '))
    parts.push(strs.join('\t'))
  }
  textViaMain = parts.join('\n')
  log('pdfjs-dist extract', { pages: doc.numPages, chars: textViaMain.length, hasSITE: /SITE-/.test(textViaMain), hasTawreed: (textViaMain.match(/توريد/g) || []).length })
} catch (e) {
  log('pdfjs-dist FAIL', { message: e?.message, stack: String(e?.stack || e).slice(0, 500) })
}

try {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise
  const parts = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const strs = content.items.map((i) => ('str' in i ? i.str : '')).filter(Boolean)
    parts.push(strs.join(' '))
  }
  textViaLegacy = parts.join('\n')
  log('pdfjs-legacy extract', { pages: doc.numPages, chars: textViaLegacy.length })
} catch (e) {
  log('pdfjs-legacy FAIL', { message: e?.message })
}

// Step B: exact UploadView entrypoint parseBoqFile via Vite SSR (same source tree)
const server = await createServer({
  configFile: './vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom',
})

try {
  const mod = await server.ssrLoadModule('/src/lib/parseBoq.ts')

  // Patch fetch so construction API soft-fails like offline preview
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    log('fetch attempted', { url: url.slice(0, 120), method: init?.method || 'GET' })
    // Simulate API unavailable / weak — reject so parseBoq falls through to client
    throw new TypeError(`Network request failed (fixture harness): ${url}`)
  }

  // File polyfill for Node
  const FileImpl =
    globalThis.File ||
    class FilePolyfill extends Blob {
      constructor(parts, name, opts = {}) {
        super(parts, opts)
        this.name = name
        this.lastModified = opts.lastModified || Date.now()
      }
    }
  if (!globalThis.File) globalThis.File = FileImpl

  const file = new FileImpl([bytes], basename(pdfPath), { type: 'application/pdf' })
  log('File constructed', { name: file.name, type: file.type, size: file.size })

  const t0 = Date.now()
  const result = await mod.parseBoqFile(file)
  log('parseBoqFile RESULT (UploadView entrypoint)', {
    ms: Date.now() - t0,
    source: result.source,
    rawLineCount: result.rawLineCount,
    items: result.items.length,
    projectName: result.projectName,
    documentId: String(result.documentId || '').slice(0, 16),
    matchWarning: result.matchWarning,
    sampleNames: result.items.slice(0, 8).map((i) => i.name),
    sampleIds: result.items.slice(0, 8).map((i) => i.id),
  })

  // Also show resolveParsedLines alone on extracted text
  const text = textViaMain || textViaLegacy
  const resolved = mod.resolveParsedLines({
    apiLines: [
      { id: 1, name: 'api-junk-1', qty: '1', unit: 'عدد' },
      { id: 2, name: 'api-junk-2', qty: '1', unit: 'عدد' },
      { id: 3, name: 'api-junk-3', qty: '1', unit: 'عدد' },
      { id: 4, name: 'api-junk-4', qty: '1', unit: 'عدد' },
      { id: 5, name: 'api-junk-5', qty: '1', unit: 'عدد' },
    ],
    text,
    fileName: file.name,
  })
  log('resolveParsedLines with junk API + client text', {
    lines: resolved.lines.length,
    source: resolved.source,
    samples: resolved.lines.slice(0, 5).map((l) => l.name),
  })

  writeFileSync(
    'fixtures/boq/last-parse-upload-fixture.json',
    JSON.stringify(
      {
        pdfPath,
        bytes: bytes.length,
        parseBoqFile: {
          items: result.items.length,
          source: result.source,
          samples: result.items.slice(0, 10).map((i) => ({ id: i.id, name: i.name, qty: i.qty, unit: i.unit })),
        },
      },
      null,
      2,
    ),
  )

  if (result.items.length === 0) {
    console.error('\nFAIL: parseBoqFile returned 0 items — live UploadView would show empty error')
    process.exitCode = 1
  } else {
    console.log(`\nOK: parseBoqFile returned ${result.items.length} items`)
  }

  globalThis.fetch = originalFetch
} finally {
  await server.close()
}
