/**
 * Where the construction app lives.
 *
 * `construction.farq.sa` is attached to the `farq-construction` Vercel
 * project and verified. The old `farq-construction.vercel.app` address keeps
 * working — Vercel serves both — so this only changes where the scripts point
 * by default; pass a URL argument to aim one of them somewhere else.
 */
export const CONSTRUCTION_APP_URL =
  process.env.CONSTRUCTION_APP_URL || 'https://construction.farq.sa'

/** The deployment address the project was reachable at before the domain. */
export const CONSTRUCTION_LEGACY_APP_URL =
  'https://farq-construction.vercel.app'
