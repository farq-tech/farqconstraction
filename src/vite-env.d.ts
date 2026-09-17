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
  /**
   * `1` refuses every state-changing API call at the network choke point.
   * See `src/api/readOnlyMode.ts`. Absent means writes are ALLOWED, so a
   * testing deployment has to set it deliberately.
   */
  readonly VITE_READ_ONLY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.mjs?url' {
  const url: string
  export default url
}
