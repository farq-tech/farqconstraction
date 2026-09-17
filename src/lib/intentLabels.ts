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

collect((DATA as { families?: unknown }).families)

/** The ontology's Arabic label for an intent id, or the id itself when it has none. */
export function intentLabelAr(id: string | null | undefined): string {
  const key = String(id || '')
  return LABELS.get(key) || key
}
