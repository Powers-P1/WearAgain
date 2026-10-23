# WearAgain - copy-ready submission package

Prepared 24 October 2026. [Handoff](HACKATHON_HANDOFF.md) tracks release status; [approved media](demo/README.md) identifies v7. Publication, source invitation and submission remain owner actions.

## Submission fields

- Project: **WearAgain**
- Tagline: **Does this purchase earn a place in your wardrobe?**
- Working demo: https://wearagain.pages.dev/judges/
- App: https://wearagain.pages.dev/app/#wardrobe
- Source: https://github.com/Powers-P1/WearAgain (private; judge access pending confirmation)
- Public video: **pending owner publication of approved v7 on YouTube or Vimeo**.
- Built with: YouCam AI Clothes Try-On API (`cloth-v4`), TypeScript, Cloudflare Pages, Workers, SQLite Durable Objects, Claude Sonnet 5.5, IndexedDB and a scoped service worker.

## Description

### What it does

WearAgain helps a shopper answer one question before buying: does this piece work with the clothes I already own?

Photograph a garment in a shop, keep browsing and review the shortlist over coffee. YouCam's AI Clothes Try-On API creates separate garment previews on a synthetic demo model. Decide which shop/wardrobe pairings you would actually wear. WearAgain checks the selected clothes, declared needs, availability, prices and your ratings to find the minimum-item-cost basket and explain why cheaper choices fail. If your wardrobe already covers the needs, buy nothing is a successful result.

The personal wardrobe and AI stylist support that decision. Keep clothing availability, describe your style in your own words, ask for an occasion or packing list, refine a suggestion with feedback and save a verified outfit. These are supporting workflows, rather than extra steps required before checking a purchase.

### How we built it

The mobile-first PWA stores separate local profiles and clothing photos on the device. Explicit wardrobe-file transfer moves allowlisted state and photos to another device; it is not cloud account synchronization. A Worker keeps provider keys out of the browser. A SQLite UnitLedger reserves render units before a task, prevents duplicate submissions and retains ambiguous charges for reconciliation.

The live Sonnet stylist uses bounded tools over the current profile, wardrobe, editable preferences, history, enabled clothing photos, dated weather, catalogue, preview planning and solver. Saved examples are a separate labelled mode. AI suggestions and ready images never manufacture the user's wear ratings.

An optional [nine-step interactive walkthrough](https://wearagain.pages.dev/app/?guide=start#wardrobe) uses actual item inspection, preference saving, a human pair rating, the zero-purchase solver, outfit saving, a new clothing photo and coffee review, wear logging, packing and item review. Next is conditional on the relevant result. It starts no paid API automatically, supports pause/minimize/keyboard controls, and keeps progress separate for each local profile. An empty wardrobe requires the user's real input; it is never silently filled with sample clothes.

English [VTT captions](https://wearagain.pages.dev/video/wearagain-final-v7.en.vtt) and [SRT subtitles](https://wearagain.pages.dev/video/wearagain-final-v7.en.srt) are downloadable. The jury player selects English captions by default.

### Value and limits

The decision links a proposed purchase to clothes and needs the shopper supplied. An independently tested deterministic solver produces the certificate. We verified the working API path and actual app flows; we have not measured reduced returns, spending, time savings or conversion uplift.

Previews illustrate style, not size fit. Merchant stock, delivery and fees remain unknown without evidence. There is no merchant checkout, automated recurring order, personal-photo model try-on or authenticated cloud sync. Film motion is editorial polish; the shown app states and results are actual captures.

## Testing instructions

No sign-in is needed for the public demo. The private source needs the judging access described below. Provider secrets are excluded from the source and frontend.

1. Open https://wearagain.pages.dev/judges/demo/ and follow Wardrobe, Preview and Verdict. The same Nova jacket appears in the actual recorded single-garment preview and purchase decision. The labelled saved examples make no paid provider call.
2. Open https://wearagain.pages.dev/app/#check. In the considered-purchase example, Nova initially covers the declared needs for PLN 90 using preset ratings. Rate Nova with the evening top as a pair you would not wear: the basket changes to Aster + Mila at PLN 100 while the manually viewed Nova remains selected. The change follows your rating; the preview did not create that preference. Switch to buy-nothing to see the separate zero-purchase outcome. Unresolved decisive ratings keep a result provisional.
3. In https://wearagain.pages.dev/app/#wardrobe the sample is labelled. In My style, create a separate empty local profile, add garments/availability and save a preference. Photos stay local unless live processing is explicitly enabled.
4. In Check purchase -> Use my wardrobe, declare needs, shop candidates, prices and human ratings. Changing inputs recomputes the certificate; unresolved cheaper pairings leave it provisional.
5. Explore Stylist, saved looks, trip packing and return lists in saved-example mode. Live AI/YouCam are separately opt-in and consume a limited team allowance; the initial safe journey does not need them.

For a local check use Node 24, `npm ci --ignore-scripts`, then `npm run check`. The final release report records the exact commit and test count. Workerd tests intercept network traffic; no production key is required.

PWA hooks/offline behavior have earlier automated browser evidence. Physical Android/iPhone installation remains a manual check. The film used responsive mobile/touch browser emulation, not an installed physical iPhone.

## Source access and release fields

The [official rules, section 4](https://youcam-api-skin-ai-ecommerce.devpost.com/rules) allow private source shared with **contact_event@PerfectCorp.com**. This exact address was confirmed in the visible official rules by the primary agent on 23 October; text tools mask it. Oliwia must grant the corresponding recipient read access and confirm acceptance/access before submission. No invitation or visibility change occurred here.

Upload the exact approved v7 with English captions, make it publicly visible on YouTube or Vimeo, and copy the resulting URL into Devpost. Keep the project free for judging through 20 November. Confirm eligibility/team representation and submit before **2 November 2026, 11:45 EST / 17:45 Warsaw**. Retain the confirmation receipt. Optional special-award eligibility must be declared truthfully by the entrant.

The audit computer's current Devpost account belongs to Damian; the WearAgain representative is Oliwia. This package neither switches accounts nor accepts terms for her. The prepared jury player references approved v7, copied from the canonical documentation package at build time. A separately reviewed preview/production release is still required; merging this package does not deploy the direct-upload Pages project.

## Why this entry fits the judging criteria

- **Implementation:** actual YouCam job/result path, revision-bound human ratings, independently tested basket solver and a reservation ledger. The measured production task succeeded and cost two credits; its original listener required read-only recovery of the same result.
- **Design:** mobile-first photo queue, a coherent purchase decision and a full desktop wardrobe workspace. The same candidate must stay identifiable from preview to result. PWA installation guidance does not claim unsupported one-tap iPhone installation.
- **Potential impact:** a specific pre-purchase decision for someone who knows her wardrobe but does not know whether another item adds useful combinations. Reduced spending, fewer returns and willingness to pay are hypotheses, not measured results.
- **Idea:** use a visual preview to help a person make explicit wear decisions, then check those decisions against her wardrobe. The system is allowed to recommend no purchase.

The next business validation is a small observed shopping task: record unclear steps, whether the preview changes a stated pairing judgement, whether the final shortlist is useful, and whether anyone would pay. Compare with the shopper's existing photo/chat workflow. Do not present that proposed study as completed research.

## Rights and source notes

The [September 2026 API Terms](https://www.perfectcorp.com/perfectbeauty/youcam/terms-of-service-api), checked 23 October, distinguish provider material from generated output. Sections 3.5.3/11.3 disclaim ownership of generated output and permit commercial output use, while lawful inputs/outputs and third-party rights remain the user's responsibility. This resolves the earlier blanket output-use UNKNOWN; it does not certify every input or soundtrack licence.

The final [provenance](demo/final-v7/PROVENANCE.json) records the ImageGen first frame, generated Veo lifestyle shot, generated instrumental and preset Jessica synthetic voice. References were studied without copying their footage or music. API previews use synthetic adults and project garment artwork. Retain applicable generation/account rights evidence and confirm original-work/eligibility declarations before external publication. No real consumer trial or third-party endorsement is claimed.

Worker photo/session expiry is separate from provider policy. API Terms section 12.4 describes a general 30-day period, while section 1.3 refers to service-specific retention; the integration notes report 24-hour upload/result availability. Neither a result-link lifetime nor local cleanup establishes universal provider deletion. DPA/processing region and backup deletion remain unverified.
