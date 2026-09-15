export interface ApiErrorBody {
  code?: string
  message?: string
}

export interface ApiEnvelope<T> {
  ok: boolean
  data: T | null
  partialResults?: boolean
  errors?: ApiErrorBody[]
  message?: string
  meta?: {
    requestId?: string
    version?: string
    cache?: { hit?: boolean; age?: number }
  }
}

export class FarqApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId?: string
  readonly body?: ApiEnvelope<unknown>

  constructor(opts: {
    message: string
    status: number
    code?: string
    requestId?: string
    body?: ApiEnvelope<unknown>
  }) {
    super(opts.message)
    this.name = "FarqApiError"
    this.status = opts.status
    this.code = opts.code ?? "UNKNOWN"
    this.requestId = opts.requestId
    this.body = opts.body
  }
}

export interface ConstructionStatus {
  flags: {
    read: boolean
    write: boolean
    adapters: boolean
    rfq: boolean
    crown: boolean
  }
  repository_contract_valid: boolean
  persistence_available: boolean
  production_writes_enabled: boolean
  delivery_channels?: Record<string, unknown>
}

export interface ConstructionProject {
  id: string
  name: string
  code?: string | null
  site_address?: string | null
  currency?: string
  active?: boolean
  created_at?: string
  updated_at?: string
}

export interface ConstructionRfqSummary {
  id: string
  status: string
  created_at?: string
  updated_at?: string
  delivery?: { site_address?: string; required_date?: string; city?: string }
  buyer?: { company_name?: string; contact_name?: string; email?: string }
  project?: { id?: string; name?: string; code?: string }
  lines?: unknown[]
  packages?: unknown[]
}
