import { env } from "@/lib/env"
import {
  FarqApiError,
  type ApiEnvelope,
  type ConstructionProject,
  type ConstructionRfqSummary,
  type ConstructionStatus,
} from "@/lib/api/types"

export type AccessTokenProvider = () => string | null | Promise<string | null>

let tokenProvider: AccessTokenProvider = () => null

export function setAccessTokenProvider(provider: AccessTokenProvider) {
  tokenProvider = provider
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export interface RequestOptions {
  method?: string
  body?: BodyInit | null
  headers?: HeadersInit
  signal?: AbortSignal
  timeoutMs?: number
  /** Skip Authorization header (public endpoints). */
  public?: boolean
  json?: unknown
}

async function parseEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  const text = await response.text()
  if (!text) {
    return {
      ok: response.ok,
      data: null,
      message: response.statusText || "Empty response",
      meta: { requestId: response.headers.get("x-request-id") ?? undefined },
    }
  }
  try {
    return JSON.parse(text) as ApiEnvelope<T>
  } catch {
    throw new FarqApiError({
      message: "تعذر قراءة استجابة الخادم",
      status: response.status,
      code: "INVALID_JSON",
      requestId: response.headers.get("x-request-id") ?? undefined,
    })
  }
}

export async function constructionRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiEnvelope<T>> {
  const requestId = createRequestId()
  const headers = new Headers(options.headers)
  headers.set("Accept", "application/json")
  headers.set("X-Request-Id", requestId)

  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json")
  }

  if (!options.public) {
    const token = await tokenProvider()
    if (token) headers.set("Authorization", `Bearer ${token}`)
  }

  const controller = new AbortController()
  const timeoutMs = options.timeoutMs ?? 30_000
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  if (options.signal) {
    if (options.signal.aborted) controller.abort()
    else {
      options.signal.addEventListener("abort", () => controller.abort(), { once: true })
    }
  }

  try {
    const response = await fetch(`${env.apiBaseUrl}${path}`, {
      method: options.method ?? (options.json !== undefined ? "POST" : "GET"),
      headers,
      body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
      signal: controller.signal,
    })

    const envelope = await parseEnvelope<T>(response)
    const metaRequestId = envelope.meta?.requestId ?? response.headers.get("x-request-id") ?? requestId

    if (!response.ok || envelope.ok === false) {
      const first = envelope.errors?.[0]
      throw new FarqApiError({
        message: first?.message || envelope.message || "فشل الطلب",
        status: response.status,
        code: first?.code || `HTTP_${response.status}`,
        requestId: metaRequestId,
        body: envelope,
      })
    }

    return {
      ...envelope,
      meta: { ...envelope.meta, requestId: metaRequestId },
    }
  } catch (error) {
    if (error instanceof FarqApiError) throw error
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new FarqApiError({
        message: "انتهت مهلة الطلب أو تم إلغاؤه",
        status: 499,
        code: "ABORTED",
        requestId,
      })
    }
    throw new FarqApiError({
      message: error instanceof Error ? error.message : "تعذر الاتصال بالخادم",
      status: 0,
      code: "NETWORK",
      requestId,
    })
  } finally {
    clearTimeout(timer)
  }
}

export const constructionApi = {
  status: (signal?: AbortSignal) =>
    constructionRequest<ConstructionStatus>("/api/construction/status", {
      public: true,
      signal,
    }),

  me: (signal?: AbortSignal) =>
    constructionRequest<unknown>("/api/construction/me", { signal }),

  listProjects: (signal?: AbortSignal) =>
    constructionRequest<ConstructionProject[]>("/api/construction/projects", { signal }),

  listRfqs: (signal?: AbortSignal) =>
    constructionRequest<ConstructionRfqSummary[]>("/api/construction/rfqs", { signal }),

  getRfq: (rfqId: string, signal?: AbortSignal) =>
    constructionRequest<ConstructionRfqSummary>(
      `/api/construction/rfqs/${encodeURIComponent(rfqId)}`,
      { signal },
    ),
}
