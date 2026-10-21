# WearAgain v2 - isolated staging app

PR-A implements mobile-first wardrobe and style-profile UI without changing
`web/`, the live Cloudflare Pages site, the solver or Worker accounting.

## Preview and tests

```sh
npm ci
npm run check
npm run build:web2
npx wrangler pages dev web2/dist
```

Open `/` or `/app/`. The UI defaults to **English** (`<html lang="en">`).
The Polish design boards are a meaning/layout reference and are translated
faithfully through `web2/src/i18n.ts`. Domain IDs are locale-neutral, and the
catalogue supports adding a `pl` locale later without changing persisted data.

## PR-A board coverage

- **01 / 01** - four-featured-piece mobile wardrobe, All / Tops / Bottoms / Shoes
  category row, search, right-aligned Add item link and stylist entry.
- **05** - 208px desktop sidebar, all-category tabs, four-column eight-product grid,
  working wardrobe search and item status management.
- **03 / 07** - "Your style. In your own words.", editable style paragraph,
  large selected "Demo model" portrait and disabled "My photo" option.
- User-owned availability: **ready / in the wash / needs ironing / needs repair**.
  Only `ready` is eligible for future morning outfits.
- Local schema-validated demo **metadata only**; no private photos or API calls.
  Previous `v1` Polish demo storage IDs are migrated in place without losing
  availability or user-entered clothing records.

Photographs are individual, inset WebP crops from board 05; the portrait is a
separate head/shoulders crop from approved board 03. They are **design artwork**,
not evidence of a real try-on. Original six recorded YouCam previews and their
unmodified manifest remain staged under `/demo/` for PR-B/C.

Four main tabs are always Wardrobe / Stylist / Check / Profile on mobile.
Unfinished PR-B/C/D destinations show clear unimplemented states in PR-A.

## Review caveats

The mockup labels 28 garments but only eight distinct supplied product tiles
are in board 05. PR-A displays the **actual sample count (8)**, not fabricated
inventory. Added text-only items show "No photo". The demo private-photo
option is visibly unavailable; the claim that personal photos can be deleted
requires production consent/storage implementation.

The typography is Cormorant Garamond + DM Sans, with offline-safe fallbacks.
Only the display font and UI chrome use public Google Fonts, so the application
itself remains usable without a font request.

See `docs/UX_V2_GAPS.md` for limitations.

## Later PR scope (not implemented by PR-A)

- **PR-B:** occasion stylist, board 01 screens 02-03 and board 07,
  Worker agent hook, deterministic verification and honest demo imagery.
- **PR-C:** board 02 and board 08 purchase check; reuse the proven solver and
  certificate, six saved individual renders, existing API client.
- **PR-D:** boards 06, 09-12, wardrobe review, morning readiness, gallery
  session and grouped return list.
- **PR-E:** boards **13-17** (consumer landing, `/retail`, `/retail/demo`,
  `/judges`, `/judges/demo`), "Judges · Start here ↗" above the fold
  including mobile, guided three-step jury demo, downloadable test/code links,
  pilot **plan** without invented measured outcomes, fictional shop, real
  Worker status/evidence with saved vs fresh renders distinguishable, PWA
  install shell and production deploy switch.
  Binding details: `docs/mockups/v2/WearAgain-brief-hackathon-Fable.txt`,
  `WearAgain-prompty-hackathon.txt`, and the "Boards 14-17" section of
  `docs/mockups/v2/README.md`. No unverified provider output may be
  described as a generated try-on. "Design concept" disclaimers are only
  removed when actual implementation/video/code are connected.
