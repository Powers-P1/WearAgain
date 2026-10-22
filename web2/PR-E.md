# PR-E - consumer landing, retailer, judges, optional PWA and prepared switch

Base: post-PR-D squash main (`ebfaad0`). New frontend only. UI default English through `web2/src/i18n.ts`.

## Board / route checklist

| Board | Route | Implemented |
| --- | --- | --- |
| 13 consumer landing | `/` | Editorial hero with warm ivory/olive typography and genuine saved-model image labelled **one garment**; morning triptych of three distinct manifest-recorded tops, coffee/capture story and wardrobe-care story; visible **Judges · Start here ↗** in mobile and desktop header; retailer link and /app/ CTA. |
| 14 B2B landing | `/retail/` | **Your collection. Her wardrobe. A reason to buy.** Clear pilot-plan sections on conversion vs control, returns after window, margin after returns and API costs. No claimed performance improvements. |
| 15 B2B product | `/retail/demo/` | Explicitly **fictional Demo Atelier**, selectable sample size (not AI recommendation), preserved displayed sample price from the tested core fixture, a real separate single-coat recorded YouCam image, user-toggleable WearAgain panel, example owned wardrobe thumbnails and a local-only bookmark. Merchant checkout disabled, no private-data upload. |
| 16 judges landing | `/judges/` | **Try it on. Know why.**, prominent three-step demo CTA; code/setup/API links for authorized reviewers; three numbered evidence stories, explanatory YouCam versus WearAgain roles, compact technology/design/impact/idea review index, proposed one-category retail pilot and named representative Oliwia. Video explicitly missing until supplied. |
| 17 judges guided | `/judges/demo/` | Three navigable steps: actual sample wardrobe, saved YouCam upper-body candidate/top evidence with manifest-proven recorded date and unsubmitted live-task status, and real `solveBasket()` certificate for both minimum-basket and zero-purchase fixtures. Real sources, no invented provider request IDs or completed fresh task. Deep-linkable `?step=preview` and `?step=verdict` for reproducible screenshot review. |

## Additional work

- **Strict v2 `_headers`:** `script-src 'self'`, `style-src 'self'`, `font-src 'self'`, `connect-src 'self'`, `img-src 'self' blob: data:`, `worker-src 'self'`, `microphone=(self)`, `camera=(self)`, no geolocation, framing denied. Local licensed DM Sans and Cormorant Garamond replace Google Fonts, including font license text.
- **Optional PWA install shell:** `/manifest.webmanifest`, two raster icons, `/app/sw.js` with only explicitly approved, versioned, same-origin public assets in the immutable precache. It controls `/app/` only, never the public landing/retail/judges pages and never caches runtime photos or Worker/private/API traffic. Declines/no support never blocks app.
- **Prepared but NOT activated production switch:** `scripts/build-web2.mjs` produces `web2/dist` with all route indexes, `_headers`, `_redirects`, fonts, icons, approved saved previews and PWA. See `docs/DEPLOY_SWITCH_WEB2.md`. Production remains on old `web/dist` and this PR does not run Cloudflare deploy.
- **Cosmetic review debt:** larger mobile touch targets, real bookmark SVG, keyboard arrow/Home/End handling for faux-radio controls, truthful example-core coffee verdict, no misleading styling line for photo-only captures, clear sample data conditions, no-log attention only after at least seven logged calendar days, singular/plural counts, short "(demo)" garment names and device-persistence wording.
- **Screenshot evidence:** separate `.github/workflows/web2-visual.yml` job builds the actual staging bundle, renders 390 × 844 and 1280 × 800 screenshots of landing, retail, product, judges, guided steps 1/2/3 and /app/ wardrobe/Check, and uploads a private PR artifact. Not a mockup crop, not a deployment.

## Explicit deviations (honest and necessary)

1. Board 13 and 14 depict professionally composited full-outfit hero photographs. The saved provider API outputs are **only six independent cloth-v4 single-garment renders**; therefore all model images are labelled as recorded single-garment evidence with independent wardrobe item thumbnails. No design-board crop is treated as a real YouCam output or layered try-on; an editorial imagery upgrade remains separate.
2. Board 15 fictional product shows a catalogue-only coat photograph and says a **€320 wool-blend coat**. We do not have an independently verified merchant catalogue photo for this candidate, so the product surface uses the **actual saved upper-body YouCam image** and visibly labels it as such; this is *not* a retailer catalogue photograph. The actual recorded element is `outerwear:cheap-a` ("Aster trench") with a **synthetic 40 PLN fixture price**, so the retailer demo uses the real matching ID, label and sample price instead of relabelling the saved image or fabricating a live store price. A real merchant size selector/checkout is out of scope; sample size is local and checkout visibly disabled.
3. Board 14 promises retailer context and pilot impact; there is no installed third-party merchant integration or measured conversion/returns/margin outcome. The page clearly identifies the proposed one-category pilot and required customer consent/data sharing as future work. No user photo or private wardrobe gets sent to a retailer.
4. Board 16 references a **2-minute video** and working public code access. The walkthrough video is **not present**; we show an explicit missing-material status. Code and setup links target the **private** source repository and require reviewer access, rather than inventing accessible evidence.
5. Board 17 depicts a **full garment-layered** YouCam preview and proposed "Generate with YouCam" button. Current evidence supports only separate saved garment previews; guided mode identifies exactly which files were recorded and reports fresh-task status **not submitted**. The hosted replay makes no live calls. The separate Worker API is documented in `docs/API.md`; no absolute link to a legacy production frontend is retained. No fake task logs or leaked API token.
6. Retail mockups show an owned-equivalent garment/guaranteed compatibility. The pure solver establishes a minimal basket **for recorded synthetic requirements and ratings**, not sizing, accurate style fit, stock or garment equivalence. The verdict and cheaper-basket evidence are displayed faithfully; "buy nothing" is possible when true from the core fixture.
7. PWA install/offline does not grant native background processing, guaranteed camera access, live rendering without network or cross-device wardrobe sync; it is a small **public static shell under /app/** only.
8. The Cloudflare Pages `_headers` configuration is generated for staging and eventual production. A local static test server does not enforce it; security headers must be verified through HTTPS Pages before a later production change.
9. Sample garment images used for wardrobe/item grids are approved ImageGen design **reference artwork**, not provider evidence. All saved YouCam files are unchanged and the manifest remains the provenance source.

## Tests / review commands

```sh
npm ci --ignore-scripts
npm run check
# examine local static pages
npm run build:web2
npx wrangler pages dev web2/dist
```

The old `npm run build:web` still builds the production v1 frontend separately; PR-E changes no `worker/**` code, no limits or secrets and never deploys Cloudflare production.

## Screenshot review observation
The private Chromium artifact contains 18 full-page PNGs (390×844 and 1280×800 for the landing, retail, retail demo, judges, judges guided steps 1-3 and /app/ wardrobe/check). Inspect the actual rendered pages rather than the ImageGen boards. The initial app deep-link previously focused its H1 on first load, drawing an intrusive focus ring in automated screenshots; PR-E retains accessibility focus after real in-app navigation, but does not programmatically focus headings on an initial non-interactive page load.

## PR #17 review fixes - 22 October 2026

1. The actual core's cheaper failed baskets say **"Unsatisfied needs:"** before requirement names; the solved buy-nothing demo explicitly explains why no cheaper basket can exist, with no empty list.
2. The two guided bottom notes align with the responsive content gutter; the CSS selector overrides the site's paragraph margin reset.
3. Both `/judges/` and all three `/judges/demo/` steps disclose **Implemented now**, **Concept / not yet** and **Limits**. Documented: style preview not size fit, two units charged on confirmed successful YouCam renders, reported provider 24-hour image retention, no fresh requests in the hosted saved replay, private repo, missing video, no measured impact.
4. The outdated absolute `https://wearagain.pages.dev/app/` live-client link is gone. Judge pages link to the documented Worker API contract instead.
5. The static build now ships **`/sw.js`** to retire the old scope-/ PWA and delete only old `wearagain-demo-*` caches; the optional new `/app/sw.js` worker is unaffected. Pages `wearagain` is a **direct upload** project, so the release step is a separate, authorized manual `wrangler pages deploy web2/dist --project-name wearagain --branch main`. See `docs/DEPLOY_SWITCH_WEB2.md` for staged migration/rollback, not a nonexistent Pages build setting. **No production deploy is executed.**
