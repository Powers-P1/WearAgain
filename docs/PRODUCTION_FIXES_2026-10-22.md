# Production follow-up, 22 October 2026

Completed from Damian's production issue list and K19/DEPLOY_2026-10-22.md on DESKTOP. Production rollback point before these fixes: `8620fffb-c81b-4c80-bc69-dbd2e615e95d`; older v1 fallback: `cf70b46c-62aa-4f88-8ef3-feb60127c5a0`.

- Purchase picker, uncertain rating, save-for-later and mobile gallery disclosures have at least 44 px targets.
- Purchase example controls and the example label are visible above the comparison. The buy-nothing case presents the owned example pieces and the zero-price result without pretending missing recordings exist. On mobile the verdict precedes its explanation.
- The desktop paste-link target is also 44 px. Starter trip occasions have an explicit sample note; the file chooser follows the app styling. The walkthrough uses its actual video frame instead of an editorial illustration poster. Unknown paths receive a real 404 page and both legacy `/retailers` URLs redirect 301 to `/retail/`. The owner-preserved v1 consumer landing is unchanged.
- A production browser probe reached the existing Worker on 2026-10-22 at 19:20 UTC. Session creation returned201 and the ledger returned200; the single render POST returned503 `avatar_image_unavailable` before a reservation or provider task. No successful live image was produced. Cost of this preflight failure: **0 credits**, not a completed paid render.
- Cause: the approved avatar URL used unauthenticated raw GitHub access to this private repository, returning404. The build now copies the approved synthetic adult originals byte for byte to `/demo/avatars/<git-blob-sha>-<file>`. The Worker uses those public paths and still verifies the pinned Git blob hash. Originals are excluded from PWA precaching. Account, routes, secrets, ledger namespace, caps and migrations are unchanged.
- Confirmed avatar preflight errors no longer appear as an uncertain provider submission. Generic503 and lost responses remain unknown and are never retried automatically.

Validation: `npm run check` (311 tests); `tests/browser/web2-production-fixes.mjs` at375/768/980/1100/1440; `tests/browser/web2-states.mjs` (198 states across390/1280/1536). Provider calls are blocked in regression tests. The separate authorised production probe is not part of those tests.

Release completed in order: preview front and hash verification; production front and original hash verification; then the minimal Worker code update using the existing Oliwia account and vault helper. Account, Worker address/routes, secrets, ledger binding and limits were preserved. The repository's existing preview CORS origin is now applied.

Deployment receipt:

- Tested source: `18f52e7dc3b3f1c140280d715bf232a6e4780c51`.
- Preview: `https://1cf89038.wearagain.pages.dev`, alias `https://v2-preview.wearagain.pages.dev`.
- Production: `3ed2e330-2eea-41b5-ae96-541c5c89a5c2`, `https://wearagain.pages.dev`.
- Worker version: `69a3d986-989b-4825-913e-898484110ab4`; previous version for rollback: `afaeaebe-a370-41c0-b209-97efb9db4a25`.
- Targeted browser checks passed against both hosted environments at all five widths. Hosted verification covered all 82 public files across both projects: application code and binary assets match the tested builds byte for byte; Tour Rescue's font licence differs only by Windows line endings.

Live receipt: **one actual YouCam task; 2 credits charged; no remaining reservation for this session**. The production UI created the session, submitted the garment and polled the real Worker to `succeeded`. The approved input's pinned Git blob hash matched before submission. The Worker subsequently returned the real JPEG, 276,145 bytes, decoded at 1024 × 1536 and displayed in the production gallery. Image SHA-256: `f7489afb73a068fd0aebacebc71d006e14f209dd8b289380a1b5b79d41316d2b`.

Evidence limitation: the test listener terminated on a browser protocol error while reading an image-endpoint response body after the task succeeded. That listener also incorrectly included CORS preflight responses. A read-only query verified that exact completed task; its original session was restored only in the recovery harness. The same image was downloaded and displayed without any additional render POST or provider task. This proves submission, charge, download and display, but is not an uninterrupted single-browser recording. Existing unrelated holds of 4 units were left intact. See `docs/validation/production-live-2026-10-22.json` for the credential-free receipt.
