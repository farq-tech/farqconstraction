# Farq Construction landing page

Public route: `/how-it-works`. Existing buyer and supplier application routes remain available at `/?view=…`.

## Product evidence and deliberate content choices

- The existing identity is Cairo, green `#123F3A`, mint `#CFF5DC` and warm white `#FAFAF8` (`src/index.css`). The supplied brand icon is used; no partner logos or marketing statistics were added.
- `src/views/UploadView.tsx` accepts PDF. `src/lib/parseBoq.ts` rejects Excel uploads. The landing page therefore explains PDF upload, manual lines, and product search, and tells Excel users to export PDF. It does not claim CSV/Excel upload support.
- `src/views/RequestFileView.tsx` and `src/api/constructionClient.ts` implement supplier invitation, messages, quote review, comparison and award. WhatsApp preparation requires the buyer to complete sending via the link; the page does not imply automatic delivery to every supplier or universal channel ingestion.
- `src/views/SupplierJoinView.tsx` requires an invitation token. There is no public supplier-registration API in this repository. Supplier CTAs open a labelled request-to-join form; submission prepares an email in the visitor's own email client, with explicit review/send instructions. It never reports successful registration or a sent email. Existing suppliers can go to `/?view=supplier`.
- The supplier portal exposes the buyer company and invited request details. The FAQ describes this and does not claim anonymity.
- All prices, companies, counts and response progress inside the visuals are clearly labelled illustrative. “Lowest price” is not presented as an automatic purchasing recommendation.

## Implementation

Static semantic HTML, local variable Cairo font files (OFL licence included), CSS and native JavaScript. The landing page does not load the procurement application's React/PDF bundle, perform procurement API calls, or upload files.

Motion is orchestrated in six hero states, then stops; a pause/resume/replay control is provided. IntersectionObserver gates reveals; one requestAnimationFrame handler updates the sticky workflow and before/after assembly. Mobile gets a sticky vertical screen with the current stage's caption, rather than complex connecting animations. Reduced motion disables nonessential effects and completes the demo immediately. Desktop-only pointer magnetism moves buttons by a few pixels.

The product demo is deterministic and local, supports replay, and makes zero API requests. Native details/summary preserves keyboard semantics with an animated answer area. The supplier dialog supports Escape, focus restoration, native validation, and clears its fields on close.

SEO includes Arabic title/description, canonical URL, OpenGraph/Twitter image metadata and WebPage structured data. The OG image is a 1200×630 rendering of the same visual identity. The robots policy continues to exclude the application; only `/how-it-works` and its assets are allowed for indexing.

## No tracking

The page carries no analytics, tags, pixels or ad targeting: no `gtag`, `dataLayer`, `data-event` attributes, third-party scripts or cookies, and nothing is left to be configured later. CTAs are plain links/buttons. `scripts/verify-construction-landing-no-tracking.py` fails if tracking globals or attributes come back, or if the page makes any external or procurement API request.

## Verification

Run `npm ci && npm run build`. Serve `dist` (`python -m http.server 8765 --directory dist`), then run `python scripts/verify-construction-landing.py` and `python scripts/verify-construction-landing-no-tracking.py`. The optional verifier requires Python Playwright and Chromium (`pip install playwright && python -m playwright install chromium`).

Browser verification covers 1440×1000, 768×1024, 390×844 and 320×640; all five scroll states; horizontal overflow; demo completion/replay; supplier dialog/Escape/focus; FAQ open/close; reduced motion; six-state hero completion/replay; and no JavaScript errors. Screenshots are generated locally under `artifacts/landing` and are not deployment assets.

Accessibility is additionally audited with axe against WCAG 2 A/AA and WCAG 2.1 AA, including the supplier dialog. Lighthouse results are lab measurements on the local static build, not field Core Web Vitals guarantees.

Final local mobile Lighthouse: Performance **97**, Accessibility **100**, SEO **100**, LCP **2.2 s**, TBT **0 ms**, CLS **0.007**. axe reported zero violations on desktop/mobile and with the supplier dialog open. These figures were measured before tracking was removed. The page makes zero external and zero procurement API requests.
