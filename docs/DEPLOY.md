# Deploy (Cloudflare free tier)

PR3 implements the Worker, YouCam client and SQLite ledger. `web/` is still a placeholder for PR4. This document is an operator handoff; code review/tests do not establish that the new version has been deployed.

## URLs

- Front: https://wearagain.pages.dev
- API: https://wearagain-api.oli-struska.workers.dev (`/health` returns `{ok, version}`)

## Local verification

Use Node 24, then `npm ci --ignore-scripts` and `npm run check`. Tests use synthetic responses and block external requests; they require no secret. The local workerd emulator binds a loopback port. `npx wrangler dev --config worker/wrangler.toml` is for manual local serving, not a deployment. Keep live disabled during fixture work.

## Live configuration

Set these variables on the Worker (or edit the committed non-secret defaults before the team's deploy). A key alone does not enable spending.

| Variable | Committed default | Meaning |
| --- | --- | --- |
| `LIVE_ENABLED` | `true` | Explicit opt-in to the live HTTP routes. |
| `LIVE_TOTAL_UNITS` | `440` | Total lifetime allocation to this ledger, covering spent + all held units. |
| `LIVE_DAILY_UNITS` | `240` | UTC daily spend + every unresolved hold, including older days. |
| `LIVE_SESSION_DAILY_UNITS` | `40` | The same rule per anonymous session token. |
| `ALLOWED_ORIGINS` | `https://wearagain.pages.dev` | Comma-separated exact frontend origins. Add a localhost origin only for local development. |
| `DEMO_ASSET_ORIGIN` | `https://wearagain.pages.dev` | Origin serving approved `/demo/renders/` static files. |
| `YOUCAM_ASSET_HOSTS` | unset | Optional exact comma-separated upload/result hostnames; default is `yce-us.s3-accelerate.amazonaws.com`, as in the provider guide. Verify any additions against a trusted probe. |

The team must allocate the **actual remaining budget**, allowing for probes, saved scenarios, other key use and reserve. The original 1,000 units are not an available-balance assertion. The three configured limits must each allow at least 2 units for live mode. Values are safe, nonnegative integers. Limits can be lowered without erasing existing reservations or spend. Do not reset the DO name or database to reset a budget.

Session tokens last six hours and use a domain-separated server-side HMAC. They are anonymous; a new token can get a new session allowance, but cannot bypass global daily/total caps. The browser receives no YouCam credential. No additional signing secret is required for PR3; rotating the YouCam key also invalidates sessions. AI Stylist quotas are separate future PR4b configuration.

## Deploy commands (OK Agency)

Export `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the shell; never commit them.

```sh
# Pages project (once). `wrangler pages project create` fails on wrangler 4, so use the API:
curl -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"wearagain","production_branch":"main"}' \
  https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects
npx wrangler pages deploy web --project-name wearagain --branch main
npx wrangler deploy --config worker/wrangler.toml
```

## Secrets

`YOUCAM_API_KEY` is already configured by the team. Preserve it. The commands below are for setting/rotating secrets when needed; values are entered interactively or piped on stdin, never committed or printed:

```sh
npx wrangler secret put YOUCAM_API_KEY --config worker/wrangler.toml
npx wrangler secret put ANTHROPIC_API_KEY --config worker/wrangler.toml
```

## Durable Object

`UnitLedger` is the existing SQLite-backed class, with migration `v1` and `new_sqlite_classes`. **Do not edit or replay `v1`.** PR3 preserves that declaration and creates application tables idempotently. A Cloudflare class/storage migration is distinct from an application SQL schema update; this PR adds no class migration and does not replace the namespace. The instance name remains `wearagain-global-v1`.

## Unit ledger reservation semantics

Implemented: atomically reserve **2 units per render**, claim submission once, persist task ID, commit on provider success and release only after confirmed-free create validation or terminal decode error. A download failure cannot refund an already successful task. A timeout remains pending; no automatic POST retry or timeout-based release exists. Known tasks are reconciled by bounded alarms; unknown acceptance without a task ID retains the reservation for operator investigation. Provider retention is 24 hours; reaching that time stops automatic polling without clearing the hold. Full semantics and endpoint payloads are in [API.md](API.md).

The shared rolling gate permits at most 250 requests/300 seconds and 5/second, including signed upload/download requests. Other use of the same key/IP is outside this ledger and can still result in a provider 429. One large upload or download is admitted at a time; `render_busy` returns 429 with `Retry-After: 2` before any reservation.

Do not reconcile an unknown reservation by age or by assuming every HTTP error was free. For a known task, inspect the provider outcome through the team's trusted operator tools and preserve the evidence. For lost task IDs or unprobed charge semantics, the charge remains UNKNOWN and the hold remains. PR3 deliberately exposes no public override/refund endpoint.

## Recorded demo assets

The demo loader is implemented, but `fixtures/youcam/demo-manifest.json` currently has no entries because no generated try-on outputs were supplied. Follow [API.md](API.md#recorded-demo-handoff) to add approved synthetic-avatar recordings and publish them under `web/demo/renders/`. Base avatars and flat-colour test PNGs are not generated outfit previews. Demo calls require no secret and make no provider requests.

## Post-deploy checks owned by the team

1. Check `/health` version, `/do-check`, exact Pages CORS and the demo manifest's actual availability.
2. With a deliberately small allocated budget, run one known-good synthetic avatar/garment through upload, pending, success and image retrieval. Repeating the same request in the same session must not create another task.
3. Compare the provider's balance change with the ledger: 2 units for success. Confirm the asset hostname used by the probe and image retrieval before expanding the allocation.
4. Confirm the closed-browser alarm path and that a missing download does not refund success. Review UNKNOWN holds; do not erase them to unblock a demo.
5. Keep the product's provider-retention notice accurate. The Worker stores no image bytes or signed URLs, but YouCam still retains uploads/results as documented.
