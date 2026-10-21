# PR4: Pages frontend and demo PWA

## What is implemented

`/` is the shopper landing, `/retailers/` the proposed retail pilot, and `/app/` the five-screen decision flow. The default app is a keyless demo. `/app/?mode=live` is an explicit, metered path through the existing Worker. No session or render request is made by opening demo mode, starting the tour or choosing an avatar.

The frontend uses TypeScript, browser DOM APIs and CSS without a UI framework or tour library. esbuild bundles the browser modules; sharp creates UI thumbnails and rasterizes the vector PWA icon at build time. Both are build-only dependencies already present in the Wrangler dependency tree. Pages receives static files only, under `web/dist`.

The app provides wardrobe/scenario selection, declared requirement chips, candidate selection, a scrollable pair matrix, three-state decisions, conservative decision relevance, the solver result, evidence for cheaper baskets, a challenge basket and a photo-free JSON decision summary. The zero-purchase case uses explicit accepted owned/top-only outfits. Render errors and missing decisions stay unresolved; provisional and proven certificates are distinguished. A spending ceiling flags a result over budget without changing prices or the solver's proof.

The illustrations are framed photograph-only areas from the team's approved mockups. They are labelled illustrations and are never sent to YouCam or represented as generated try-on results. All catalogue prices and fixture decisions are labelled synthetic examples. Demo screenshots are not measurements of savings, fit, time or commercial impact.

## Recording handoff

The recorded-image manifest is currently empty. The default **solver walkthrough** therefore replays hand-authored fixture decisions, with explicit unavailable-preview messages. Users can change those example decisions to inspect how the minimum changes. This is separate from **recorded-image mode**, where only successfully decoded matching images can support a new pair decision. AI Stylist and the one-store basket are visibly **Planned**; PR4 does not manufacture an agent transcript or perform checkout.

For the main six-image scenario, use one synthetic model consistently and these exact element IDs:

| Kind | ID | Display label |
| --- | --- | --- |
| top | `work` | Cream shirt |
| top | `weekend` | Navy knit |
| top | `evening` | Striped tee |
| outerwear | `cheap-a` | Aster trench |
| outerwear | `cheap-b` | Mila coat |
| outerwear | `all-round` | Nova jacket |

These display labels map onto the existing `minimum-basket.json` fixture; prices, outfit memberships and decisions remain the tested fixture's data. The zero-purchase fixture additionally uses `shirt`, `old-coat` and `new-coat`.

Add approved recordings using the schema in [API.md](API.md#recorded-demo-handoff). Put each actual image at its manifest path under `web/demo/renders/`, using `.png` or `.jpg`, then run `npm run build:web`. The build rejects missing files and invalid paths. The browser matches both element and avatar, chooses the latest recording deterministically, and decodes it before declaring it ready. A changed avatar or image invalidates dependent decisions. No external provider URL is accepted in a recording entry.

Live catalogue photography has not been supplied either. The live screen explicitly asks for authorized garment-only candidate photos instead of sending reference illustration crops as product images. Product availability, shipping costs and pickup times remain UNKNOWN.

## Live image and accounting boundaries

Live upload consent and adult declaration start unchecked. Uploads, measurements, session tokens and blob URLs remain in tab memory. The only localStorage entry is the versioned guided-tour progress. The client sends neutral filenames, binds decisions to exact Worker identities and decoded asset IDs, and releases image URLs when replaced or the view closes. Late image responses cannot replace a newer garment or retry.

`Enable live` reads a server-issued session and ledger without rendering. Each explicit new item request uses the Worker's 2-unit reservation. Successful images are reused between pair cards. A timeout is UNKNOWN; explicit recovery repeats the same garment/model/attempt within the same session. No automatic POST retry, new attempt or refund is triggered. A charged image whose download fails offers a download retry. An explicit generation retry is a new possible charge. The displayed allowance is labelled **Last confirmed allowance**, with a ledger-only refresh and a warning when a lost response may hide a new hold.

The frontend never hardcodes 440/240/40 as an available balance. It reads the actual ledger, including prior unresolved holds. This PR neither changes the Worker budget nor adds an operator refund endpoint. The team's earlier successful live probe is operational evidence from the team, not a frontend test performed here.

## Guided tour and accessibility

Start buttons appear on the landing, in the jury section and inside the app. Desktop has six coach marks; screens up to 680 CSS pixels have four inline hints. Skip, Escape, Back, Next and Restart are keyboard operable. Desktop focus stays in the coach-mark dialog and is restored on exit; refreshes reattach highlights to the current control. Progress uses `wearagain:tour:v1`, and blocked/unavailable localStorage does not prevent the tour. Starting a tour never enables live or submits an agent request.

The planned Stylist/cart targets remain honest previews. Their coach marks carry the same Planned label. The layout uses semantic headings, labels, visible focus, reduced-motion support, independent horizontal scrolling for the matrix and a content skip link.

`selectAvatar()` filters adult entries and declared sex, prefers primary models, uses normalized nominal measurement bands and the documented weights, and breaks ties by ID. Manual choice applies the same eligibility constraints. Unmeasured bands do not become a size guarantee. The browser uses smaller thumbnails; the Worker continues to validate the pinned full-resolution originals.

## PWA and privacy

The web/PWA is the hackathon delivery format. Native iOS and Android store apps remain the target product, visibly labelled as planned.

The manifest has 192 and 512 pixel icons and standalone display. Mobile browsers with `beforeinstallprompt` get an explicit **Install on your phone** action; iOS gets a Safari **Share → Add to Home Screen** note. Neither forces installation.

Opening demo mode registers a service worker whose cache contains only a build-generated list of public app files, synthetic avatar thumbnails, example fixtures, illustration references and manifest-listed recordings. It never caches live/API/authenticated traffic, uploads, arbitrary URLs, signed queries or cross-origin responses. Cache misses do not populate a runtime cache. Offline readiness requires one successful online download of this public bundle; a first visit while offline cannot install it. Cache eviction by the browser still requires another online load.

## Retail contact

Set `PUBLIC_CONTACT_EMAIL` at build time to the team's chosen public business address. Until then the UI intentionally shows UNKNOWN and the copy button is disabled. Once configured, the address is selectable and the button uses the Clipboard API, falling back to text selection. **Plan a retail pilot** scrolls to this block. There is no form, calendar, transmission or checkout.

## Verification and visual reference decisions

`npm run check` covers core/client types, browser types, fixtures, real SQLite and workerd, avatar selection, stale-evidence races, live-client transport and the service-worker allowlist, then builds Pages. The native-fetch runtime regression exercises both default global fetch and `fetchImpl: fetch` inside workerd, including all upload/task/download stages; it catches both previous runtime failures. Temporary emulator directories use bounded Windows lock retries. CI runs the same checks on Ubuntu and Windows.

Local rendered checks use Chromium with external network blocked or fixture-intercepted: shopper and retailer pages, all five app stages, minimum/zero-purchase results, the challenge control, desktop/mobile tours, image updates and offline navigation. Screenshots are compared to the supplied references for typography, forest-green/ivory palette, section order, media framing, CTA labels, matrix layout and mobile overflow. Intentional changes are the README's logic fixes, English copy, explicit synthetic/planned labels, accurate six-image baseline and missing-recording states. They supersede the Polish mockups' erroneous counts and layered previews.

Actual mobile OS installation, Safari rendering, real Worker CORS on the deployed Pages origin and paid YouCam rendering remain the team's post-review checks. No deployment or paid provider call is part of PR4 validation.
