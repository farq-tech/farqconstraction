/**
 * A fingerprint of everything a real send would change, read back through the
 * authenticated API rather than inferred from network quiet.
 *
 * Covers the four side effects that must not happen under the read-only build:
 * an RFQ's state, its invitations, its recipient rows, and anything the audit
 * timeline would record for a dispatch. Run it either side of a send attempt
 * and diff the two files.
 *
 *   FARQ_TOKEN=… node scripts/persisted-state-fingerprint.mjs <out.json>
 */
const OUT = process.argv[2]
const TOKEN = process.env.FARQ_TOKEN
const API = process.env.FARQ_API || 'https://api.farq.sa'
if (!TOKEN || !OUT) {
  console.error('usage: FARQ_TOKEN=… node scripts/persisted-state-fingerprint.mjs <out.json>')
  process.exit(2)
}

const get = async (path) => {
  const r = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${TOKEN}` } })
  if (!r.ok) throw new Error(`${r.status} ${path}`)
  return (await r.json()).data
}

const list = await get('/api/construction/rfqs?limit=100')
const fingerprint = { summary: list.summary, rfqs: {} }

for (const r of list.rfqs) {
  const d = await get(`/api/construction/rfqs/${r.id}`)
  const invitations = d.invitations || []
  fingerprint.rfqs[r.id] = {
    status: r.status,
    updated_at: r.updated_at,
    // Recipient rows and invitations are the same table from this side: one
    // row per supplier the RFQ was actually addressed to.
    invitation_count: invitations.length,
    recipient_emails: invitations
      .map((i) => i.supplier?.email || i.email || i.supplier_id || null)
      .filter(Boolean)
      .sort(),
    // Any dispatch writes an event here, so a send that left no timeline entry
    // left no trace of having been attempted server-side.
    audit_events: (d.audit_timeline || []).length,
    last_audit: (d.audit_timeline || []).at(-1) ?? null,
  }
}

const { writeFileSync } = await import('node:fs')
writeFileSync(OUT, JSON.stringify(fingerprint, null, 1))
console.log(
  `wrote ${OUT}: ${list.rfqs.length} RFQs · ${list.summary.rfq_count} total · ` +
    `${list.summary.supplier_count} supplier rows · ${list.summary.sent_count} sent`,
)
