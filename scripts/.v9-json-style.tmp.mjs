/**
 * Serializer matching the payload's hand-written style: 2-space indent, arrays
 * of scalars kept on one line, arrays of objects expanded. Verified by
 * round-tripping the frozen v8 payload byte-for-byte before it is trusted.
 */
import { readFileSync, writeFileSync } from 'node:fs'

export function stringify(value, indent = 0) {
  const pad = ' '.repeat(indent)
  const padIn = ' '.repeat(indent + 2)
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    const scalars = value.every((v) => v === null || typeof v !== 'object')
    if (scalars) return `[${value.map((v) => JSON.stringify(v)).join(', ')}]`
    return `[\n${value.map((v) => padIn + stringify(v, indent + 2)).join(',\n')}\n${pad}]`
  }
  const entries = Object.entries(value)
  if (!entries.length) return '{}'
  return `{\n${entries
    .map(([k, v]) => `${padIn}${JSON.stringify(k)}: ${stringify(v, indent + 2)}`)
    .join(',\n')}\n${pad}}`
}

if (process.argv[2] === '--verify') {
  const path = process.argv[3]
  const original = readFileSync(path, 'utf8')
  const out = `${stringify(JSON.parse(original))}\n`
  console.log(out === original ? 'ROUND-TRIP EXACT' : 'DIFFERS')
  if (out !== original) {
    const a = original.split('\n')
    const b = out.split('\n')
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) {
        console.log(`first diff line ${i + 1}\n  orig: ${a[i]}\n  ours: ${b[i]}`)
        break
      }
    }
  }
}

if (process.argv[2] === '--write') {
  const path = process.argv[3]
  writeFileSync(path, `${stringify(JSON.parse(readFileSync(path, 'utf8')))}\n`)
  console.log('rewritten')
}
