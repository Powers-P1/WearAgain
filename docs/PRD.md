# WearAgain product requirements

Status: PR2 domain and tool contracts, 2026-10-21. This document implements the approved [brief](BRIEF.md) and Damian's later decisions: separate garment previews and an AI Stylist in PR4b. Historical nine-layered-image and zero-LLM descriptions are superseded. Remaining product policies marked UNKNOWN do not acquire invented defaults.

## Outcome and boundaries

A shopper wants the cheapest additional outerwear purchase that gives her the outfits she has explicitly accepted for her stated needs. The MVP renders three owned tops and three candidate outerwear items separately on the same synthetic base. Six images serve nine side-by-side pair cards; these are not a simulation of garment layering. An owned outerwear item or a top-only outfit can provide an explicit zero-purchase baseline.

Minimum cost refers to the supplied item prices and requirements. It does not establish personal affordability, garment fit, comfort, weather protection, or return rates. A user decides whether she would wear a rendered outfit; product attributes and requirement membership come from declared inputs rather than visual inference. Reduced spending, impulse purchases, or returns remain hypotheses until measured.

The hackathon submission is planned as a team entry represented by Oliwia Karolewska, with Damian on the team and an intended Women in Tech opt-in. Prize eligibility is subject to the organiser's rules and verification, not an application guarantee.

### Included

- Owned tops, owned outerwear, purchase candidates, explicit outfit pairs, count requirements, and user ratings.
- Exact minimum-price basket and an inspectable minimality certificate.
- Conservative selection of the next unresolved pair that may affect the result, reusing per-item images and comparing with six successful images / 12 units for the three-by-three case.
- Requirement provenance and a separate versioned wardrobe assessment (0-100 or UNKNOWN).
- Pure typed tool contracts for the future AI Stylist: AI proposes; the deterministic core verifies.
- A keyless, labelled demonstration using permitted pre-rendered assets, plus a separately metered live path in later PRs.
- A small physical comparison of real garments against the user's rendered-outfit decisions.

### Outside the MVP

Lower-body rendering, accounts, payments, real checkout integration, medical analysis, and claims of measured reduction in returns. PR4b adds the bounded tool-using AI Stylist and an optional personal model photo in live mode with explicit consent and no application-side storage. PR2 makes no AI/provider calls. A synthetic model is a demonstration figure, not a reconstruction of the shopper's body.

## Version 1 domain contract

The canonical TypeScript contract is [src/core/types.ts](../src/core/types.ts); JSON is admitted through `parseScenario(unknown)` rather than a type assertion. PR1 core data contains no API key, image bytes, provider URL, or provider task ID.

| Entity | Contract and meaning |
| --- | --- |
| Scenario | `schemaVersion: 1`, one uppercase three-letter `currency`, and lists of tops, outerwear, outfits, requirements, and ratings. No currency conversion occurs. |
| Owned top | Stable `id` and display `label`; available at no additional purchase cost. |
| Outerwear | `kind: "owned"` is always available without purchase; `kind: "candidate"` has a nonnegative safe-integer `priceMinor`. A free candidate is still a new item. |
| Outfit | Unique `id`, `topId`, and `outerwearId`; `null` explicitly denotes an owned-top-only baseline. Duplicate top/outerwear pairs are invalid. |
| Requirement | `{id, label, minCount, outfitIds, source?}`; `outfitIds` is a set and `minCount` is a nonnegative integer. One accepted outfit may satisfy several requirements. |
| Rating | `would_wear`, `would_not_wear`, `unrated`, or `render_error` with a nonempty `reason`. Missing ratings normalise to `unrated`. |

Inputs must have unique identifiers within their entity lists, valid references, no duplicate requirement members or ratings, and valid status and money values. Summed candidate costs must remain safe integers. The exact solver is bounded to 12 purchase candidates; the demonstration uses three, so there are eight purchase baskets. Limits protect exhaustive enumeration and must not be silently replaced with an approximate result.

Prices represent the supplied catalogue item's price in minor units, not an inferred discount. Shipping and other order-level fees are not modelled in version 1. Catalogue timestamps, source URLs, publication rights, and real-versus-synthetic provenance belong to the catalogue/fixture documentation, not to a guessed price inside the solver.

### Requirement provenance

`source` is either `{kind: "user_chips"}` or `{kind: "event", eventId, interpretation: "manual" | "agent" | "fallback"}`. Omitted source means user chips; `getRequirementSource` resolves that default without changing the shape of legacy fixture JSON. Explicit source values are strictly validated and copied. Provenance never changes outfit counts, accepts a pair, or establishes the truth of a model's interpretation.

### Per-element renders and per-pair decisions

`RenderState` holds one current `ItemRender` per namespaced `{kind: "top" | "outerwear", id}` and a separate list of user `PairRating` records. A render identity includes garment, base and pipeline revisions plus an attempt number. A ready image adds an opaque asset ID. Images and provider URLs are not stored in the core.

A pair decision records the exact identities and asset IDs of both displayed images (one image for a top-only baseline). `projectPairRatings` checks those against the current state and compatible base/pipeline revisions. Missing, pending, replaced or incompatible images project to `unrated`; an element error affects every dependent pair as unresolved `render_error`. A user-reported defective preview also remains unresolved. Retrying and changing an image invalidates dependent old decisions. Explicit render-state projection ignores legacy `Scenario.ratings`, so old accepted flags cannot bypass current image evidence.

`planElementRender` and `planPairRender` return declarative requests for missing images. Existing ready images are reused. Pending jobs, errors needing an explicit retry, undefined image inputs and incompatible bases block automatic execution. A render request identifies what is needed and estimates units; it is not a capability or proof that any units were reserved.

`selectNextPair` considers unresolved members of unsatisfied requirements in still-possible baskets that outrank the current feasible winner. It accounts for several unknown approvals being necessary together and for preferred equal-price ties. It orders candidates by the cheapest possible basket, then the fewest missing images, then stable outfit IDs. This is a conservative policy, not a claim of globally minimum questions or image calls. It stops only at a stable solved result or proven infeasibility; unresolved errors can instead produce `blocked`.

`compareRenderUsage` receives an explicit list of successful output images, including repeated renders. It reports distinct elements and repeats separately. For the standard matrix, the baseline is nine pair cards but six images / 12 units. Extra successful retries can exceed that baseline. Pending/timeout accounting and the actual balance belong to the ledger in PR3, not to this arithmetic.

### Wardrobe assessment

`assessWardrobeOutfit` validates that the outfit consists only of owned items, then aggregates supplied evidence under an explicit policy. The five supported dimensions are formality, warmth, rain, footwear and colour. A policy supplies positive integer weights, a version and an optional threshold; no weights or thresholds are assumed. The result is the rounded weighted mean in 0-100 only when every included dimension has a known score. Missing dimensions are never replaced with zero or silently removed from the denominator. A null policy or missing evidence returns `status: "unknown"`, `score: null`, a reason and diagnostic components. A null threshold produces `meetsThreshold: null`, not failure.

The result records whether evidence comes from declared attributes or an agent proposal. Deterministic aggregation does not independently verify that evidence. It never writes a pair rating, infers `would_wear`, proves physical properties, or turns a low score into an instruction to buy. Product scoring weights, the threshold and the later translation from verified event conditions into solver requirements remain **UNKNOWN** until PR4b. Footwear can therefore remain UNKNOWN in this upper-body MVP.

### Agent tool boundary

`executeAgentTool(request, trustedContext)` is a pure dispatcher over strictly validated request/result unions. The application supplies the scenario, image-bound user decisions, one-shop catalogue, city/weather snapshots and configured unit cost. Agent arguments cannot replace these snapshots or introduce ratings, prices, requirements or reservations.

The allowlist is `get_wardrobe`, `search_catalogue`, `lookup_city`, `get_weather`, `plan_render` and `solve_basket`. Catalogue products use explicit IDs and map admitted candidates to exactly matching prices/currency; unknown products, shops or city IDs are rejected. Missing prices, availability, delivery dates/fees, pickup details or weather remain explicit UNKNOWN. The solver tool always projects render-bound pair decisions first and returns `commerceVerification: "not_performed"`: its certificate proves current requirement coverage and item-price minimality, not stock, shipping fees or arrival time.

Inventory and query outputs are copies. There is no rating-write tool. Weather is read from an injected snapshot, and rendering returns a plan only; network I/O, access control, atomic reservations, session/day limits and provider execution belong to the Worker adapter in PR3/PR4b. `worker/src/index.js` currently contains only a `UnitLedger` placeholder. Keep the existing `v1` SQLite migration unchanged.

## Solver and certificate semantics

`evaluateBaskets(scenario)` evaluates all subsets of purchase candidates, including the empty subset. Owned items are available in every basket and are never charged. An outfit containing a candidate is available only if that candidate is in the basket.

For each requirement, count distinct available outfits rated `would_wear`. A basket is currently feasible when every count meets its `minCount`. Empty requirements select an empty basket. A requirement with insufficient eligible outfits is allowed input and can correctly produce no solution.

The total deterministic ordering is:

1. Lowest `costMinor`.
2. Fewest newly acquired candidate items.
3. Lexicographic order of sorted candidate IDs, independent of input order and locale.

`solveBasket(scenario)` returns:

- `solved`: the best currently feasible basket and its certificate.
- `incomplete`: no currently feasible basket, but unresolved evidence could enable one.
- `infeasible`: no basket can meet the requirements even if every available unresolved outfit were accepted.

Only `would_wear` counts as acceptance. `unrated` and `render_error` contribute zero to the current accepted count, as required by the brief, but remain unresolved rather than becoming evidence of dislike. An errored image may be retried and rated later. Upper-bound feasibility assumes all available unresolved outfits are accepted; it is a possibility, not a recommendation.

Every solved result has a certificate with `scope: "current_ratings"`:

- `cheaperBaskets` lists **every strictly cheaper basket**, including the empty basket when it is cheaper, with failed requirements and available/rating evidence.
- `preferredTiedBaskets` lists infeasible equal-price baskets that would outrank the winner by item count or IDs.
- `priceOptimality: "proven"` means every cheaper basket is impossible even under optimistic unresolved ratings; otherwise it is `provisional`.
- `selectionStability: "stable"` additionally rules out a change of winner caused by preferred equal-price baskets; otherwise it is `provisional`.
- Unresolved outfit IDs and render-error reasons remain visible in evidence.

A proven minimum is relative to this catalogue, price snapshot, requirement definition, and confirmed ratings. It is not proof of physical fit or correctness of a generated image. A provisional result must not be labelled an unconditional minimum in the UI.

## Delivery sequence and owners

| PR | Deliverable | Gate |
| --- | --- | --- |
| PR1 | TypeScript skeleton, this PRD, domain parsing, exhaustive solver, certificate, synthetic fixtures, independent oracle tests, CI. | `npm run check`; no key or network call needed. |
| PR2 | Per-element renders, revision-bound pair ratings, conservative selection, requirement source, wardrobe assessment/UNKNOWN, and typed pure agent tools. | Same final basket as complete pair evidence on replay scenarios, including ties; six-image baseline; no stale/unknown pair accepted and no tool rating write. |
| PR3 | YouCam adapter against synthetic recorded-shape fixtures, Worker, and Durable Object unit ledger. | Contract fixtures from the team's probe; atomic reserve/commit/release and idempotency verified under concurrent requests. |
| PR4 | Pages frontend, rating UI, certificates, explicit prerecorded demo and capped live modes. | Keyless demo makes no provider calls; live costs are reserved before calls; incomplete/error states are usable on desktop and mobile. |
| PR4b | AI Stylist: event interpretation, 2-3 reasoned proposals, bounded tool calls, assessments and single-shop purchase suggestions. | Unknown IDs rejected, agent scores separate from user decisions, reservations and session/day budgets enforced, demo transcript replay makes no calls. |
| PR5 | Deployment configuration, release and operator instructions, fixture/provenance checks, smoke-test and submission handoff. | OK Agency deploys and confirms the public URL and judging access; no secrets in commits. |

ChatGPT/Codex supplies code through reviewable PRs. The OK Agency/Fable side owns live probing, recording fixture shapes, secrets, deployment, review, and merges. The developer does not receive the YouCam key. This PR does not perform deployment or use paid API units.

## Integration evidence and budget

[YOUCAM_NOTES.md](YOUCAM_NOTES.md) records the team's probe: a successful result image costs 2 units; observed terminal parameter/decode errors cost zero. Uploads/results have 24-hour retention, while download links may expire sooner. The probe also showed that layering replaces the first garment, so the current design uses separate previews. The configured cost is passed explicitly to PR2 functions. Output-publication permissions and ambiguous/timeout charging remain **UNKNOWN**; a timeout is not evidence for releasing a reservation.

The agreed planning allocation remains 1,000 units: 100 integration, 240 tests, 120 saved scenarios, 440 live (360 judging and 80 public), and 100 reserve. This is a budget allocation, not a guarantee of any number of live sessions. A complete first rendering of the three-by-three matrix uses six successful images / 12 units, excluding preparation of a synthetic base and additional successful retries. A completed live path needs a concurrent-safe ledger and a policy for uncertain outcomes. PR4b adds separate configurable LLM step/token/session/day budgets; their numeric limits remain **UNKNOWN**. It supersedes the earlier single-call Workers AI plan. Secrets, configured provider model IDs and live integration are owned by the team; this PR makes no claim to have tested model availability.

Raw provider recordings stay outside the public repository. Commit only synthetic response shapes with invented identifiers/URLs and assets whose publication rights have been established. Personal garments are photographed alone; generated assets use synthetic figures. Cleanup behaviour must be verified against the provider rather than advertised as zero provider retention.

## Verification and demonstration

### PR1 acceptance

- Fixtures exercise positive count requirements, zero purchase, ownership, overlaps, ties, impossible needs, incomplete evidence, and render errors.
- An independently implemented brute-force test checks optimum selection and the completeness and truth of the failure certificate; it must not reuse the production evaluator as its oracle.
- Tests ensure that optimistic unresolved evidence cannot be presented as a rejection and that equal-price winner stability is separate from minimum-price proof.
- Runtime validation rejects invalid identifiers/references, duplicate pairs or ratings, unsafe prices/counts, and malformed statuses before solving.
- TypeScript builds with strict checking; GitHub Actions runs the same `npm run check` command as local development.

### Later comparison and physical check

For selection, freeze complete pair decisions and replay them incrementally. Record final basket, price, certificate status, pair questions, distinct rendered elements, successful repeats, the six-image baseline and configured unit totals. Record synthetic-base preparation separately. A saving claim is valid only alongside matching basket outcomes and stated assumptions. Partial certificates need not contain the same individual ratings as full-matrix certificates; they must still establish the same stable optimum.

For the physical check, select a small declared set of real garment pairs. Record a user's decision after the synthetic-model VTO, then their decision after seeing the physical combination. Record disagreement and visible rendering defects, plus any resulting basket change. Report sample size and limitations; do not extrapolate to a return-rate reduction. No photos of real faces are needed.

The English demo should show a requirement, accepted and rejected combinations, a basket change after a rating change, the certificate, and measured rendering savings when available. Unknown prices, timings, effectiveness, or API behaviour remain labelled **UNKNOWN**.

## Three decisions for OK Agency today

1. **Requirement format - proposed:** accept `{id, label, minCount, outfitIds}`. Counts mean distinct outfit pairs; sets may overlap, and all requirements are mandatory. Confirm who assigns outfits to needs such as work or rain; no image-derived physical-property claim is implied.
2. **Demo catalogue and prices - proposed:** start solver tests with clearly synthetic prices, then supply a frozen real catalogue only with source URLs, capture time, currency/minor-unit interpretation, and image-publication rights. The source for the public demo is **UNKNOWN** until the team selects it.
3. **Render error - proposed:** `render_error` requires a reason, contributes no acceptance, stays unresolved, and can be retried. It is distinct from `would_not_wear` and from `unrated`. Confirm the UI reason categories; the core preserves a nonempty reason without imposing an unapproved taxonomy.
