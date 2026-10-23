# WearAgain — submission handoff

Entry owner: Oliwia. Internal target: 31 October. [Official YouCam rules](https://youcam-api-skin-ai-ecommerce.devpost.com/rules), checked 23 October 2026: submission closes 2 November at 11:45 EST, or 17:45 in Warsaw. The app must remain available free for judging through 20 November. Source can be public with suitable licensing or private with the judging access specified in the rules. This repository remains private; its access and licence have not been changed.

The rules require a publicly accessible 1–3 minute YouTube or Vimeo demonstration with the intended device experience and YouCam integration. A Pages-hosted file alone does not satisfy that hosting requirement. The prepared English recording is a handoff asset; publishing its final URL, granting the required private-source judging access, checking eligibility/rights and submitting Devpost remain with Oliwia. No entry or terms have been accepted on her behalf.

## Links and short judge journey

- Jury entry: https://wearagain.pages.dev/judges/
- App: https://wearagain.pages.dev/app/#wardrobe
- Own-data purchase check: https://wearagain.pages.dev/app/#my-check
- Kept-wardrobe example: https://wearagain.pages.dev/app/?scenario=zero#check
- Repository: https://github.com/Powers-P1/WearAgain

The jury page leads into a small saved example without a paid call. The app also starts an empty local profile, accepts garment photos and availability, keeps editable preferences, and offers real AI styling with explicit optional photo/render consent. Use a built-in model for live YouCam previews. Photos with people are not accepted as garment inputs.

## Submission description draft

WearAgain helps people decide what to wear and whether a new purchase earns a place in their wardrobe. It combines a personal wardrobe, an AI stylist and a deterministic minimum-item-cost certificate. Its honest answer can be to buy nothing.

The mobile-first PWA supports collecting shop photos, reviewing a shortlist over coffee, fast work outfits, occasion styling, packing and rediscovering rarely logged pieces. The desktop workspace provides a wardrobe overview, availability, saved outfits and needs. Sonnet uses tools for the actual profile, full wardrobe, editable memory, history, enabled clothing photos, dated weather, the user's catalogue, previews, the solver and verified saves. Feedback revises the previous answer against current data. Local profiles and photos are separated; moving a wardrobe to another device uses an explicit file transfer.

YouCam renders individual garments on built-in models through the existing Worker and UnitLedger. A preview illustrates style, not physical size. Human pair ratings remain the user's judgement. The solver certifies minimum item cost for those declared needs and ratings, with unresolved alternatives left provisional. Store stock, delivery and fees stay UNKNOWN without merchant evidence. There is no checkout or monthly automatic order in this demo.

## Evidence and boundaries

The single authorized production YouCam task completed through the actual frontend and Worker and charged two credits. Its [receipt](validation/production-live-2026-10-22.json) includes read-only recovery of that same result. No second test render was started. Separate [live Sonnet](validation/live-agent-2026-10-23.json) and [dated weather](validation/live-weather-2026-10-23.json) receipts establish actual tool use, reload, feedback, preference and outfit save. The [136-second recording](demo/README.md) adds one real final-production Sonnet session and no new YouCam task. These are demonstration checks, not measured consumer outcomes.

334 tests, strict types, both builds, Worker dry-run and Windows/Linux/Chromium CI passed. Browser checks include ten complete existing flows, 198 states, own-data flows at 390/1280, profile/photo transfer, PWA/offline/update, substitution versus price edits, current AI plan/list saves and known-preview GET recovery. See [verification](validation/agent-v2-2026-10-23.md) and [review closure](validation/final-review-2026-10-23.md).

Physical Android/iPhone installation and real garment-fitting trials remain manual; their worksheet is in verification. The demo does not claim authenticated cloud sync, personal-photo try-on, merchant checkout, recurring payments or physical size validation. The agent inspects enabled clothing input photos, not the resulting YouCam image.

For the final submission, use the English recording/transcript, current demo URL and private-source instructions. State observed results only; do not claim measured time savings, reduced returns or conversion uplift without an actual study.
