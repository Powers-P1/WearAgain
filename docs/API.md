# Render API (PR3)

This is the server boundary for PR4. PR3 implements the client, Worker and ledger; the Pages product UI remains PR4. Tests exercise the full protocol with synthetic fixture responses and deny external network access. They are not a live provider measurement.

## Public routes

| Method and path | Result |
| --- | --- |
| `GET /health` | Version and whether live mode has an explicit configuration. No secrets. |
| `GET /do-check` | SQLite Durable Object health, no reservation or provider call. |
| `GET /api/avatars` | Approved synthetic adult avatar IDs, immutable base revisions and image URLs. Selection remains PR4. |
| `GET /api/demo/renders` | Recorded-demo manifest, `unitsCharged: 0`, and explicit availability. |
| `GET /api/demo/renders/{id}/image` | Redirect to the matching approved static recording; no YouCam call. |
| `POST /api/session` | Anonymous live session token and expiry; body empty or `{}`. Requires enabled live mode and positive configured budgets. |
| `POST /api/renders` | Multipart upload; atomically reserves 2 units and submits at most one provider task for this render in this session. |
| `GET /api/renders/{renderKey}` | Status and budget; reconciles a known task when its next poll is due. |
| `GET /api/renders/{renderKey}/image` | Refreshes the provider result URL and returns image bytes with `Cache-Control: no-store`. |
| `GET /api/ledger` | Total, UTC daily and session daily spent/reserved/remaining units. |

The last four routes require `Authorization: Bearer <sessionToken>`. This is a WearAgain session token, never the YouCam key. Tokens last six hours and are bound to the requesting origin. They are signed using a domain-separated HMAC with the server secret; key rotation invalidates existing tokens. Keep the token in browser memory. Image loading uses authenticated `fetch`, then a temporary blob URL; release that URL when the preview is replaced or the session ends. No token in query strings.

Sessions are anonymous. A session cap applies to a token, not a verified person; issuing another token does not bypass global daily or total limits. The PR4b agent budget needs its own policy. A forged internal session header is discarded at the public Worker. There are no public reserve, settle or refund endpoints.

## Render request

Send `multipart/form-data` with exactly two fields:

```json
{
  "element": { "kind": "top", "id": "owned-top-1" },
  "avatarId": "woman_neutral_01",
  "attempt": 0,
  "garmentContainsNoFace": true
}
```

- `metadata`: the JSON above. `kind` is `top` or `outerwear`; `id` refers to one garment, never a pair.
- `garment`: a JPEG or PNG, less than 10,000,000 bytes, with sides at least 384 and 512 pixels in either orientation and neither side over 4096. The complete multipart body is capped at 10,100,000 bytes. Capture one front-facing garment without a person or face. The declaration and header validation do not perform face detection or prove a valid pose.

The base image is selected only by approved `avatarId`. PR3 accepts no personal model photo, arbitrary input URL, provider file ID, unit price or reservation claim. The Worker fetches the pinned repository avatar and verifies its Git blob hash. A changed or unavailable base fails before any reservation. Personal model photos remain a separately consented PR4b path.

The Worker constructs the core `RenderIdentity`: the uploaded garment's SHA-256, the approved avatar's blob revision, fixed `youcam-cloth-v4-upper-body-v1`, element ID and attempt. The SHA-256 of this canonical identity is `renderKey`. Repeating the same upload and metadata in the same session reuses the original record, including free errors and uncertain submissions. An explicit retry after an error uses a new `attempt`; it is a new possible 2-unit spend. A new image creates a new garment revision and invalidates dependent pair evidence.

## Responses and image readiness

A pending task returns HTTP 202 with `status: "pending"`, `accounting: "reserved"`, `reservedUnits: 2`, an opaque render key, status URL, and budget. The initial POST also returns the canonical `identity`. `requiresReconciliation: true` means automatic completion cannot currently be established, for example an accepted-but-unacknowledged task creation or expired provider retention. Do not resubmit automatically.

Confirmed provider success returns `status: "succeeded"`, `accounting: "charged"`, `chargedUnits: 2`, a stable `assetId` and an authenticated image endpoint. This confirms billing, not a displayed image: `imageRequiresDownload` remains true. Only mark a core `ItemRender` as `ready` after the image request and browser decode succeed. A failed download must not become a dislike or a refund. Pair decisions continue to bind to exact current identities and asset IDs.

Confirmed free failure returns `status: "error"`, `accounting: "released"` and zero held/spent units for that task. PR3's narrow evidence allowlist is create-task HTTP 400 `InvalidParameters`, or a polled terminal `error_decode_image` for the recorded task ID. Other error codes remain UNKNOWN until their charging semantics are confirmed and added with a fixture.

HTTP 429 `limit_exceeded` means the configured total, daily or session daily allowance cannot cover another image; response includes `scope` and `/api/demo/renders` as `demoUrl`. Check the manifest's actual availability before switching. HTTP 429 `render_busy` with `Retry-After: 2` admits no large request and reserves nothing; retry the same request. At most one multipart upload or image download is buffered at a time to stay within Worker memory. Polls and health checks remain available.

## Durable accounting and reconciliation

One SQLite `UnitLedger`, named `wearagain-global-v1`, owns every reservation and provider-request slot. Its existing Cloudflare class migration `v1` is preserved. Application tables are created idempotently inside a synchronous transaction.

The ledger commits a 2-unit reservation before any YouCam file or task call. It persists the submission claim before the non-idempotent task POST. A lost response is not proof of failure, so that POST is never retried under the same render key. Known task IDs are persisted and polled by Durable Object alarms after the browser disconnects or the object restarts. A poll is initially due every 3 seconds; transient failures defer the next attempt for 30 seconds. Each alarm processes at most five due tasks, then schedules the remainder. The HTTP status route can also reconcile a due task.

Success changes reserved units into spent units exactly once, before download. Known free failure releases exactly once. Upload interruption, task timeout, malformed response, generic HTTP error, polling timeout and expired retention retain the hold. Unknown acceptance without a task ID cannot be reconciled automatically. After 24 hours from creation, automatic polling stops and the reservation stays pending for operator reconciliation. There is no automatic expiry-based credit return or user-accessible override.

Daily usage is **units settled successfully today in UTC + all unresolved reservations, including previous days**. Total usage is all successful settlements plus all unresolved reservations. Changing the date, closing the browser or restarting the DO cannot clear a hold. Limits are independent of the provider balance: configure the amount actually allocated to this app after probes, fixtures, external key use and reserve. The original 1,000-unit award is not the live balance.

All provider API calls, signed uploads and result downloads pass through persisted rolling windows of 250 requests/300 seconds and 5 requests/second. Counting signed asset I/O is deliberately conservative. This controls requests made by this Worker; external use of the same key/IP may still cause a provider 429. No provider call is made from demo mode.

The database stores only opaque session/render/task IDs, hashes, statuses, unit counts, reason codes and timestamps. It stores no image bytes, original filenames, presigned URLs or secret. Result URLs are refreshed via task GET because they can expire before the 24-hour result retention. Live responses are not cached. Provider storage of uploaded and generated images remains 24 hours as reported by the team; absence of application storage does not erase provider retention.

## Recorded demo handoff

`fixtures/youcam/demo-manifest.json` is intentionally empty: main supplied approved base inputs but no saved YouCam try-on results. The endpoint currently returns `available: false`, `reason: "recordings_not_supplied"`; it never labels a base avatar or test PNG as a generated outfit.

After recording approved synthetic-avatar results, the team can add entries with this exact shape and copy the image to `web/demo/renders/` for Pages:

```json
{
  "id": "top-1-woman-neutral-v1",
  "element": { "kind": "top", "id": "owned-top-1" },
  "avatarId": "woman_neutral_01",
  "imagePath": "/demo/renders/top-1-woman-neutral-v1.png",
  "recordedAt": "2026-10-21T12:00:00Z",
  "syntheticAvatarOnly": true,
  "api": "cloth-v4"
}
```

This is a schema example, not an existing recording. Use one image per element on the same base for pair comparisons. Preserve source/publication permissions and capture time alongside the team's assets. Publishing rights remain the team's verification task. The loader checks the closed manifest and emits stable `demo:<id>` asset IDs. An unknown ID returns 404. The PR4 frontend must show demo mode explicitly and never call `/api/session` or YouCam while replaying it.

## Offline verification

`npm run check` typechecks the TypeScript core and client, runs fixture replay and actual SQLite tests, and runs the production Worker bundle in local `workerd` via locked Wrangler test dependencies. Runtime tests deny all external requests and verify that denial. A local environment must permit loopback sockets for the emulator. No provider or Cloudflare credentials are needed. A key-backed operational probe is owned by OK Agency after review; latency and actual deployment status remain unmeasured here.
