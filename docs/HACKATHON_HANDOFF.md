# WearAgain — submission handoff

Entry owner: Oliwia. Internal target: 31 October. [Official YouCam rules](https://youcam-api-skin-ai-ecommerce.devpost.com/rules), checked 23 October 2026: submission closes 2 November at 11:45 EST, or 17:45 in Warsaw. The app must remain available free for judging through 20 November. Source can be public with suitable licensing or private with the judging access specified in the rules. This repository remains private; its access and licence have not been changed.

The rules require a publicly visible 1–3 minute YouTube or Vimeo demonstration with the intended device experience and YouCam integration. A Pages-hosted file alone does not satisfy that hosting requirement. Damian approved the English **v7** film for handoff on 23 October; publication and submission remain separate owner actions. No entry or terms have been accepted on Oliwia's behalf.

## Approved final film

- [WearAgain-smooth-final-v7.mp4](demo/final-v7/WearAgain-smooth-final-v7.mp4): 74.5 seconds, 1080x1920, H.264/AAC, 60 fps; English Jessica narration and original generated music.
- SHA-256: `0af4fbaca6bf98cf0463f4fcc68ff861338cbf61e8b1aeb416f074ced2331fe1`.
- [Transcript](demo/final-v7/transcript.en.md), [WebVTT](demo/final-v7/captions.en.vtt), [SRT](demo/final-v7/captions.en.srt), [poster](demo/final-v7/poster.jpg), [manifest](demo/final-v7/manifest.json), [QA](demo/final-v7/QA.json), [provenance](demo/final-v7/PROVENANCE.json) and [independent motion review](demo/final-v7/motion-review.json).
- **Public YouTube/Vimeo URL: pending owner publication.** Earlier 93/121-second films and versions v2-v6 are superseded; do not upload them as the final.

The app pixels are actual responsive mobile/touch browser captures. Eased scrolling and transitions were edited for the film; these animations were not deployed to the app. The film is not an installed physical iPhone PWA recording. The separate brown-coat API test, saved examples and illustrative generated lifestyle opening remain identified.

The current jury player still embeds legacy `/video/wearagain-demo.webm`, not approved v7. A separately reviewed release should replace it or link to the approved public host. This documentation/media preparation performs no deployment. See [copy-ready submission package](SUBMISSION_PACKAGE.md).

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

The single authorized production YouCam task completed through the actual frontend and Worker and charged two credits. Its [receipt](validation/production-live-2026-10-22.json) includes read-only recovery of that same result. No second test render was started. Separate [live Sonnet](validation/live-agent-2026-10-23.json) and [dated weather](validation/live-weather-2026-10-23.json) receipts establish actual tool use, reload, feedback, preference and outfit save. The [historical 121-second recording](demo/README.md#historical-runtime-recording---not-the-approved-final) adds one real final-production Sonnet session and no new YouCam task. Its runtime evidence remains valid independently of the superseded film. These are demonstration checks, not measured consumer outcomes.

334 tests, strict types, both builds, Worker dry-run and Windows/Linux/Chromium CI passed. Browser checks include ten complete existing flows, 198 states, own-data flows at 390/1280, profile/photo transfer, PWA/offline/update, substitution versus price edits, current AI plan/list saves and known-preview GET recovery. See [verification](validation/agent-v2-2026-10-23.md) and [review closure](validation/final-review-2026-10-23.md).

Physical Android/iPhone installation and real garment-fitting trials remain manual; their worksheet is in verification. The demo does not claim authenticated cloud sync, personal-photo try-on, merchant checkout, recurring payments or physical size validation. The agent inspects enabled clothing input photos, not the resulting YouCam image.

The offline readiness check on 23 October repeated `npm run check` at base `499f9fb`: strict types, 334/334 tests, core and both frontend builds passed. Workerd tests intercept external traffic; this check opened no browser and made no provider call. It did not repeat earlier browser/physical-device testing.

## Remaining owner actions

1. Upload the approved v7 to publicly visible YouTube or Vimeo, attach English captions, and put the final URL into Devpost and this handoff.
2. Share private source with **contact_event@PerfectCorp.com**, the exact recipient in section 4 of the official rules, and verify accepted/read access. The primary agent confirmed the visible Devpost rules text on 23 October; the text extractor masks this address. No invitation or visibility change has been made here.
3. Review the [rights/source notes](SUBMISSION_PACKAGE.md#rights-and-source-notes), confirm team eligibility and authority to represent it, and maintain free judging access through 20 November. Keep live capacity available without presenting unlimited provider usage.
4. Submit the English description, testing instructions, app/source/video URLs as Oliwia, then retain the Devpost confirmation before the deadline. The signed-in account on the audit computer is Damian's; no account switch or submission was attempted.

State observed results only; do not claim measured time savings, reduced returns or conversion uplift without an actual study.
