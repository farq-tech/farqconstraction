import { farqSession } from './farqSession'
let selection: { userId: string; companyId: string } | null = null
export function getPlatformReviewScope(): string | null {
  return selection && selection.userId === farqSession.getUser()?.id ? selection.companyId : null
}
export function setPlatformReviewScope(companyId: string | null): void {
  const userId = farqSession.getUser()?.id
  selection = companyId && userId ? { userId, companyId } : null
  window.dispatchEvent(new Event('farq-platform-scope-changed'))
}
export function platformReviewPath(path: string, method = 'GET'): string {
  const scope = getPlatformReviewScope()
  if (!scope) return path
  if (!['GET', 'HEAD'].includes(method.toUpperCase())) throw new Error('مراجعة شركة أخرى للقراءة فقط. ارجع إلى حسابك لتنفيذ العمليات.')
  if (!/^\/api\/construction\/(rfqs|booklets)(\/|\?|$)/.test(path)) return path
  return `${path}${path.includes('?') ? '&' : '?'}platform_scope=${encodeURIComponent(scope)}`
}
