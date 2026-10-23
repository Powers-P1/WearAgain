# WearAgain

[Jury demo](https://wearagain.pages.dev/judges/) · [Submission handoff](docs/HACKATHON_HANDOFF.md) · [136-second mobile demonstration](docs/demo/README.md)

WearAgain helps a shopper find the cheapest additional outerwear purchase that meets her declared outfit needs using tops she already owns. She judges pairs of separate garment previews; a deterministic solver chooses the basket and explains why every cheaper basket fails. The answer may be to buy nothing.

Built for the YouCam API Skin AI & eCommerce VTO Hackathon. The live Sonnet 5.5 stylist uses real wardrobe tools and editable private preferences; the deterministic core verifies availability and purchase certificates. Rendering remains per garment because the team's probe found that a second garment replaces the first. Three tops and three outerwear items need six successful images (12 YouCam units), reused across nine pair cards.

## Current scope

PR1 provides the exhaustive minimum-basket solver and certificate. PR2 adds per-element image state, revision-bound pair ratings, conservative selection of the next useful pair, requirement provenance, explicit wardrobe scoring/UNKNOWN, and pure typed tool contracts. PR3 adds the YouCam client, Worker routes and a SQLite Durable Object ledger with reservations, idempotency, daily limits and background reconciliation. Tests and CI require no key or provider calls.

`web/` preserves the previous frontend. The mobile-first PWA and desktop wardrobe centre are in [`web2/`](web2/README.md), built to `web2/dist`; the consumer landing keeps its earlier layout and imagery, with explicit mobile/install entry points. Six immutable single-garment YouCam recordings and a captioned walkthrough remain available without provider calls. Live occasion/morning styling, purchase advice, packing and rediscovery use the current user's wardrobe and memory. Saved examples remain a separate labelled mode.

Create an empty local profile in **My style**, add clothes and availability, save a preference, then choose **Live AI** in Stylist. Follow-up feedback revises the answer; a chosen look can be saved and worn in the app. **Check purchase → Use my wardrobe** builds a certificate from your own declared needs, shop candidates, prices and human ratings. A provisional basket stays provisional until decisive pairs are rated. The answer can be **buy nothing**. Explicit wardrobe-file transfer moves clothing photos and saved state to another device; it is not cloud synchronization. See [agent tools/privacy/limits](docs/AGENT_RUNTIME.md), [current UI scope](docs/UX_V2_GAPS.md), [Worker API](docs/API.md) and [release handoff](docs/DEPLOY_SWITCH_WEB2.md).

## Run locally

Use Node.js 24 and npm. TypeScript is pinned in the lockfile.

```sh
npm ci --ignore-scripts
npm run check
npm run build
```

`check` runs strict type checking, builds the core/client, and runs Node tests plus a real local `workerd`/SQLite emulator. Build output is written to `dist/` and is not committed. Tests include synthetic fixtures, an independent brute-force solver oracle, provider protocol replay, concurrent accounting and persistence across emulator restart. The emulator needs a loopback port; all external network requests are denied in its tests.

## Core contract

The public entry point is [src/core/index.ts](src/core/index.ts):

- `parseScenario(unknown)` validates version 1 JSON and normalises omitted ratings to `unrated`.
- `evaluateBaskets(scenario)` enumerates all purchase subsets and their current and optimistic requirement coverage.
- `solveBasket(scenario)` returns `solved`, `incomplete`, or `infeasible`.
- `getRequirementSource(requirement)` resolves legacy input to `user_chips`; event input records its event ID and manual/agent/fallback interpretation.
- `projectPairRatings(scenario, renderState)` replaces legacy ratings with user decisions tied to current, compatible image evidence.
- `selectNextPair(...)` plans only missing images for an unresolved contender; `compareRenderUsage(...)` compares successful output images, including repeats, against the six-image baseline.
- `assessWardrobeOutfit(...)` returns a 0-100 score or UNKNOWN under an explicit versioned policy. It does not write user ratings or decide purchases.
- `executeAgentTool(request, trustedContext)` validates the read/proposal allowlist. Render plans still require a Worker-side atomic reservation.
- `ScenarioValidationError` reports invalid input.

All prices use safe-integer minor units in one scenario currency. Owned items cost zero; a top-only outfit is an explicit `outerwearId: null` baseline. A requirement counts distinct available outfits rated `would_wear`. Ties use lowest cost, fewest newly acquired items, then stable candidate IDs.

**A render error is not a dislike.** `render_error` and `unrated` count as zero current acceptances but remain unresolved. Certificates identify every cheaper basket and distinguish a proven minimum price from a provisional result. Equal-price winner stability is reported separately. The proof concerns the supplied catalogue and ratings, not physical fit or image accuracy.

Provider-preview assessments use `projectPairRatings` before solving. Updating garment/base/pipeline revisions, attempt number or asset ID makes dependent decisions stale. The own-wardrobe purchase path also supports explicitly labelled direct clothing/photo assessments, with a separate revision-bound context; it does not fabricate provider render evidence. A ready image is not acceptance, and an AI score of 100 cannot create a `would_wear` rating. Synthetic replay fixtures remain a separate example.

## Project map

| Path | Purpose |
| --- | --- |
| [src/core](src/core/) | Pure domain, parser, solver, and certificate implementation. |
| [fixtures/core](fixtures/core/) | Synthetic wardrobe and requirement scenarios; prices are test data. |
| [tests](tests/) | Regression checks and an independent exhaustive oracle. |
| [src/youcam](src/youcam/) | Typed one-shot YouCam client, strict response/image validation and bounded transport. |
| [worker/src](worker/src/) | HTTP/session boundary, SQLite ledger, rate gate and reconciliation alarms. |
| [docs/API.md](docs/API.md) | Frontend integration contract, accounting semantics and recorded-demo handoff. |
| [docs/PRD.md](docs/PRD.md) | Domain/tool contracts, acceptance criteria, PR1-PR5 including PR4b, and pending decisions. |
| [docs/BRIEF.md](docs/BRIEF.md) | Original approved product brief. |
| [docs/YOUCAM_NOTES.md](docs/YOUCAM_NOTES.md) | Provider evidence and unresolved integration questions. |

## Integration and publication boundaries

The OK Agency team owns live YouCam probes, secrets, deployment, review, and merging. Its probe reports 2 units per successful image, no charge for the observed parameter/decode errors, and 24-hour provider retention; see [docs/YOUCAM_NOTES.md](docs/YOUCAM_NOTES.md). PR3 reserves 2 units before any YouCam call, commits once on confirmed success, and releases only against the narrow confirmed-free evidence allowlist. Timeouts and unknown error charges remain pending, including across day changes. Output-publication permissions still need resolution. Public protocol fixtures use synthetic data; raw responses, keys and photos of real people do not belong in the repository. See [fixtures/README.md](fixtures/README.md).

The Pages demo and live mode are labelled distinctly. Demo replays permitted saved images with no provider calls; saved agent transcripts belong to PR4b. Live rendering requires a reservation; a plan is not a reservation. PR3 allows only approved synthetic adult base images and ephemeral garment uploads. Personal model photos are a later explicit-consent path, never stored by this application; this does not imply zero provider retention. Physical-check outcomes, live latency and spending/return reductions are not measured by offline tests.

## License

Proprietary. All rights reserved; see [LICENSE](LICENSE). Hackathon judges with read access may evaluate the work; earlier MIT-licensed versions (before 21 October 2026) keep that licence for those versions only.

