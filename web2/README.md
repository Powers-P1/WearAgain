# WearAgain v2

Mobile-first wardrobe app and desktop wardrobe control centre. The consumer
landing remains the owner-selected v1 design. Retail and jury pages follow
boards 14-17. English UI copy lives in `src/i18n.ts`; all fonts are self-hosted.

## Run and verify

Use Node 24, then:

```sh
npm ci --ignore-scripts
npm run check
npm run dev:web2
```

`check` covers strict types, domain/Worker tests and both frontend builds.
For browser regressions, serve `web2/dist` on port 8788 and run:

```sh
npx playwright install chromium
npm run qa:web2
```

`BASE_URL`, `CHROMIUM_PATH` and `QA_OUTPUT` are optional QA overrides. Browser
checks use an isolated context, synthetic media and mocked API responses.
External requests are blocked. Outputs default to ignored `test-results/web2`.
CI also captures mobile and desktop views as downloadable artifacts.

## Routes and ownership

| Route | Behavior |
| --- | --- |
| `/` | Previous consumer landing, preserved. |
| `/app/#wardrobe`, `#add`, `#item/<id>` | Search/filter/status, device-only garment photos, newest personal items shown immediately. |
| `/app/#stylist` | Live tool-backed AI, four procedures and feedback; separate saved examples, verified pieces, save and add to trip. |
| `/app/#profile`, `#my-check` | Separate local profiles, editable memory, model choice, file transfer; own-data needs/catalogue/ratings and certificate. |
| `/app/#saved`, `#saved/<id>` | Visual list, open, wear today, add to trip, remove saved outfit. |
| `/app/#check` | Exact separate recorded previews, pair ratings, minimum-basket verdict/certificate and explicit own-piece comparison. |
| `/app/#morning` | Optional browser dictation, live AI or labelled saved recipe, ready-only looks, record today's outfit. |
| `/app/#gallery` | Continuous camera/file capture, capture-time shop/floor, optional live preview queue, coffee review and return list. |
| `/app/#overview`, `#review/<id>`, `#balance` | Real inventory/readiness and recorded wears, manual care/disposal choices, category comparison and confirmed needs. |
| `/app/#trip` | Occasion planning, saved outfits, deduplicated packing checklist; optional companion wardrobe on this device. |
| `/app/#surprise` | Budget/need preferences and skip-month control. No payment or order. |
| `/retail/`, `/retail/demo/` | Editorial retailer story, pilot plan and fictional product/wardrobe panel. |
| `/judges/`, `/judges/demo/` | Guided evidence, certificate, private source/setup links and captioned 93-second walkthrough. |

`state`, `plans`, `shopping`, `daily` and `stylist` own schema-validated local
models; feature UI/CSS files own their screens. `ui.ts` shares actual garment
media; `photo-store.ts` keeps device blobs in IndexedDB. `render-queue.ts`
uses the existing bounded `web/src/live.ts` client, without copying its API or
accounting logic. Camera access starts only on an explicit button press.

## Data and integration boundaries

- No model photo upload in the public demo. All previews use the synthetic model.
- Personal garment photos are local until the user explicitly enables live
  previews and confirms that the photographs contain no people or faces.
- Live tasks run at most two concurrently. Errors never become dislike ratings.
  The existing pipeline supports tops, jackets and coats on the demo model.
  The signed capability is stored per local profile for its six-hour lifetime.
  Known render keys resume by GET under that exact capability; uncertain POST
  outcomes never create a replacement submission. Result blobs persist locally.
- Single-garment YouCam recordings remain immutable under `/demo`. Editorial
  imagery and product artwork are labelled illustrations and kept outside the
  provider evidence catalogue. Outfit compositions show actual pieces separately.
- Stylist/morning offer live Sonnet 5.5 with the tools described in
  `docs/AGENT_RUNTIME.md`, or a separate saved-example mode. Link capture saves
  a reference only; it does not scrape merchant catalogues.
- Trip and companion wardrobes, wear logs and gift preferences are local. There
  is no cross-account sharing, payment, merchant checkout or guaranteed native
  background execution. Clearing browser storage removes this local data.
- The PWA caches only approved public assets. Installation has a dismissible
  first mobile prompt plus landing/jury actions, with native or iOS guidance.
  Video/private photos/API responses are not precached.

## Build and release

`npm run build:web2` writes ignored `web2/dist`; the old app still builds to
`web/dist`. `PUBLIC_API_ORIGIN` defaults to the existing Oliwia Worker and must
be an HTTPS origin. It is compiled into the client and CSP, never a secret.

The owner subsequently authorized preview then production for this release.
Deployment uses the existing vault-backed token on Oliwia's Cloudflare account;
the local Damian Wrangler login is unchanged. Public Worker routes, class
migration, global budget limits and existing secrets remain intact. SQLite
application tables add agent isolation/idempotency and operator release audits.
See `docs/DEPLOY_SWITCH_WEB2.md` and `docs/UX_V2_GAPS.md` for release evidence.
