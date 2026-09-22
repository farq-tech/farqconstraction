/**
 * Vercel: /api/taseer/*
 * Same handler as local Vite. Never Construction Production Postgres.
 */
import { handleTaseerRoute } from '../../src/lib/taseerApi.ts'

export const config = { runtime: 'nodejs' }

export async function GET(request: Request): Promise<Response> {
  return handle(request)
}

export async function POST(request: Request): Promise<Response> {
  return handle(request)
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const chunks: Buffer[] = []
  if (request.body) {
    const buf = Buffer.from(await request.arrayBuffer())
    if (buf.length) chunks.push(buf)
  }
  const req = {
    on(event: string, cb: (arg?: Buffer) => void) {
      if (event === 'data') {
        for (const c of chunks) cb(c)
      }
      if (event === 'end') queueMicrotask(() => cb())
      return req
    },
  }
  const { status, body } = await handleTaseerRoute(request.method || 'GET', url, req)
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}
