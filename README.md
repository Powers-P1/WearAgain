# WearAgain

WearAgain helps a shopper find the cheapest additional outerwear purchase that meets her declared outfit needs using tops she already owns. She judges rendered combinations; a deterministic solver chooses the basket and explains why every cheaper basket fails. The answer may be to buy nothing.

Built for the YouCam API Skin AI & eCommerce VTO Hackathon. The planned experience uses synthetic models, photographs of garments alone, and no LLM calls.

## Current scope

PR1 provides the TypeScript domain model, runtime input validation, exhaustive minimum-basket solver, minimality certificate, synthetic test fixtures, and CI. A frontend, YouCam client, live Worker, and deployment are planned follow-up PRs; this foundation does not call YouCam or require an API key.

## Run locally

Use Node.js 24 and npm. TypeScript is pinned in the lockfile.

```sh
npm ci
npm run check
npm run build
```

`check` runs strict type checking, builds the core, and runs the Node.js test suite. Build output is written to `dist/core/` and is not committed. Tests include synthetic fixtures and an independent brute-force oracle for the solver and certificate.

## Core contract

The public entry point is [src/core/index.ts](src/core/index.ts):

- `parseScenario(unknown)` validates version 1 JSON and normalises omitted ratings to `unrated`.
- `evaluateBaskets(scenario)` enumerates all purchase subsets and their current and optimistic requirement coverage.
- `solveBasket(scenario)` returns `solved`, `incomplete`, or `infeasible`.
- `ScenarioValidationError` reports invalid input.

All prices use safe-integer minor units in one scenario currency. Owned items cost zero; a top-only outfit is an explicit `outerwearId: null` baseline. A requirement counts distinct available outfits rated `would_wear`. Ties use lowest cost, fewest newly acquired items, then stable candidate IDs.

**A render error is not a dislike.** `render_error` and `unrated` count as zero current acceptances but remain unresolved. Certificates identify every cheaper basket and distinguish a proven minimum price from a provisional result. Equal-price winner stability is reported separately. The proof concerns the supplied catalogue and ratings, not physical fit or image accuracy.

## Project map

| Path | Purpose |
| --- | --- |
| [src/core](src/core/) | Pure domain, parser, solver, and certificate implementation. |
| [fixtures/core](fixtures/core/) | Synthetic wardrobe and requirement scenarios; prices are test data. |
| [tests](tests/) | Regression checks and an independent exhaustive oracle. |
| [src/youcam](src/youcam/) | Reserved for the later provider adapter. |
| [docs/PRD.md](docs/PRD.md) | Domain semantics, acceptance criteria, five-PR plan, and pending team decisions. |
| [docs/BRIEF.md](docs/BRIEF.md) | Original approved product brief. |
| [docs/YOUCAM_NOTES.md](docs/YOUCAM_NOTES.md) | Provider evidence and unresolved integration questions. |

## Integration and publication boundaries

The OK Agency team owns live YouCam probes, secrets, deployment, review, and merging. API version, cost, retention, and output-publication permissions remain **UNKNOWN for this implementation** pending the team's probe and documentation reconciliation. Public fixtures use synthetic data; raw provider responses, keys, and photographs of real people do not belong in the repository. See [fixtures/README.md](fixtures/README.md).

The future Pages demo and live mode must be labelled distinctly. A Durable Object ledger will reserve units before live work and enforce the agreed cap under concurrent requests. Neither API latency nor reduced spending/returns is a measured result of PR1.

## License

[MIT](LICENSE).

