# WearAgain product requirements

Status: PR1 foundation, 2026-10-21. This document makes the approved [brief](BRIEF.md) implementable. Product decisions marked **proposed** need the OK Agency team's response; they do not block the pure core implementation.

## Outcome and boundaries

A shopper wants the cheapest additional outerwear purchase that gives her the outfits she has explicitly accepted for her stated needs. The MVP compares three owned tops with three candidate outerwear items on a synthetic model. An owned outerwear item or a top-only outfit can provide an explicit zero-purchase baseline.

Minimum cost refers to the supplied item prices and requirements. It does not establish personal affordability, garment fit, comfort, weather protection, or return rates. A user decides whether she would wear a rendered outfit; product attributes and requirement membership come from declared inputs rather than visual inference. Reduced spending, impulse purchases, or returns remain hypotheses until measured.

The hackathon submission is planned as a team entry represented by Oliwia Karolewska, with Damian on the team and an intended Women in Tech opt-in. Prize eligibility is subject to the organiser's rules and verification, not an application guarantee.

### Included

- Owned tops, owned outerwear, purchase candidates, explicit outfit pairs, count requirements, and user ratings.
- Exact minimum-price basket and an inspectable minimality certificate.
- Decision-relevant rendering, compared with the complete nine-combination baseline in PR2.
- A keyless, labelled demonstration using permitted pre-rendered assets, plus a separately metered live path in later PRs.
- A small physical comparison of real garments against the user's rendered-outfit decisions.

### Outside the MVP

Lower-body changes, personal face photos, accounts, payments, checkout integration, automatic style scoring, LLM calls, medical analysis, and a claim of measured reduction in returns. A synthetic model is a demonstration figure, not a reconstruction of the shopper's body.

## Version 1 domain contract

The canonical TypeScript contract is [src/core/types.ts](../src/core/types.ts); JSON is admitted through `parseScenario(unknown)` rather than a type assertion. PR1 core data contains no API key, image bytes, provider URL, or provider task ID.

| Entity | Contract and meaning |
| --- | --- |
| Scenario | `schemaVersion: 1`, one uppercase three-letter `currency`, and lists of tops, outerwear, outfits, requirements, and ratings. No currency conversion occurs. |
| Owned top | Stable `id` and display `label`; available at no additional purchase cost. |
| Outerwear | `kind: "owned"` is always available without purchase; `kind: "candidate"` has a nonnegative safe-integer `priceMinor`. A free candidate is still a new item. |
| Outfit | Unique `id`, `topId`, and `outerwearId`; `null` explicitly denotes an owned-top-only baseline. Duplicate top/outerwear pairs are invalid. |
| Requirement | `{id, label, minCount, outfitIds}`; `outfitIds` is a set and `minCount` is a nonnegative integer. One accepted outfit may satisfy several requirements. |
| Rating | `would_wear`, `would_not_wear`, `unrated`, or `render_error` with a nonempty `reason`. Missing ratings normalise to `unrated`. |

Inputs must have unique identifiers within their entity lists, valid references, no duplicate requirement members or ratings, and valid status and money values. Summed candidate costs must remain safe integers. The exact solver is bounded to 12 purchase candidates; the demonstration uses three, so there are eight purchase baskets. Limits protect exhaustive enumeration and must not be silently replaced with an approximate result.

Prices represent the supplied catalogue item's price in minor units, not an inferred discount. Shipping and other order-level fees are not modelled in version 1. Catalogue timestamps, source URLs, publication rights, and real-versus-synthetic provenance belong to the catalogue/fixture documentation, not to a guessed price inside the solver.

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
| PR2 | Decide which unresolved combination can still change the selected basket; compare render count and configured unit use with all nine combinations. | Same final decision as exhaustive evidence on fixed scenarios, including tied baskets; no unresolved outfit silently treated as rejected. |
| PR3 | YouCam adapter against synthetic recorded-shape fixtures, Worker, and Durable Object unit ledger. | Contract fixtures from the team's probe; atomic reserve/commit/release and idempotency verified under concurrent requests. |
| PR4 | Pages frontend, rating UI, certificates, explicit prerecorded demo and capped live modes. | Keyless demo makes no provider calls; live costs are reserved before calls; incomplete/error states are usable on desktop and mobile. |
| PR5 | Deployment configuration, release and operator instructions, fixture/provenance checks, smoke-test and submission handoff. | OK Agency deploys and confirms the public URL and judging access; no secrets in commits. |

ChatGPT/Codex supplies code through reviewable PRs. The OK Agency/Fable side owns live probing, recording fixture shapes, secrets, deployment, review, and merges. The developer does not receive the YouCam key. This PR does not perform deployment or use paid API units.

## Integration evidence and budget

[YOUCAM_NOTES.md](YOUCAM_NOTES.md) records conflicting documentation about API versions and retention. The actual endpoint/schema, per-call cost, relevant retention behaviour, error charging, latency, and output-publication permissions are **UNKNOWN for this implementation** until the team's probe and documentation reconciliation establish them. PR1 does not encode a presumed 2-unit price or a retention duration.

The agreed planning allocation remains 1,000 units: 100 integration, 240 tests, 120 saved scenarios, 440 live (360 judging and 80 public), and 100 reserve. This is a budget allocation, not a guarantee of any number of live sessions. A completed live path needs a verified cost schedule, a concurrent-safe ledger, and a policy for uncertain outcomes and retries. No LLM expenditure is planned.

Raw provider recordings stay outside the public repository. Commit only synthetic response shapes with invented identifiers/URLs and assets whose publication rights have been established. Personal garments are photographed alone; generated assets use synthetic figures. Cleanup behaviour must be verified against the provider rather than advertised as zero provider retention.

## Verification and demonstration

### PR1 acceptance

- Fixtures exercise positive count requirements, zero purchase, ownership, overlaps, ties, impossible needs, incomplete evidence, and render errors.
- An independently implemented brute-force test checks optimum selection and the completeness and truth of the failure certificate; it must not reuse the production evaluator as its oracle.
- Tests ensure that optimistic unresolved evidence cannot be presented as a rejection and that equal-price winner stability is separate from minimum-price proof.
- Runtime validation rejects invalid identifiers/references, duplicate pairs or ratings, unsafe prices/counts, and malformed statuses before solving.
- TypeScript builds with strict checking; GitHub Actions runs the same `npm run check` command as local development.

### Later comparison and physical check

For decision-relevant rendering, freeze a complete rating matrix and replay each scenario incrementally. Record final basket, price, certificate status, requested combinations, the nine-combination baseline, and unit totals from the verified cost table. Record base-image preparation separately from outerwear combinations. A performance claim is valid only alongside matching decision outcomes and stated assumptions.

For the physical check, select a small declared set of real garment pairs. Record a user's decision after the synthetic-model VTO, then their decision after seeing the physical combination. Record disagreement and visible rendering defects, plus any resulting basket change. Report sample size and limitations; do not extrapolate to a return-rate reduction. No photos of real faces are needed.

The English demo should show a requirement, accepted and rejected combinations, a basket change after a rating change, the certificate, and measured rendering savings when available. Unknown prices, timings, effectiveness, or API behaviour remain labelled **UNKNOWN**.

## Three decisions for OK Agency today

1. **Requirement format - proposed:** accept `{id, label, minCount, outfitIds}`. Counts mean distinct outfit pairs; sets may overlap, and all requirements are mandatory. Confirm who assigns outfits to needs such as work or rain; no image-derived physical-property claim is implied.
2. **Demo catalogue and prices - proposed:** start solver tests with clearly synthetic prices, then supply a frozen real catalogue only with source URLs, capture time, currency/minor-unit interpretation, and image-publication rights. The source for the public demo is **UNKNOWN** until the team selects it.
3. **Render error - proposed:** `render_error` requires a reason, contributes no acceptance, stays unresolved, and can be retried. It is distinct from `would_not_wear` and from `unrated`. Confirm the UI reason categories; the core preserves a nonempty reason without imposing an unapproved taxonomy.
