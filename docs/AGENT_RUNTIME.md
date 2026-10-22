# Personal stylist runtime

The Worker runs `claude-sonnet-5-5` through the Anthropic Messages API. `src/agent/` contains the bounded model → tool → result → verification loop. The v2 app supplies the current profile and complete wardrobe snapshot; there is no global user-memory prompt or synthetic fallback when live fails.

## Tools and procedures

The occasion, purchase, packing and rediscover procedures share tools for the actual profile, all wardrobe items and availability, relevant editable memories, wear history, saved looks and trip events. Clothing inspection supplies the uploaded image to the model. City lookup and dated forecasts use fixed Open-Meteo endpoints. Catalogue lookup reads the user's selected single-shop catalogue. Unknown stock, delivery, fees and forecasts stay `UNKNOWN`.

`plan_render` uses the existing planner. `render_garment` uses the existing UnitLedger and approved synthetic avatar, with explicit photo/render permission; at most four distinct garments/eight units per session. Render state never creates a human pair rating. `solve_basket` runs on the actual declared needs and current human ratings and reports provisional results. Saving outfits, trip plans, shopping lists and explicit preferences produces validated mutations, applied by the app only after a completed answer. Incomplete/error responses do not apply partial writes.

Every proposed outfit must use known, ready garments and include a dress plus shoes, or a top, bottom and shoes. Feedback receives the previous verified answer and a fresh wardrobe snapshot. The agent can recommend buying nothing; it cannot order, book, change a price or overwrite a human rating.

Photo inspections and dated weather lookups retain small provenance records (tool, subject, time, status and safe details). Feedback receives those verified records without resending private image bytes when photo consent is off. Missing current-session photos do not erase a previous inspection. External weather errors carry a sanitized status such as `HTTP_503`; no fallback forecast or raw upstream error text is invented.

## Persistence and API

- `POST /api/session`: existing six-hour anonymous signed capability; no provider key reaches the browser.
- `POST /api/agent/assets`: explicitly approved garment image, SHA-256 identity, JPEG/PNG up to 140 KB after local resizing. Images are isolated by capability, available for six hours and deleted by a durable alarm.
- `POST /api/agent`: bounded snapshot, procedure, message, request ID and optional previous session ID. Durable `(owner, requestId, bodyHash)` idempotency is checked before paid work. Exact retries return the same session; a changed body conflicts.
- `GET /api/agent/:id` and `/events`: owner-scoped result and SSE progress. Disconnecting/reloading resumes this same operation. It never starts another paid model session. Results and render claims expire after 24 hours via durable cleanup.

Caps: 30 sessions per UTC day globally, three per anonymous capability, six model requests, twelve tools, 20,000 output tokens, an observed 120,000-input-token stopping threshold and a 120-second deadline. The input stop is checked between requests, so it is not an exact billing ceiling. Requests are not automatically retried. A Worker restart with an ambiguous model outcome produces an incomplete session rather than rerunning it.

Preferences/history are durable device storage under separate local profile namespaces. Retrieval is bounded lexical selection with IDs/timestamps, appropriate for at most 40 memories; no vector database is needed. Local profiles are not authenticated cloud accounts. Explicit file transfer moves allowlisted wardrobe metadata and clothing photos into a separate profile; credentials and live sessions are excluded.

## Render holds

`GET /api/operator/holds` and `POST /api/operator/releases` require a distinct existing `OPERATOR_TOKEN` (at least 24 characters). They return 503 if it is absent; a normal session never grants operator access. A manual release requires `confirmedNoCharge: true`, the session/render identity, a reason and an evidence reference. Releases have a durable audit and exact replay protection; successful tasks cannot be refunded through this endpoint.

New reservations carry a positive pre-submission marker. Only those still known never to have called createTask can expire after ten minutes. Submission clears the marker before the non-idempotent provider POST. Legacy holds default to marker zero; pending/ambiguous submissions never expire automatically. This migration preserves existing unknown charges.

This implementation does not provision or rotate secrets. No additional live YouCam task is required by its automated tests. Production provider access and usage must be recorded separately from the mocked protocol/workerd tests.
