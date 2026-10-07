import type { SupplierPlan } from './supplierPlan'

/** Expand all displayed strong evidence, rather than the capped default selection. */
export function extraPlanSuppliers(plan: SupplierPlan) {
  const found = new Map<string, Set<string>>()
  const alreadyInvited = new Set<string>()
  const lanes = [...plan.lines.map(l => ({ ...l, keys: [l.key] })), ...plan.contractors.map(l => ({ ...l, keys: l.line_keys }))]
  for (const lane of lanes) for (const supplier of lane.suppliers) {
    if (supplier.invited) alreadyInvited.add(supplier.id)
    if (supplier.invited || !supplier.sendable || supplier.tier !== 'STRONG') continue
    const keys = found.get(supplier.id) || new Set<string>()
    for (const key of lane.keys) keys.add(key)
    found.set(supplier.id, keys)
  }
  return [...found].filter(([id]) => !alreadyInvited.has(id)).map(([external_key, keys]) => ({ external_key, line_keys: [...keys] }))
}
