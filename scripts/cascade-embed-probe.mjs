/**
 * DOES THE EMBEDDING MODEL ACTUALLY UNDERSTAND ARABIC CONSTRUCTION TERMS?
 *
 * Asked before choosing one, because a model that returns 768 numbers for
 * Arabic text looks exactly like a model that understands it, and the failure is
 * silent: retrieval still returns a ranked list, the list is just noise wearing
 * the shape of an answer. That is the substitution the brief forbids, so it is
 * measured here rather than assumed.
 *
 * The probes are the trade distinctions that have actually bitten this system:
 * mineral fibre against metal, irrigation against fire sprinklers, rebar
 * against ready-mix, conduit against cable. Each is a triple (anchor, the term
 * it SHOULD sit closer to, the term it must NOT). A model passes a probe when
 * cos(anchor, right) > cos(anchor, wrong). Four probes is not a benchmark; it is
 * a floor, and a model that cannot clear it cannot be trusted on 218 documents.
 */
const HOST = process.env.OLLAMA_HOST || 'http://localhost:11434'
const MODELS = process.argv.slice(2).length ? process.argv.slice(2) : ['nomic-embed-text', 'granite-embedding:278m', 'bge-m3']

const PROBES = [
  ['ألياف معدنية', 'صوف صخري للعزل الحراري', 'باب معدني من الصلب'],
  ['رشاش ري بالتنقيط للحدائق', 'شبكة ري زراعية', 'رشاش إطفاء حريق سبرنكلر'],
  ['حديد تسليح للخرسانة المسلحة', 'أسياخ حديد قطر 16 مم', 'خرسانة جاهزة بالخلاطة'],
  ['مواسير كهرباء بي في سي للتمديدات', 'كوندويت حماية أسلاك', 'كابل نحاس معزول جهد منخفض'],
  ['لوحة توزيع كهربائية', 'لوحات توزيع رئيسية', 'لوح جبس للأسقف'],
  ['حرائق', 'مكافحة الحريق', 'أرضيات بورسلان'],
]

const cos = (a, b) => {
  let d = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return d / Math.sqrt(na * nb)
}

async function embed(model, prompt) {
  const res = await fetch(`${HOST}/api/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, prompt }),
  })
  if (!res.ok) throw new Error(`${model}: ${res.status} ${await res.text()}`)
  const body = await res.json()
  if (!Array.isArray(body.embedding)) throw new Error(`${model}: no embedding in response`)
  return body.embedding
}

for (const model of MODELS) {
  let passed = 0
  const rows = []
  try {
    for (const [anchor, right, wrong] of PROBES) {
      const [a, r, w] = await Promise.all([embed(model, anchor), embed(model, right), embed(model, wrong)])
      const sr = cos(a, r)
      const sw = cos(a, w)
      if (sr > sw) passed++
      rows.push(`    ${sr > sw ? 'PASS' : 'FAIL'}  right ${sr.toFixed(3)}  wrong ${sw.toFixed(3)}  margin ${(sr - sw).toFixed(3)}  ::  ${anchor}`)
    }
  } catch (error) {
    console.log(`${model}: UNAVAILABLE — ${error.message}`)
    continue
  }
  console.log(`\n${model} — ${passed}/${PROBES.length} probes passed`)
  for (const row of rows) console.log(row)
}
