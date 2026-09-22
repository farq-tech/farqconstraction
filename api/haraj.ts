/**
 * GET /api/haraj?q=...&q=...&limit=8
 *
 * Public read of search listings. No send, inbox, or authenticated session.
 */
import { handleHarajRequest } from '../src/lib/harajPublic/fetch.ts'

export const config = { runtime: 'nodejs' }

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url, 'http://localhost')
  const queries = url.searchParams.getAll('q')
  const limit = Number(url.searchParams.get('limit') ?? 8)

  const { status, body } = await handleHarajRequest(queries, Number.isFinite(limit) ? limit : 8)

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, s-maxage=120, stale-while-revalidate=300',
    },
  })
}
