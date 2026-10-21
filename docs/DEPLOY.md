# Deploy (Cloudflare free tier)

Skeleton only: `web/` is a placeholder page and `worker/` serves `/health` and `/do-check`. No product claims are made by the deployed pages.

## URLs

- Front: https://wearagain.pages.dev
- API: https://wearagain-api.oli-struska.workers.dev (`/health` returns `{ok, version}`)

## Commands

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

Set by name, value piped on stdin (never on the command line):

```sh
npx wrangler secret put YOUCAM_API_KEY --config worker/wrangler.toml
npx wrangler secret put ANTHROPIC_API_KEY --config worker/wrangler.toml
```

## Durable Object

`UnitLedger` is a SQLite-backed class (migration `v1`, `new_sqlite_classes`), the only backend available on the free plan. Do not edit or replay `v1`; later schema changes need a new migration tag.

## Unit ledger reservation semantics

Placeholder. To be defined: reserve one unit before a provider call, commit on success, release or keep on failure, all in one transaction inside the DO.
