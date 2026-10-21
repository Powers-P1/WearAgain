# WearAgain: project brief

## Product decision
Online shops push shoppers to buy more. WearAgain answers a different question: what is the cheapest thing I need to buy to get the outfits I want, given the tops I already own? A shopper photographs 3 tops she owns and picks 3 candidate outerwear items from a shop. The app renders the 9 combinations with YouCam AI Clothes try-on (cloth VTO) on a synthetic model, she marks each as would wear / would not wear / render error, and a deterministic solver computes the cheapest basket that meets her declared needs, which may be zero purchases. The result carries a minimality certificate. Zero LLM calls. No faces of real people, and no face storage on our side.

## MVP scope
- Input: 3 owned tops (photos), 3 candidate items (shop catalogue entries with price), declared needs.
- 9 renders (or fewer, see decision-relevant rendering), rating UI, solver, result page with certificate.
- Demo mode from pre-rendered images; live mode behind a unit cap.
- Out of scope: lower-body garments, accounts, payments, real shop integration, face photos.

## Definitions
- Requirement model: a list of needs, each satisfied by a set of outfits. Example: "at least 2 outfits for work", "at least 1 outfit for rain". An outfit is a (top, outerwear) pair; owned items cost 0.
- Basket: a subset of the 3 candidates to buy (8 possible, including the empty basket).
- Satisfies: with the owned tops plus the basket, the outfits rated "would wear" meet every requirement.
- Minimality certificate: for the returned basket, the list of every cheaper basket together with the requirement it fails and the ratings that cause the failure. Unrated or errored combinations count as not worn, and the certificate says so.
- Decision-relevant combination: a combination whose rating could change which basket is the cheapest feasible one, given the ratings already known. Others need not be rendered.

## Architecture
- Front end: Cloudflare Pages (static, TypeScript).
- API: Cloudflare Worker holding the YouCam key; the browser never sees it.
- Unit ledger: a Durable Object (not KV) that reserves and commits units atomically, so the cap holds under concurrent requests.
- src/core: pure functions (requirements, baskets, solver, certificate) with tests on fixtures.
- src/youcam: client with recorded-shape fixtures. Fixtures are synthetic; raw API output is not published because the terms may restrict it (UNKNOWN).
- Demo mode serves saved renders; live mode calls YouCam and is capped.

## Constraints
- Free tier hosting; no paid services.
- Units: 1 000 total = 100 integration, 240 tests, 120 saved demo scenarios, 440 live (360 jury, 80 public), 100 reserve.
- YouCam retention of uploads: 30 days per docs (to verify). Our side keeps no images beyond the session.
- No faces: synthetic model only; garments photographed alone.

## Division of labour
ChatGPT/Codex writes code via pull requests; OK Agency side runs live YouCam calls with the key, records fixtures, deploys, reviews and merges. The key never enters the repository.

## Upgrades
1. Decision-relevant rendering: render only the combinations needed to decide between cheaper baskets; compare unit use with the full 9-image matrix.
2. Physical check: a few real outfits tried in person against the app's verdicts.

## Acceptance criteria
- Solver tests pass on fixtures, including the zero-purchase case and ties.
- Certificate lists every cheaper basket with a failed requirement; verified against an independent brute-force test.
- A live session completes within the unit cap; the Durable Object refuses calls past the cap, also under parallel requests.
- Demo mode works with no key and no calls to YouCam.
- No key or personal image in the repository.
- Public live URL and repository link ready for Devpost.

## Plan
- 22.10: repo skeleton, core types, solver (PR1).
- 23.10: certificate and tests; YouCam client against fixtures.
- 24.10: Worker, Durable Object ledger; integration spike with the key (100 units).
- 25.10: front end, rating UI.
- 26.10: decision-relevant rendering and unit comparison; saved demo scenarios.
- 27.10: physical check, polish, deployment.
- 28.10: freeze, bug fixes.
- 29-30.10: Devpost submission (Women in Tech category) and video; 31.10 buffer. Deadline 02.11 17:45 Polish time.

## Video outline (60-90 s, English)
1. Hook (10 s): "Before you buy a jacket, do you check what you already own that goes with it?"
2. Upload 3 tops, pick 3 jackets (10 s).
3. Nine renders appear; she rates them (20 s).
4. Result: the cheapest basket, possibly "buy nothing" (15 s).
5. Certificate: why nothing cheaper works (15 s).
6. Units saved by decision-relevant rendering versus the full matrix, and the YouCam API used (10 s).
7. Close: fewer returns, fewer impulse buys (5 s).
