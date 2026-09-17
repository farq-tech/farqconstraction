/**
 * Turn the 102 exposures into real lines and resolve them. A structural
 * exposure only matters if a plausible booklet line misresolves.
 */
import { createServer } from 'vite'
import { readFileSync } from 'node:fs'

const server = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const m = await server.ssrLoadModule('/src/lib/procurementOntology.ts')
const DATA = JSON.parse(readFileSync('src/lib/procurementOntology.data.json', 'utf8'))
const sectorOf = new Map(DATA.families.map((f) => [f.id, f.sector]))

const R = (line) => {
  const r = m.resolveOntology(line)
  return r
}
const show = (label, line) => {
  const r = R(line)
  const fam = r?.family ?? '-'
  const intent = r?.intent ?? '-'
  console.log(
    `  ${label.padEnd(30)} «${line}»\n` +
    `      family=${fam} [${sectorOf.get(fam) ?? '-'}] intent=${intent} conf=${(r?.confidence ?? 0).toFixed(2)} poolable=${r?.poolable} path=${r?.path ?? r?.method ?? '-'}`,
  )
  return r
}

console.log('=== 1. the case the exemption was built for (must still work) ===')
show('glass sliding door', 'باب زجاجي سحاب')
show('glass door, non-nisba', 'باب زجاج')
show('wood door', 'باب خشبي')

console.log('\n=== 2. the case the gate must still refuse (mineral vs metal) ===')
show('mineral fibre (insulation)', 'الياف معدنيه')
show('metal ceiling tile', 'بلاطه سقف معدني')
show('glass fibre (admixture)', 'الياف زجاجيه')
show('GRP water tank', 'خزان الياف زجاجيه')
show('glass wool (insulation)', 'صوف زجاجي')

console.log('\n=== 3. ATTACK: generic head, derivation still free ===')
// «لوح» is owned by 7 families, so it pins nothing; inside a multi-word term the
// exemption lets the neighbouring word derive without evidence.
show('steel sheet', 'لوح حديد')
show('steel-toe boot (footwear)', 'حذاء سلامه بمقدمه حديديه')
show('steel fibre (admixture)', 'الياف حديديه')
show('ironmongery (doors)', 'حديديات')
show('tablet device', 'جهاز لوحي')
show('board, generic', 'لوح')
show('mesh filter (irrigation)', 'فلتر شبكي')
show('rebar mesh', 'شبك حديد')
show('network printer', 'طابعه شبكيه')
show('ceiling fan', 'مروحه سقفيه')
show('ceiling tile', 'بلاطه سقف')
show('pendent sprinkler', 'رشاش هبوطي')
show('earthing down conductor', 'موصل هبوط')
show('acoustic gypsum board', 'لوح جبس صوتي')
show('sound level meter', 'مقياس صوت')
show('vertical drill', 'مثقاب عمودي')
show('cladding column', 'عمود')

await server.close()
