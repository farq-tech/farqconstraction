/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Browser API base. Default `/_api` (Vite/Vercel rewrite to Farq API).
   * Example: `/_api` or `https://api.farq.sa`
   */
  readonly VITE_API_BASE_URL?: string
  /** Vite-only: where `/_api` is proxied (e.g. http://127.0.0.1:3000). Not a DB URL. */
  readonly VITE_API_PROXY_TARGET?: string
  /**
   * Optional buyer JWT for GET /api/construction/catalog on production.
   * Local no-login uses x-construction-demo-user when Farq API has CONSTRUCTION_DEMO_MODE=1.
   */
  readonly VITE_FARQ_ACCESS_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.mjs?url' {
  const url: string
  export default url
}
