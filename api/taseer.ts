/**
 * Vercel: /api/taseer and /api/taseer/*
 * Same handler as local Vite. Never Construction Production Postgres.
 */
import { handleTaseerRoute } from '../src/lib/taseerApi.ts'

export const config = { runtime: 'nodejs' }

export async function GET(request: Request): Promise<Response> {
  return handle(request)
}

export async function POST(request: Request): Promise<Response> {
  return handle(request)
}

function routeUrl(request: Request): URL {
  const url = new URL(request.url)
  const rewritten = url.searchParams.get('__taseer_path')
  if (rewritten) {
    url.pathname = `/api/taseer/${rewritten}`
    url.searchParams.delete('__taseer_path')
  }
  return url
}

async function handle(request: Request): Promise<Response> {
  try {
    const url = routeUrl(request)
    const raw = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text()
    const req = {
      on(event: string, cb: (arg?: Buffer) => void) {
        if (event === 'data' && raw) cb(Buffer.from(raw))
        if (event === 'end') queueMicrotask(() => cb())
        return req
      },
    }
    const { status, body } = await handleTaseerRoute(request.method || 'GET', url, req)
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error).slice(0, 240) }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }
}
