import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The construction app answers on `construction.farq.sa`.
 *
 * Two things must stay true for that to keep working, and neither is visible
 * from inside a component:
 *
 *  1. the bundle assumes no base path, so every asset and route resolves from
 *     the domain root rather than from a project-specific prefix;
 *  2. no source file hard-codes the deployment address it used to live at, or
 *     `bina.farq.sa` — which now serves a different product, «فرق سَعِّر»,
 *     and has nothing to do with this app.
 */

const repoRoot = join(import.meta.dirname, '../..')

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    // AppleDouble sidecars on exFAT are binary; skip them like vitest does.
    if (entry.startsWith('._') || entry === 'node_modules') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, acc)
    else if (/\.(ts|tsx|css|html)$/.test(entry)) acc.push(full)
  }
  return acc
}

describe('deployment host', () => {
  it('builds from the domain root, with no base path assumption', () => {
    const config = readFileSync(join(repoRoot, 'vite.config.ts'), 'utf8')
    // The only base override is Figma's own preview host, which sets
    // FIGMA_PUBLIC_URL. Anything else would break construction.farq.sa.
    expect(config).toContain(
      "base: process.env.FIGMA_PUBLIC_URL ? `${process.env.FIGMA_PUBLIC_URL}/` : '/'",
    )
  })

  it('serves the SPA from the root on every path', () => {
    const vercel = JSON.parse(
      readFileSync(join(repoRoot, 'vercel.json'), 'utf8'),
    ) as { rewrites: Array<{ source: string; destination: string }> }
    const catchAll = vercel.rewrites.at(-1)
    expect(catchAll?.destination).toBe('/index.html')
    expect(catchAll?.source).toBe('/((?!assets/).*)')
  })

  it('hard-codes neither the old deployment address nor bina.farq.sa', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(join(repoRoot, 'src'))) {
      if (file.endsWith('appHost.test.ts')) continue
      const text = readFileSync(file, 'utf8')
      if (/farq-construction\.vercel\.app|bina\.farq\.sa/.test(text)) {
        offenders.push(file.slice(repoRoot.length + 1))
      }
    }
    expect(offenders).toEqual([])
  })
})
