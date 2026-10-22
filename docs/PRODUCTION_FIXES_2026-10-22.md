# Production follow-up, 22 October 2026

Prepared from Damian's production issue list. Deployment status and rollback IDs must be reconciled with K19/DEPLOY_2026-10-22.md on DESKTOP before publication. This document is not a deployment receipt.

- Purchase picker, uncertain rating, save-for-later and mobile gallery disclosures have at least 44 px targets.
- Purchase example controls and the example label are visible above the comparison. The buy-nothing case presents the owned example pieces and the zero-price result without pretending missing recordings exist. On mobile the verdict precedes its explanation.
- A production browser probe reached the existing Worker on 2026-10-22 at 19:20 UTC. Session creation returned201 and the ledger returned200; the single render POST returned503 `avatar_image_unavailable` before a reservation or provider task. No successful live image was produced. Cost of this preflight failure: **0 credits**, not a completed paid render.
- Cause: the approved avatar URL used unauthenticated raw GitHub access to this private repository, returning404. The build now copies the approved synthetic adult originals byte for byte to `/demo/avatars/<git-blob-sha>-<file>`. The Worker uses those public paths and still verifies the pinned Git blob hash. Originals are excluded from PWA precaching. Account, routes, secrets, ledger namespace, caps and migrations are unchanged.
- Confirmed avatar preflight errors no longer appear as an uncertain provider submission. Generic503 and lost responses remain unknown and are never retried automatically.

Validation: `npm run check` (311 tests); `tests/browser/web2-production-fixes.mjs` at375/768/980/1100/1440; `tests/browser/web2-states.mjs` (198 states across390/1280/1536). Provider calls are blocked in regression tests. The separate authorised production probe is not part of those tests.

Release order: preview front and hash verification; production front and original hash verification; then the minimal Worker code update using the existing Oliwia account and vault helper. A final browser probe must create **at most one actual YouCam task** across all operators. The earlier preflight failed before task creation, so it did not consume that one-task allowance. Never retry an unknown submission. Record charged units, successful image decoding and the deployed IDs before calling the live check complete.
