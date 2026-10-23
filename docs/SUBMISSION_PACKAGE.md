# WearAgain - copy-ready submission package

Prepared 23 October 2026. [Handoff](HACKATHON_HANDOFF.md) tracks release status; [approved media](demo/README.md) identifies v7. Publication, source invitation and submission remain owner actions.

## Submission fields

- Project: **WearAgain**
- Tagline: **More outfits. Better choices. More you.**
- Working demo: https://wearagain.pages.dev/judges/
- App: https://wearagain.pages.dev/app/#wardrobe
- Source: https://github.com/Powers-P1/WearAgain (private; judge access pending confirmation)
- Public video: **pending owner publication of approved v7 on YouTube or Vimeo**.
- Built with: YouCam AI Clothes Try-On API (`cloth-v4`), TypeScript, Cloudflare Pages, Workers, SQLite Durable Objects, Claude Sonnet 5.5, IndexedDB and a scoped service worker.

## Description

### What it does

WearAgain starts with clothes you already own. Keep a personal wardrobe and availability, describe your style in your own words, and ask an AI stylist for an occasion, packing list or a fresh way to wear a forgotten piece. Save verified outfits and refine a suggestion with feedback.

In a shop, collect individual garment photos and review the shortlist later. YouCam's AI Clothes Try-On API creates separate garment previews on a synthetic demo model. Decide which shop/wardrobe pairings you would actually wear. WearAgain checks the declared needs, availability, prices and your ratings to find the minimum-item-cost basket and explain why cheaper choices fail. If your wardrobe already covers the needs, buy nothing is a successful result.

### How we built it

The mobile-first PWA stores separate local profiles and clothing photos on the device. Explicit wardrobe-file transfer moves allowlisted state and photos to another device; it is not cloud account synchronization. A Worker keeps provider keys out of the browser. A SQLite UnitLedger reserves render units before a task, prevents duplicate submissions and retains ambiguous charges for reconciliation.

The live Sonnet stylist uses bounded tools over the current profile, wardrobe, editable preferences, history, enabled clothing photos, dated weather, catalogue, preview planning and solver. Saved examples are a separate labelled mode. AI suggestions and ready images never manufacture the user's wear ratings.

### Value and limits

The decision links a proposed purchase to clothes and needs the shopper supplied. An independently tested deterministic solver produces the certificate. We verified the working API path and actual app flows; we have not measured reduced returns, spending, time savings or conversion uplift.

Previews illustrate style, not size fit. Merchant stock, delivery and fees remain unknown without evidence. There is no merchant checkout, automated recurring order, personal-photo model try-on or authenticated cloud sync. Film motion is editorial polish; the shown app states and results are actual captures.

## Testing instructions

No sign-in is needed for the public demo. The private source needs the judging access described below. Provider secrets are excluded from the source and frontend.

1. Open https://wearagain.pages.dev/judges/demo/ and follow Wardrobe, Preview and Verdict. The labelled saved examples make no paid provider call.
2. Switch between considered-purchase and buy-nothing examples. Prices and preferences are example inputs. Inspect the explanation; separate previews do not claim combined fit.
3. In https://wearagain.pages.dev/app/#wardrobe the sample is labelled. In My style, create a separate empty local profile, add garments/availability and save a preference. Photos stay local unless live processing is explicitly enabled.
4. In Check purchase -> Use my wardrobe, declare needs, shop candidates, prices and human ratings. Changing inputs recomputes the certificate; unresolved cheaper pairings leave it provisional.
5. Explore Stylist, saved looks, trip packing and return lists in saved-example mode. Live AI/YouCam are separately opt-in and consume a limited team allowance; the initial safe journey does not need them.

For a local check use Node 24, `npm ci --ignore-scripts`, then `npm run check`. All 334 offline tests, strict types and both frontend builds passed on 23 October at base `499f9fb`. Workerd tests intercept network traffic; no production key is required.

PWA hooks/offline behavior have earlier automated browser evidence. Physical Android/iPhone installation remains a manual check. The film used responsive mobile/touch browser emulation, not an installed physical iPhone.

## Source access and release fields

The [official rules, section 4](https://youcam-api-skin-ai-ecommerce.devpost.com/rules) allow private source shared with **contact_event@PerfectCorp.com**. This exact address was confirmed in the visible official rules by the primary agent on 23 October; text tools mask it. Oliwia must grant the corresponding recipient read access and confirm acceptance/access before submission. No invitation or visibility change occurred here.

Upload the exact approved v7 with English captions, make it publicly visible on YouTube or Vimeo, and copy the resulting URL into Devpost. Keep the project free for judging through 20 November. Confirm eligibility/team representation and submit before **2 November 2026, 11:45 EST / 17:45 Warsaw**. Retain the confirmation receipt. Optional special-award eligibility must be declared truthfully by the entrant.

The audit computer's current Devpost account belongs to Damian; the WearAgain representative is Oliwia. This package neither switches accounts nor accepts terms for her. The jury page's legacy video should be replaced/linked in a separately reviewed site release. Merging this package does not deploy the direct-upload Pages project.

## Rights and source notes

The [September 2026 API Terms](https://www.perfectcorp.com/perfectbeauty/youcam/terms-of-service-api), checked 23 October, distinguish provider material from generated output. Sections 3.5.3/11.3 disclaim ownership of generated output and permit commercial output use, while lawful inputs/outputs and third-party rights remain the user's responsibility. This resolves the earlier blanket output-use UNKNOWN; it does not certify every input or soundtrack licence.

The final [provenance](demo/final-v7/PROVENANCE.json) records the ImageGen first frame, generated Veo lifestyle shot, generated instrumental and preset Jessica synthetic voice. References were studied without copying their footage or music. API previews use synthetic adults and project garment artwork. Retain applicable generation/account rights evidence and confirm original-work/eligibility declarations before external publication. No real consumer trial or third-party endorsement is claimed.

Worker photo/session expiry is separate from provider policy. API Terms section 12.4 describes a general 30-day period, while section 1.3 refers to service-specific retention; the integration notes report 24-hour upload/result availability. Neither a result-link lifetime nor local cleanup establishes universal provider deletion. DPA/processing region and backup deletion remain unverified.
