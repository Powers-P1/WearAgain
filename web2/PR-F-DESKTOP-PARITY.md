# PR-F - desktop board parity and owner-selected v1 landing

Owner direction on 22 October 2026 supersedes the earlier board-13 marketing choice. The approved **live v1 shoppers landing** and its reference file `docs/mockups/landing-v1.png` now define the landing target. Board 13 remains checked into the repo as an **unused concept**. Do not replace the recorded YouCam six-item manifest or alter the Worker.

## Board-by-board desktop audit (1280 px)

| Board | Target / current implementation | Deviation and treatment |
| --- | --- | --- |
| 05, Desktop Wardrobe | Original 208px left navigation, large serif title, search and category tabs, four-column neutral garment product grid | Real demo inventory is **11** pieces rather than board's fictional **28**. Retain real counts. Two extra recorded tops lack a clean product-only photo, so they remain identifiable saved one-garment recordings, not invented catalogue stock. Action shortcuts beyond mockup (Morning / Overview) are kept as small text affordances; no loss of existing features. |
| 06, Desktop Overview | Quiet count strip, attention list, right-side editorial image and morning CTA | Numbers derive from actual inventory, explicit logged wear dates and user-reported condition, **not** the pictured 28/16/5 or a fictitious six-month wear history. The board suggests a specific weather/footwear gap and nearly identical blazers; without evidence these are labelled unknown or category overlaps. Preview is only an upper-body recorded render with a live one-garment label rather than a fictional full outfit. |
| 07, Desktop Stylist | Spacious split form/preview, serif headings, same sidebar and fabric/photo grid | Saved YouCam renders can depict **one upper-body garment only**. Other owned pieces stay as individual thumbnails; no fake layered full-length style photography is manufactured. Availability and verified suggestions remain functional. |
| 08, Desktop Check purchase | **Rebuilt** as left discoveries, central *one* real recorded demo-model image/pager/two rating buttons, right editorial two-line verdict with *two* separate garment-only product cards, core-backed Why? and actions | Product-only candidate catalogue photos are not included in the YouCam manifest. The three demo candidates currently reuse an **illustrative coat-only thumbnail**; it must not be represented as independently verified shop photography. Shop and floor are unknown, so no Mango/floor fiction. The shown model image is one saved YouCam garment, not a multi-garment composite; user ratings still require both relevant individual manifest recordings. The deterministic solver and its complete cheaper-basket certificate remain accessible under Why?, and all fixture controls move to quiet footer details. |
| 09-12, Mobile morning / mall / coffee / overview | Existing mobile layouts and behaviors preserved | No new mobile features or data flows. Responsive CSS targets desktop >=801px for board 08. |
| Old live landing vs board 13 | **V1 live landing** approved; port from existing `web/src/landings.ts` and `web/src/landings.css` | Original composition, copy, illustrative reference art and colours retained, v2 local-font/CSP restrictions respected by converting photograph crop inline styles into static CSS classes. CTA opens `/app/`; secondary Retail and Judges navigation. The historical "guided tour" buttons now route to the implemented jury demo rather than a missing v1 handler. Board 13 is unused. |

## Visual comparison requirements

`.github/workflows/web2-visual.yml` captures the actual built routes at 1280x800 and 390x844 using Chromium, separately captures the **live v1 landing** at the same viewports, copies original board 05-08 images unchanged, and uploads six actual-left/reference-right composites. Review these screenshots before marking PR ready. Screenshots are comparisons, not proof of 1:1 identity: differences described here are intentional and evidence-driven.

## Integrity and deployment boundaries

UI English. No Worker, budgets, API rate limits, PWA scopes or service worker changes. The root `/sw.js` cleanup and local font CSP remain. No production deploy; keep all historical branches.
