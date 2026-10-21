# YouCam notes

Status labels: CONFIRMED = read from Perfect Corp public pages by the OK Agency side; REPORTED = stated by a consulting assistant, not yet verified in the docs; UNKNOWN = not established.

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
