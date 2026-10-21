# PR-D - Morning, mall session, wardrobe overview (boards 06, 09, 10, 11, 12)

**Scope:** `web2/**`, `tests/web2-*.test.mjs`, and `docs/UX_V2_GAPS.md` only. English-only UI from `web2/src/i18n.ts`. No Worker, provider budget, core solver, old web, Pages deployment, source images, or repository-visibility change.

## Implemented screens

- **Board 09, morning:** a readable brief, eligible/ready verification from the *owned* wardrobe, three independent recorded-upper-body example looks when available, selecting one and explicitly logging it as today's outfit. `wearToday()` saves one log per local calendar date (choosing another changes today's record). Missing ready items reduce the number honestly. No shopping prompts in the morning flow.
- **Board 10, mall camera:** one editable shop/floor context retained for subsequent captures; nonblocking successive `<input type=file capture=environment>` selections; photo blobs held in device IndexedDB, metadata in validated localStorage; a textual HTTPS link can be recorded without making an HTTP request. Every photo is a **candidate**, never owned clothing, never a YouCam render.
- **Board 11, coffee and returns:** saved/demo render previews and private photo/link candidates are *distinct*. Filter to genuine recorded renders; choose Skip / Go back for it; list of returns grouped by **user entered** shop and floor, with image when available. Decisions can be undone. No checkout, navigation maps or stock claims. Three seeded demo candidate images come from the exact YouCam manifest (one per upper-body garment) and the candidate IDs/labels from the *existing core fixture*.
- **Board 06 desktop, 12 mobile, overview:** metrics computed from `WardrobeState`, explicit `DailyState` wear logs, and user-maintained garment availability. Attention rows for repair/ironing and **no recorded wear** (not “unworn”); user-controlled Keep / Repair / Donate / Sell, with the action intentionally not deleting/transferring possessions. Extra items by category are not labelled duplicates; missing purchases stay unknown. An actual initial demo look is shown as the day's upper-body illustration.
- **PR-C polish:** the responsive purchase verdict moves first on mobile, all three candidates fit or can be chosen by arrows, missing visual records compress to a single honest explanation, disabled choices cannot appear pressed, fit caption once, Add photo / Paste link move to functional local gallery, source image edge strips masked only in small previews, exact keyboard focus and open Why? details restored on rerenders.
- **PR-B polish:** three distinct actual saved top render IDs (work/weekend/evening) rather than repeating top-work; mobile look app bar has Back / title / Save. Only the top of model renders is shown, because full-body model jeans do **not** represent wardrobe trousers. Wardrobe trousers/shoes remain separate tiles.

## Non-equivalence / deviations from design images

1. Board 09 microphone dictation is an optional, explicit browser Web Speech action where supported; it may use the browser vendor's online speech service and is never enabled by default. Typing and all outfit demo decisions remain offline. The board 09 middle frame says the app can be closed and notifications arrive. A static browser cannot guarantee this: preparation happens in the **open tab**, immediately using `proposeLooks()` deterministic verified demo suggestions; no fake elapsed timers, background push or notification is promised. A production resumable Worker/native job is left to a later scope.
2. Three *complete* composite outfits on the same model do not exist among current saved YouCam artifacts. The hero imagery shows **single top** recordings; the model base jeans are not the outfit trousers. Per-item thumbnails identify the actual wardrobe pieces. If fewer than three complete ready outfits exist, UI shows fewer; it never fabricates garments.
3. Board 10/11 depicts multiple automatically generating try-ons in a mall, and known shop/floor pairs. The Worker exposes no garment-capture queue or private-persistent shopping endpoint, and those shop locations are illustrations. Actual device captures are stored with condition **photo only/no saved model preview**; no API call is issued. Pre-existing saved renders are clearly labelled, and locations remain unknown until entered.
4. Camera entry depends on browser/device file and camera permissions, IndexedDB quota/retention and HTTPS context. Loss or blocking of IndexedDB prevents photo persistence; failure is reported and the item is not falsely marked saved. Captured photos/metadata are local to this browser; there is no multi-device sync, offline job queue or cross-app upload. The PWA is not extended in PR-D.
5. Board 06/12 numbers “28”, “16” and “5”, repair seam details, a six-month wear gap, two identical blazers and a rain-shoe shopping need are not true recorded user facts. Real numbers are derived only from actual items, their conditions and explicit wear logs. Unknown remains unknown; no product-condition computer vision or automatic disposal.
6. Retail photos and prices in boards are illustrative. Sample prices/ratings remain in the existing synthetic core fixtures only, not claimed as live store data. The purchase check does not assert that an excluded candidate is an identical duplicate.
7. Source photos for original board-05 inventory remain art-direction crops (per PR-A), NOT YouCam evidence. No new layered artwork is generated or exported.

## Safety and offline tests

`npm run check` should typecheck the core, Worker client, web and web2; run all existing CPU/workerd regression suites; then build both Pages bundles. New `tests/web2-daily-shopping.test.mjs` covers:
- distinct recorded hero IDs and complete ready-only morning looks;
- isolation of in-wash, ironing and repair; replacement of one daily wear log;
- authentic month counts, unknown gaps and user-owned lifecycle decisions;
- the three exact saved candidate recordings; shop/floor context snapshots; photo-only/link-only statuses;
- coffee shortlist/undo/grouping and no changes to owned inventory;
- storage validation, malicious image URLs, link scheme checks and image MIME/size bounds.

## Follow-on PR-E - **not started before PR-D merges**

Boards **13-17**: consumer landing; `/retail`, `/retail/demo`, `/judges`, `/judges/demo`; visibly highlighted **Judges - Start here** header action; PWA install shell; prepare but **do not trigger production switch** `web/` to `web2/`; create real responsive screenshots for review. Hackathon video/code/test links only after assets are available. This is a *separate* PR following review and merge.
