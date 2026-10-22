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
| `/app/#stylist` | Occasion brief, verified demo recipes, actual piece composition, save and add to trip. |
| `/app/#saved`, `#saved/<id>` | Visual list, open, wear today, add to trip, remove saved outfit. |
| `/app/#check` | Exact separate recorded previews, pair ratings, minimum-basket verdict/certificate and explicit own-piece comparison. |
| `/app/#morning` | Optional browser dictation, local ready-only recipes, record today's outfit. |
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
  Credentials remain in memory; interrupted/uncertain tasks are not resubmitted
  on reload. Completed result blobs persist on the device.
- Single-garment YouCam recordings remain immutable under `/demo`. Editorial
  imagery and product artwork are labelled illustrations and kept outside the
  provider evidence catalogue. Outfit compositions show actual pieces separately.
- Stylist/morning suggestions use validated local recipes, not a live AI service.
  Link capture saves a reference only; it does not scrape merchant catalogues.
- Trip and companion wardrobes, wear logs and gift preferences are local. There
  is no cross-account sharing, payment, merchant checkout or guaranteed native
  background execution. Clearing browser storage removes this local data.
- The optional PWA caches only approved public assets. Installation is offered
  in Profile, never over a decision. Video/private photos/API responses are not
  precached.

## Build and release

`npm run build:web2` writes ignored `web2/dist`; the old app still builds to
`web/dist`. `PUBLIC_API_ORIGIN` defaults to the existing Oliwia Worker and must
be an HTTPS origin. It is compiled into the client and CSP, never a secret.

**Codex does not publish this change.** The team deploys preview using its vault
credentials on Oliwia's Cloudflare account. `worker/wrangler.toml` prepares the
exact preview origin in the allowlist; limits, migrations, ledger and secrets
are unchanged. See `docs/DEPLOY_SWITCH_WEB2.md` for the separate release process
and `docs/UX_V2_GAPS.md` for verified fidelity and remaining product boundaries.
