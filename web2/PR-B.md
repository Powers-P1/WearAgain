# PR-B - Occasion Stylist (English)

Board references: 01 (screen 2 "What's the occasion?", screen 3 completed
look), 07 (desktop three-column stylist). The mockup's Polish is faithfully
translated through `web2/src/i18n.ts` with default locale `en`.

## User flow

In the Wardrobe app choose **Stylist**. Write an occasion or use the
two shortcuts, choose a date and review the existing style profile. **Show my
outfits** proposes at most three outfits from **owned items marked ready**.
The application shows editorial style imagery for the demo, with individual
wardrobe photos showing the exact included garments. The explanation is
sample editorial copy, not a generated reasoning trace.

Arrow controls cycle through proposals. **Save outfit** persists outfit
metadata only in `wearagain:web2:looks:v1`. **Saved outfits** can be opened
from the desktop sidebar or the stylist header. Saving is **not** buying an
item, recording a wear, or adding a shopping candidate. Demo works without
network calls or API keys.

## Integrity and future Worker connection

`web2/src/stylist.ts` exports `WorkerAgentHook` and
`proposeLooks(brief, wardrobe, agentHook?)`.

- Without a hook it returns deterministic `demoLooks()`, no fetch.
- When a Worker agent endpoint is implemented separately, its authenticated,
  metered adapter can be injected as a `WorkerAgentHook` callback.
- Even after an agent responds, `verifyLooks()` rejects unknown IDs,
  duplicate IDs, unavailable garments, incomplete outfits, and duplicate
  suggestion identifiers. User availability cannot be changed by a proposal.
- Agent responses do **not** acquire an ImageGen illustration automatically.
  The current Worker has no `/api/stylist` endpoint, no live agent invocation
  is claimed, and no artificial timer is shown.
- The existing deterministic minimum-basket solver/certificate is **not**
  used here to invent a purchase recommendation. It remains PR-C's authority
  for actual basket decisions.

Existing six YouCam cloth-v4 recordings are separate element previews; there
is no demonstrated layered full-outfit YouCam rendering. Every full-outfit
board image in PR-B is labeled **editorial illustration**, with **Demo model**
and **Style preview, not size fit** disclosures.

## Known deviations and later work

In the mobile brief, the date uses an accessible native HTML date control;
Capacitor/native may provide system date styling later. The full-body
photographs come from approved boards (01, 07, 13), not YouCam API outputs.
A real outfit rendered on a personal model requires separately validated
composition/consent and provider retention. Saved looks are browser-local in
the demo; cross-device syncing requires an authenticated product backend.
