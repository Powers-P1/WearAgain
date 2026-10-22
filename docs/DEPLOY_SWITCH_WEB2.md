# Prepared web/ -> web2/ Pages switch (NOT DEPLOYED)

Status: proposal prepared in PR-E only. Production still builds from \`web/dist\`. The Worker, Durable Object ledger, unit limits and deployed Pages project remain unchanged.

## Exact build output now available

Run \`npm ci --ignore-scripts && npm run check\`. The same script builds the old public app in \`web/dist/\` and the new static frontend in \`web2/dist/\`.

The new \`web2/dist/\` layout is ready to be used as a Cloudflare Pages output directory **after an explicit approval**:
- \`/\`: marketing landing, board 13.
- \`/app/\`: consumer wardrobe/stylist/Check/morning/mall/overview, old v2 hash routing preserved.
- \`/retail/\`, \`/retail/demo/\`: fictional retailer and its sample product/wardrobe panel.
- \`/judges/\`, \`/judges/demo/\`: jury evidence index and guided saved-recording / core-verdict replay.
- \`/_headers\`: self-only CSP, same-origin fonts/assets and Worker disabled in this frontend, \`img-src blob:\` for device-only photos, \`microphone=(self)\` for opted-in browser dictation and \`camera=(self)\`.
- \`/_redirects\`: canonical directory-style Pages URLs.
- \`/manifest.webmanifest\`, \`/app/sw.js\`, public icons, fonts and approved recordings: add-on PWA under **scope /app/** only.

## Manual production change after PR review (do not execute in PR-E)

1. Review 390 × 844 and 1280 × 800 screenshot artifacts from the PR-E **Web2 visual review** GitHub Actions workflow. Test keyboard navigation, mobile judges header, saved-vs-fresh labels, camera permissions and CSP *on an actual Pages preview*.
2. Run \`npm run check\` and inspect the exact generated \`web2/dist/_headers\`, \`web2/dist/_redirects\` and \`web2/dist/app/sw.js\`.
3. Once the separate business approval to switch is given, change **only the Pages production build output directory** from \`web/dist\` to \`web2/dist\`, keeping the install build command equivalent to \`npm ci --ignore-scripts && npm run check\`. Verify that Pages uses the new generated \`_headers\`. **Do not touch Worker secrets or budgets.**
4. Deploy production only as a new, separate authorized action. Verify all five public URLs and /app/ through HTTPS, and all route fallbacks, fonts, PWA scope and CSP. Test real phone capture at the chosen production origin.
5. Rollback, if required: revert only the Pages build output directory to \`web/dist\` and redeploy the previous known-good release. The existing PWA web service worker may remain in existing clients until its normal lifecycle; document upgrade behaviour. Do not clear other-origin browser local data.

## Security / integrity

- Self-host DM Sans and Cormorant Garamond WOFF2 fonts from \`web2/public/fonts\`; upstream open font licenses are preserved as text. The old Google Fonts CSS import is removed only in the v2 path.
- No iframe retailer integration, consented external personal-wardrobe sync, size fitting or merchant checkout is implemented. Retailer examples are local and fictional.
- \`/judges/demo/\` uses the real six \`fixtures/youcam/demo-manifest.json\` recordings, explicitly **single-garment**. New task status is always \`not submitted\` in the guided replay; fresh generating is a separate link to the existing live-capable client and may require configured limits.
- The code and setup links point to this **private GitHub repository**. They require authorized reviewer access. No public source availability is claimed.
- A 1–3 minute submission video has **not** been supplied in this repository. The judge page explicitly shows this as missing, not a completed submission requirement.
- Web2 PWA install is an add-on under /app/; its cache allowlist rejects API/live/auth/range/private uploads and never caches runtime local photos, shopper metadata or retailer routes.
- \`_headers\` are enforced by Cloudflare Pages and not by an ordinary local \`python -m http.server\`. Validate headers independently on the staging Pages deployment **before** production switching.

No production release or Cloudflare deployment command is included in the PR. No Pages project settings are changed by this repository commit.
