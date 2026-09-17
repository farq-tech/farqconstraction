/**
 * EVERY NUMBER IS A (PAYLOAD, CODE) PAIR.
 *
 * The attribute-clause rule lives in the resolver, not in the JSON, so quoting
 * a payload hash alone does not identify what was measured. And a frozen
 * version is only a real baseline if it can be rebuilt from what is recorded —
 * otherwise a claim like "26 intents added, 0 removed" cannot be checked by
 * anyone, including its author.
 *
 * This script rebuilds each recorded version from its base commit plus its
 * patch, in a scratch directory, and compares both hashes. It prints plainly
 * which versions are reconstructible and which are not, rather than implying
 * that all of them are.
 *
 *   node scripts/verify-ontology-provenance.mjs
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PAYLOAD = 'src/lib/procurementOntology.data.json'
const RESOLVER = 'src/lib/procurementOntology.ts'

/**
 * Each entry says: start at `base`, apply `patch`, expect these hashes.
 *
 * `reverse_of` means the version is reached by UNDOING a later patch, which is
 * how a version frozen before the snapshot commit can still be recovered.
 */
const VERSIONS = [
  {
    version: 'cpo-v5',
    base: '13ea40a5fe6ba1055c2da3fb90dff16336424cf1',
    patch: '.handoff/cpo-v6-civil-families-and-head-concept.patch',
    reverse_of: true,
    payload_sha16: '97eb29e8e68a6036',
    // DELIBERATELY UNRECORDED. The resolver side of the v6 patch was cut
    // against a reconstructed baseline rather than against a commit, so one of
    // its five hunks no longer matches and the v5 RESOLVER cannot be rebuilt
    // byte-for-byte. The payload can. Stated rather than papered over.
    resolver_sha16: null,
    note: 'payload reconstructible; resolver is NOT (1 of 5 hunks stale)',
  },
  {
    version: 'cpo-v6',
    base: '13ea40a5fe6ba1055c2da3fb90dff16336424cf1',
    patch: null, // it IS the base commit
    payload_sha16: '1483e668f2d3012f',
    resolver_sha16: 'ae4000614c97c025',
    note: 'committed as the snapshot, so both halves are in git',
  },
  {
    version: 'cpo-v7',
    base: '13ea40a5fe6ba1055c2da3fb90dff16336424cf1',
    patch: '.handoff/cpo-v7-clause-prepositions-and-tier-parity.patch',
    payload_sha16: '1c0a340ec23a58fb',
    resolver_sha16: '7f152fb1887572ae',
    note: 'base commit + one patch rebuilds payload and resolver exactly',
  },
  {
    version: 'cpo-v8',
    base: '13ea40a5fe6ba1055c2da3fb90dff16336424cf1',
    patch: '.handoff/cpo-v8-rating-vocabulary-and-supply-chokepoint.patch',
    payload_sha16: '03fc7b2251bd6762',
    resolver_sha16: 'ad285bc1b648b3a7',
    note: 'base commit + one patch rebuilds payload and resolver exactly',
  },
  {
    version: 'cpo-v9',
    base: '13ea40a5fe6ba1055c2da3fb90dff16336424cf1',
    patch: '.handoff/cpo-v9-supplier-register-and-computed-predicate.patch',
    payload_sha16: 'f93c05e3a1c151cc',
    resolver_sha16: 'f1e4a97a2049b1a1',
    note: 'base commit + one patch rebuilds payload and resolver exactly',
  },
  {
    version: 'cpo-v10',
    base: '13ea40a5fe6ba1055c2da3fb90dff16336424cf1',
    patch: '.handoff/cpo-v10-arabic-inflection-class.patch',
    payload_sha16: 'fafa97d20586ca1f',
    resolver_sha16: 'd6a2d876af6757a6',
    note: 'base commit + one patch rebuilds payload and resolver exactly',
  },
  {
    version: 'cpo-v11',
    base: '13ea40a5fe6ba1055c2da3fb90dff16336424cf1',
    patch: '.handoff/cpo-v11-sector-signal-and-mineral-vocabulary.patch',
    payload_sha16: 'dfb34f19c807563f',
    resolver_sha16: 'a3e96860aa9aedb6',
    note: 'base commit + one patch rebuilds payload and resolver exactly; NOT the landing target — v10 is',
  },
]

const sha16 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16)
const repo = process.cwd()
let failures = 0

for (const v of VERSIONS) {
  const dir = mkdtempSync(join(tmpdir(), `cpo-${v.version}-`))
  try {
    execFileSync('sh', ['-c', `git archive ${v.base} 2>/dev/null | tar -x -C '${dir}'`], { cwd: repo })
    if (v.patch) {
      const args = ['apply', ...(v.reverse_of ? ['-R'] : []), '--include', PAYLOAD, join(repo, v.patch)]
      if (v.resolver_sha16) args.splice(args.indexOf('--include'), 2)
      try {
        execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
      } catch (err) {
        console.log(`  ${v.version.padEnd(8)} PATCH DID NOT APPLY — ${v.patch}`)
        failures++
        continue
      }
    }
    const got = {
      payload: sha16(readFileSync(join(dir, PAYLOAD))),
      resolver: sha16(readFileSync(join(dir, RESOLVER))),
    }
    const payloadOk = got.payload === v.payload_sha16
    const resolverOk = v.resolver_sha16 === null ? null : got.resolver === v.resolver_sha16
    if (!payloadOk || resolverOk === false) failures++
    const mark = (ok) => (ok === null ? 'NOT RECORDED' : ok ? 'ok' : `MISMATCH (${got.payload})`)
    console.log(`  ${v.version.padEnd(8)} payload ${mark(payloadOk).padEnd(14)} resolver ${resolverOk === null ? 'NOT RECONSTRUCTIBLE' : resolverOk ? 'ok' : `MISMATCH (${got.resolver})`}`)
    console.log(`           ${v.note}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// The working tree must be one of the recorded versions, or the numbers being
// reported right now belong to no version at all.
const tree = {
  payload: sha16(readFileSync(join(repo, PAYLOAD))),
  resolver: sha16(readFileSync(join(repo, RESOLVER))),
}
const match = VERSIONS.find((v) => v.payload_sha16 === tree.payload && v.resolver_sha16 === tree.resolver)
console.log(
  `\n  working tree: payload ${tree.payload} resolver ${tree.resolver} -> ${match ? match.version : 'UNRECORDED — freeze it or say so'}`,
)
if (!match) failures++

process.exit(failures ? 1 : 0)
