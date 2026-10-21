# YouCam notes

Status labels: CONFIRMED = read from Perfect Corp public pages by the OK Agency side; REPORTED = stated by a consulting assistant, not yet verified in the docs; UNKNOWN = not established.

## Current implementation contract (PR3, 2026-10-21)

This section and the team's live-probe section below supersede the older reported assumptions. PR3 performs no new key-backed probe.

- Authentication: `Authorization: Bearer <API key>` on the fixed API origin `https://yce-api-01.makeupar.com`. Presigned upload/download requests receive no Bearer key. The [official Clothes overview](https://docs.perfectcorp.com/reference/ai_clothes/section/overview) confirms the host and shows `yce-us.s3-accelerate.amazonaws.com` as the signed asset host; other hosts require explicit trusted configuration.
- Implemented sequence: POST `/s2s/v2.0/file/cloth` for each image, PUT its bytes to the signed URL, POST `/s2s/v2.0/task/cloth-v4` with `src_file_id`, `ref_file_id`, `garment_category: upper_body`, then GET `/s2s/v2.0/task/cloth-v4/{task_id}` and download `data.results.url`.
- The original synthetic fixture records a V2 `/task/cloth` example. Its observed response shape is retained unchanged and replayed against the team's separately confirmed V4 path. The public guide's generic `/file` example does not override the successful `/file/cloth` probe.
- Cost: 2 units per successful output. The implementation automatically releases only for the evidenced create HTTP 400 `InvalidParameters` and matching terminal `error_decode_image`. Other terminal error codes have no charging fixture yet and remain UNKNOWN; an HTTP error during polling does not prove the original task was free.
- Timeout, lost task response, incomplete polling and expired retention retain the 2-unit reservation. Known task IDs are automatically reconciled. Result download failure after success remains charged.
- Rate gate: 250/300 seconds and 5/second, shared across the app's provider traffic, conservatively including signed asset I/O. External calls using the same key/IP are not visible to this ledger.
- Retention: uploads 24 hours, results 24 hours after completion; download links can expire sooner (about 2 hours reported by the team). The Worker stores no image bytes or signed URLs and refreshes a result URL through task GET. This is not a zero-provider-retention claim.
- Layering is confirmed unsupported by the team's follow-up probe: a second garment replaces the first. Three tops and three outerwear items produce six independent previews, costing 12 units for successful outputs, reused in nine pair cards.
- The current repo supplies synthetic adult base images, but no saved generated try-on outputs. `demo-manifest.json` therefore reports unavailable recordings until the team supplies approved images. Flat-colour PNGs in offline tests are transport fixtures, not demo assets.

Implementation/API/accounting details: [API.md](API.md). Remaining UNKNOWN: output-publication rights, DPA/region and backup deletion, unprobed error charging, exact available balance, provider concurrency guarantees, new live latency measurements, and any newly observed response or signed-host variants.

## Historical notes (superseded where marked above)

## Confirmed (public pages, read 2026-10-15)
- One API key covers the Beauty, Fashion & Retail, and Creators groups; MCP servers and Agent Skills exist (yce.perfectcorp.com/ai-api/agent/mcp-skill).
- Flow pattern: upload via File API, create a task, poll for the result (documented for Skin Analysis).
- Skin Analysis HD input: long side <= 4096 px, short side >= 1080 px (Skin Analysis only, not cloth try-on).
- Hackathon rules: 1 000 API units per registrant, non-transferable, valid 90 days from redemption.

## Reported, to verify in docs before relying on it
- Endpoints: POST /s2s/v2.0/file (then upload to the returned URL); POST /s2s/v2.0/task/cloth-v4; GET /s2s/v2.0/task/cloth-v4/{task_id}.
- Cloth try-on v4 cost: 2 units per image. Layering outerwear on a prepared base needs a further call, so a full session is (3 base + 9 outer) x 2 = 24 units; 18 if the three bases are pre-rendered.
- Retention: "All uploaded and generated images and videos are automatically removed after 30 days." (to verify). Deleting completed tasks with their assets is reported as documented (to verify).
- Cloth try-on needs a visible model face; standalone garment photos have limits for lower-body items. Scope is therefore tops and outerwear.

## UNKNOWN
- Exact request/response schema and parameters of cloth-v4; error codes; rate limits and concurrency.
- Image size and format constraints for cloth try-on.
- Whether a failed or uncollected task still costs units.
- Typical latency (a median <= 20 s is a goal, not a measurement).
- Whether publishing raw API output or fixtures is allowed by the terms.
- DPA, processing region, backup deletion.
- Handling of personal garment photos without a face.

## Docs check 2026-10-21 (no live probe yet; API key not available)
- CONFIRMED (docs): V2 cloth task path /s2s/v2.0/task/cloth, templates /s2s/v2.0/task/template/cloth; separate "AI Cloth V3" exists; parameters garment_category (auto) and change_shoes. Source: https://yce.perfectcorp.com/document/index.html
- CONFIRMED (docs): uploaded files stored 24 hours, results 24 hours after completion. This supersedes the REPORTED "30 days". The path "cloth-v4" was NOT found in the read portion: treat as UNKNOWN.
- UNKNOWN: units per image, response schema, image constraints, charge for failed cloth task (Skin Analysis docs say no charge), latency, output-usage terms.

## Live probe 2026-10-21 (real API key, 4 units spent, own CC0 inputs)
- CONFIRMED: V2 auth is `Authorization: Bearer <API key>`; no separate auth call or id_token needed. Balance: GET /s2s/v1.0/client/credit (free).
- CONFIRMED: feature-cost lists AI Clothes V2, V3 and V4, each 2 units per result_image. The path /s2s/v2.0/task/cloth-v4 (and its status GET) works, so the earlier "cloth-v4" note is now CONFIRMED. The earlier "2 units" is CONFIRMED.
- CONFIRMED flow: POST /s2s/v2.0/file/cloth -> PUT to pre-signed URL -> POST /s2s/v2.0/task/cloth (or cloth-v4) with src_file_id, ref_file_id, garment_category -> poll GET /s2s/v2.0/task/<cloth|cloth-v4>/<task_id> until task_status is success or error -> download data.results.url. Shapes: fixtures/youcam/cloth_tryon_task.synthetic.json.
- CONFIRMED latency (one run each): V2 about 8 s, V4 about 11 s from task creation to success (polled every 2.7 s); uploads about 1 s each.
- CONFIRMED: result image has the same size as the person image; jacket product photo on a hanger worked as ref with garment_category upper_body.
- CONFIRMED: missing parameters or bad ids return HTTP 400 (error_code InvalidParameters), 0 units. An accepted task with an undecodable image ends as task_status error (error_decode_image), 0 units charged.
- CONFIRMED (docs): person image must show a visible face, upper body, facing forward, one person, 512x384 min, 4096 max side, <10 MB, jpg/png. So a face-free mannequin is not a valid input. Product ref: single front-facing garment.
- CONFIRMED (docs): uploads kept 24 h, results 24 h after completion, download link may expire after about 2 h. Rate limit 250 requests / 300 s and 5 QPS per IP and per key (429).
- UNKNOWN: terms on use of generated outputs (docs point to Perfect Corp Terms of Service, not read here), DPA and processing region, behaviour of a failed task when polling times out (docs: units still consumed if not polled), concurrency limits, layering a second garment on a prior result.
