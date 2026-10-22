# Prepared web/ to web2/ Pages switch (NOT DEPLOYED)

**Status (22 Oct 2026):** code and release artifacts only. **Codex must not publish preview or production.** The team deploys using vault credentials on **Oliwia's Cloudflare account**. Damian's local Wrangler login is a different account; do not reauthenticate it or copy a token into the repository. Worker accounting, Durable Object identity/migrations, limits and secrets are unchanged; the config adds only the exact preview origin to the allowlist.

## Preview handoff to the authorized team

Build with `npm ci --ignore-scripts` and `npm run check`. The target artifact is
`web2/dist`, preview branch `v2-preview`, project `wearagain`. It includes the
previous consumer landing, redesigned app, retailer/jury routes and captioned
walkthrough. The team uses its existing vault-backed deployment process.

Gallery live requests additionally need the prepared `ALLOWED_ORIGINS` value
from `worker/wrangler.toml` applied to the existing Oliwia Worker. Keep the
ledger binding, migration history, secrets and unit limits intact. No backend
deployment was run by Codex. Until the team applies that config, the current
Worker may reject preview-origin requests. API origin is public build-time
configuration, not a credential.

After publishing, verify actual CSP, Permissions-Policy, video/captions, exact
preview CORS and one authorized synthetic-garment live task. Local tests use
mocked provider responses and do not spend YouCam units.

## Real Pages project configuration

The Cloudflare Pages project **wearagain** is **direct upload**. It has no Git-connected build, no Pages build command and **no build output directory setting to change**. Merging this PR does not deploy it. Locally, `npm run check` builds both `web/dist/` (previous site) and `web2/dist/` (the proposed release).

`web2/dist/` must contain `/`, `/app/`, `/retail/`, `/retail/demo/`, `/judges/`, `/judges/demo/`, `/_headers`, `/_redirects`, `/manifest.webmanifest`, the approved static images and local fonts, and two different service-worker scripts:

- **`/sw.js`** - root-scope *legacy v1 cleanup* (JavaScript, no caching and no fetch handler);
- **`/app/sw.js`** - optional v2 static-install PWA, restricted to scope `/app/`.

## Future manual production deployment - only with separate authorization

Review the 390x844 and 1280x800 real-browser artifacts, audit the static output and validate the preview with actual Cloudflare Pages security headers. The authorized operator may then run:

```sh
npm ci --ignore-scripts
npm run check
# Inspect web2/dist/_headers, web2/dist/_redirects, web2/dist/sw.js,
# web2/dist/app/sw.js, the local font files and the saved render manifest.
wrangler pages deploy web2/dist --project-name wearagain --branch main
```

**This is a manual direct upload, not a settings update. Do not execute this command in PR-E or CI.** After future authorization, verify all public routes, actual CSP/Permissions-Policy, local fonts, microphone opt-in, photo capture, a previously installed v1 PWA, and that the Worker budgets are unchanged.

## Why the root legacy worker must be retired

The existing deployed `/sw.js` registers at scope `/` and uses cache-first responses for `/`, `/app/` and `/retailers/`, stored in `wearagain-demo-*` caches. Omitting the old script path from a web2 deployment can cause Cloudflare Pages to return its HTML SPA fallback at `/sw.js`, making browser updates fail JavaScript MIME verification. Returning clients could keep the old cached UI.

PR-E includes `web2/public/sw.js`, copied to **`web2/dist/sw.js`**. The `/_headers` rule sets `Cache-Control: no-cache, no-store, must-revalidate` for `/sw.js`, ensuring a real JavaScript update. The script uses `skipWaiting()` on install. On activate it deletes **only** `wearagain-demo-*` caches, unregisters its own root-scope registration, then best-effort navigates connected same-origin tabs so their next load uses the network. It does not register again and has **no fetch handler**.

The new `/app/sw.js` continues independently and keeps its own `wearagain-web2-public-*` caches. This cleanup does **not** delete user wardrobe state, local photos, browser storage or other-origin caches. It only takes effect when a previous client comes online and the browser performs a service-worker update check: permanently offline devices cannot be migrated immediately.

## Rollback - separate future action

Use Cloudflare Pages **rollback to the previous known-good production deployment**, or after an authorized check and with a verified previous build output run:

```sh
wrangler pages deploy web/dist --project-name wearagain --branch main
```

Do not attempt to 'revert the Pages build output directory': none exists. Evaluate `/sw.js` behavior again during rollback to avoid reintroducing stale PWA clients.

## Evidence, privacy and constraints

- The v2 frontend self-hosts licensed DM Sans and Cormorant Garamond WOFF2 fonts. Static CSP uses `img-src blob:` for local photo thumbnails and `microphone=(self)` for explicit browser dictation.
- The hosted `/judges/demo/` replays six genuine immutable *single-garment* YouCam recordings. **It does not submit fresh API tasks.** The separate Worker API contract is documented in `docs/API.md`; the guided UI does not point to a hardcoded old production live-client URL.
- Real size fitting, multi-garment layering, personal photo sync, retailer checkout and measured pilot impact remain unimplemented. A real captioned 93-second walkthrough is shipped in `/video/` and linked from the jury hero.
- Repository links point to the **private** source repository and require reviewer access. No code is presented as publicly accessible.
- `_headers` is enforced by Cloudflare Pages, not ordinary local file servers. Validate CSP and Permissions-Policy on HTTPS Pages preview before any authorized production switch.
