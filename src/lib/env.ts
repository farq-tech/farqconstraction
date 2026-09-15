const read = (key: string, fallback = ""): string => {
  const value = (import.meta.env[key] as string | undefined) ?? fallback
  return value.trim()
}

export const env = {
  apiBaseUrl: read("VITE_FARQ_API_BASE_URL", "https://api.farq.sa"),
  supabaseUrl: read("VITE_SUPABASE_URL", "https://mpgbvtaguerncgbzvpwg.supabase.co"),
  supabaseAnonKey: read("VITE_SUPABASE_ANON_KEY"),
  /** Prototype chrome only — never treat as production truth. */
  allowPrototypeChrome: read("VITE_ALLOW_PROTOTYPE_CHROME", "false") === "true",
  appName: "فرق | بناء",
}
