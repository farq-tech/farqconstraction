/**
 * Arabic display labels for ontology intent ids.
 *
 * Read straight from the ontology data so a label can never drift from the id
 * it names. Kept out of procurementOntology.ts on purpose: that module is the
 * resolver, and a display concern should not be a reason to edit it.
 */
import DATA from './procurementOntology.data.json'

type Labelled = { id?: unknown; label_ar?: unknown; intents?: unknown; categories?: unknown }

const LABELS = new Map<string, string>()
const FAMILY_LABELS = new Map<string, string>()
const INTENT_FAMILY = new Map<string, string>()

function collect(nodes: unknown): void {
  if (!Array.isArray(nodes)) return
  for (const raw of nodes) {
    const node = raw as Labelled
    if (!node || typeof node !== 'object') continue
    if (Array.isArray(node.intents)) {
      for (const intent of node.intents as Labelled[]) {
        if (typeof intent?.id === 'string' && typeof intent.label_ar === 'string' && intent.label_ar.trim()) {
          LABELS.set(intent.id, intent.label_ar.trim())
        }
      }
    }
    collect(node.categories)
  }
}

for (const family of ((DATA as { families?: Labelled[] }).families || [])) {
  if (typeof family?.id !== 'string') continue
  if (typeof family.label_ar === 'string' && family.label_ar.trim()) FAMILY_LABELS.set(family.id, family.label_ar.trim())
  const before = new Set(LABELS.keys())
  collect([family])
  for (const id of LABELS.keys()) if (!before.has(id)) INTENT_FAMILY.set(id, family.id)
}

/** The ontology's Arabic label for an intent id, or the id itself when it has none. */
export function intentLabelAr(id: string | null | undefined): string {
  const key = String(id || '')
  return LABELS.get(key) || key
}

/** The ontology's Arabic label for a family (a trade), or the id itself. */
export function familyLabelAr(id: string | null | undefined): string {
  const key = String(id || '')
  return FAMILY_LABELS.get(key) || key
}

/** Every material of the closed list, grouped for a picker: [{ family, label, intents: [{ id, label }] }]. */
export function intentChoices(): Array<{ family: string; label: string; intents: Array<{ id: string; label: string }> }> {
  const groups = new Map<string, Array<{ id: string; label: string }>>()
  for (const [id, label] of LABELS) {
    const family = INTENT_FAMILY.get(id) || ''
    if (!groups.has(family)) groups.set(family, [])
    groups.get(family)!.push({ id, label })
  }
  return [...groups.entries()]
    .map(([family, intents]) => ({ family, label: familyLabelAr(family), intents: intents.sort((a, b) => a.label.localeCompare(b.label, 'ar')) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ar'))
}
