# WearAgain v2 - coverage, fidelity and product boundaries

The accepted boards are in `docs/mockups/v2`. English is the existing product
locale; Polish boards specify visual hierarchy and meaning. Damian explicitly
retained the previous consumer landing, so board 13 is not a replacement target.

## Implemented correction inventory

- Purchase: one responsive DOM, three open desktop columns; on mobile candidate,
  separate previews and wear choice precede the verdict. Technical evidence is
  collapsed. Skip a nonchosen piece leads to the actual alternative; Keep my own
  appears for the zero-purchase result or an explicitly confirmed own equivalent.
- Stylist, morning, saved looks, trip and overview: clearly labelled full-look
  editorial illustrations restore the boards' visual hierarchy for unchanged
  demo recipes. Personal/altered recipes show the actual pieces separately.
  A white-shirt recording is never presented as evidence of a four-piece outfit.
- Saved looks: visual list, detail, wear today, trip reuse and removal. Availability
  is checked again when wearing; no saved outfit adds purchased stock implicitly.
- Trip: occasions, dates, saved-outfit assignment, packing checklist and local
  companion wardrobe. Balance: actual category counts, wear records and manual
  confirmed gaps. Monthly surprise: budget/need preferences and skip-month state.
- Gallery: continuous explicit camera, file fallback, capture-time shop/floor,
  optional bounded live queue, coffee list and ready-result review, grouped returns.
  An upload/preview failure does not change the user's opinion of the garment.
- Retail/jury: approved editorial imagery restored, distinct product/styling
  illustrations, actual API provenance retained, quieter guided steps and correct
  scroll/focus. A real captioned walkthrough of the final UI is included.
- Consumer v1 landing source and CSS are unchanged. The shared How it works link
  uses the existing `#how-it-works` anchor. Installation no longer covers actions.

## Fidelity ledger - 22 October 2026

Comparison used the PNG references and freshly rendered browser screenshots,
including `view_image` inspection of both, rather than source-only assertions.
Browser verification used connected Edge first, then pinned Playwright for
repeatable state checks and saved screenshots because the separate Browser
plugin was unavailable. Reference board 08 was checked at its native 1536x1024;
mobile app layouts at 390x844 and desktop at 1280x900 were also checked.

| Point | Reference and previous drift | Implemented resolution / intentional deviation |
| --- | --- | --- |
| Layout / density | 08 uses three readable columns; old view mixed solver controls with clothing and actions. | Three open regions, supporting details collapsed; one mobile sequence with wear actions visible in the first 390x844 viewport. |
| Palette / containers | 05-08, 14-17 use warm ivory, stone, dark olive, hairlines and open whitespace. | Existing tokens retained; no new gradient, heavy shadow or nested dashboard shell. |
| Typography / controls | Large serif hierarchy, plain sans labels, quiet outlined icons. | Cormorant Garamond / DM Sans retained, explicit control sizes, corrected hanger, 44px main mobile targets. Programmatic heading focus does not draw a black frame. |
| Outfit imagery | 07/09/12 illustrate complete looks, while provider results prove single garments. | Three ImageGen editorial assets are restricted to unchanged demo recipes, visibly labelled and separate from actual provider recordings. Personal recipes retain actual piece compositions. See `mockups/v2/ILLUSTRATION_ASSETS.md`. |
| Purchase language | 02/08 allow an own-equivalent verdict with a reason. The fixture merely omitted one candidate. | Separate Skip, recommended alternative, zero purchase and explicit user-confirmed equivalence. No duplicate inferred from a cheaper basket. |
| Shopping camera | 10/11 centre capture, then coffee review and return choice. | Continuous viewfinder/shutter, remembered shop, queue, direct Coffee review action and local shortlist. Explicit upload opt-in and demo model remain necessary. |
| Retail / jury art | 14-16 use editorial photos and a distinct garment product view. | Approved illustrative crops restored. Genuine recordings have different labels and a separate evidence path. |
| Above-fold copy | Same meaning as accepted boards; previous debug/provenance banners dominated. | English translations retained. Additional live opt-in, incomplete-result and private-repository notes are intentional truthful functional states. Video CTA now opens actual media. |
| Responsive behavior | Four mobile bottom destinations; desktop sidebar. | Existing shell retained. Missing trip/gift/balance views are reachable; no horizontal overflow or missing images in the audited routes. |

## Verification

The final state suite exercises **66 scenarios at 390x844, 1280x800 and
1536x1024**: 198 state checks, each with viewport and full-page screenshot.
This covers the following states, rather than just route-entry screenshots:

| Surface | Mobile and desktop coverage / final adjustment |
| --- | --- |
| Wardrobe | Four initial mobile pieces and stylist action; filtering, empty search, add and detail. Personal-photo persistence is covered by the interaction suite. |
| Profile | Style entry/save and disclosed demo model; mobile save is visible, desktop uses two columns. |
| Stylist / saved | Brief, all three proposals, genuine single-garment evidence, empty/list/detail, save, wear and trip reuse. Mobile save is above the bottom navigation. |
| Purchase | Minimum result, recommendation, actual-own comparison, confirmed equivalence, incomplete ratings and zero-purchase result. Ratings precede the mobile verdict. |
| Morning | Voice-first brief, typed fallback, three choices, selection, worn confirmation and no ready look. Desktop choices are three large portraits. Speech stops on leaving/hiding the app. |
| Gallery | Idle/context, explicit fake-camera permission and shutter, capture, preview opt-in, unknown/error outcomes, coffee list, single preview, returns and reopening a return photo. Personal captures precede demo examples. |
| Overview / review | Recorded counts, care rows, condition selector and saved keep decision. Mobile statistics/month remain available in a disclosure; desktop keeps the inline dashboard metrics. |
| Balance | Three initial comparison photos, all-piece expansion, category change and confirmed needs. |
| Trip | Own look, two-person empty/setup states, outfit picker, assignment, packing, empty trip and adding a new occasion. The interaction suite additionally fills a real local companion wardrobe and checks both packing lists after reload. |
| Surprise | Budget, optional need, rules, save and skip-month state. The save action precedes optional fields. |
| Public pages | Preserved v1 landing, compact retail/jury heroes, product panel open/closed/saved and three guided stages including zero purchase. The product wardrobe action opens/focuses the preview; resources and technical disclosures follow the guided experience. |

Five explicit fidelity checks were repeated against the accepted boards and
saved browser renders: layout hierarchy, warm neutral palette, serif/sans type,
editorial asset framing and spacing/touch targets. The mobile condition select,
three mobile morning rows, three-column desktop morning, two-column desktop
profile and full camera toolbar were inspected visually. Illustrative outfit
photos, actual demo counts, explicit upload opt-in and truthful empty companion
states are intentional differences from the concept boards.

`npm run check` validates strict types, domain and real local Worker/SQLite
accounting tests, and both builds. `npm run qa:web2` checks the actual rendered
mobile interaction path, persistence, fake continuous camera, opt-in, mocked
live protocol, ready image blobs, jury navigation, retailer panel and video
play/pause/seek/captions. External provider requests are blocked in this suite.
`npm run qa:web2:states` runs the state matrix above with a synthetic camera and
mocked provider outcomes; no paid provider calls are made. CI also captures
the route/reference comparisons. QA outputs
and intermediate scripts stay outside tracked source; public walkthrough media
is an intentional shipped asset, outside the PWA precache.

## Remaining product boundaries

| Capability | Current honest boundary |
| --- | --- |
| Personal model / size | Synthetic model and the existing upper-body garment pipeline (tops, jackets, coats) only; style preview is not size fitting. Personal model consent, scoped storage/deletion and real sizing need production work. |
| AI stylist | Local validated demo recipes. The Worker has no occasion-stylist endpoint. Free text is stored/validated but not interpreted by a live model here. |
| Background / refresh | Queue progresses while the tab stays open. Server tasks may reconcile after closure, but memory-only session credentials cannot resume their image downloads after reload. Such outcomes become unknown and are never resubmitted automatically. |
| Personal-photo purchase solver | New captures can get a live preview and a user shortlist. The exhaustive purchase certificate remains scoped to the replayable sample catalogue/prices/ratings; it does not invent real catalogue prices or AI acceptance of uploaded garments. |
| Merchant links / checkout | Links are references only; no scraping, live stock, payments, price changes or merchant checkout. Retail product/styling is illustrative. |
| Companion / sync | Shared trip on one device, with manually entered companion pieces. No invitation, cross-account or home-system integration. |
| Monthly surprise | Saved preferences and skip month; no wallet funding, subscription charge, purchase or return processing. |
| Wardrobe intelligence | Counts and care state use actual local data. Logged wear is not proof of real non-use; category overlap is not proof of a duplicate. Gaps are user-confirmed. |
| Evidence / access | Six immutable single-garment recordings, private source requiring reviewer access, real captioned walkthrough. No measured conversion, return or impact improvement. |
| Deployment | Not published by Codex. The team must deploy on Oliwia's account, apply the prepared exact-origin allowlist and verify actual HTTPS Pages headers/CORS. |
