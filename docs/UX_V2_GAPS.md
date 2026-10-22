# WearAgain - UX v2 gaps and honest limitations

English is the UI default locale. Polish ImageGen prompts and boards are layout
and meaning references, not a mandate to display Polish. All user interface
copy (including status names and accessibility labels) belongs in the
`web2/src/i18n.ts` catalogue. Honest captions: **"Demo model"** and
**"Style preview, not size fit"**.

Reference: `docs/mockups/v2/README.md`, UX decisions and prompts v2, boards
01-03 and 05-17. Additional PR-E brief: `WearAgain-brief-hackathon-Fable.txt`
and `WearAgain-prompty-hackathon.txt`.

| Scope | Honest gap | Resolution |
| --- | --- | --- |
| PR-A / mobile web | Browser cannot reproduce native OS status bar and hardware permissions precisely. | Use the responsive 390×844 product layout; leave OS chrome to Capacitor/native. |
| PR-A / board 03 | "My photo" is a private-production option. Public demo cannot promise consent handling, deletion or data isolation it has not implemented. | Disabled in demo, approved model shown. Production flow needs consent, scoped upload, retention and deletion. |
| PR-A / board 05 | Board illustrates "28 pieces", but only eight distinct garments are shown. | Show actual example item count and real user additions, not made-up garments. |
| PR-A / photography | Item images are clean cropped illustrations from board 05, not real customer photographs or provider evidence. | Inset each tile with no neighboring text. Perform screenshot review for 390×844 and desktop. |
| PR-B / boards 01, 07 | The measured YouCam cloth-v4 behavior **replaces** the previous garment; it does not prove layered full-outfit rendering. | Use only actual manifest recordings of matching individual demo tops as hero. Label them **single garment** with live text overlays and list other owned pieces separately. Two exact recorded-example tops are added to the sample wardrobe; no layered composite is claimed. |
| PR-C / boards 02, 08 | Six existing recorded outputs are one garment each; no proof of multi-piece fit, size or stock. No recording exists for the separate zero-purchase fixture's specific garments. | Show real manifest-derived outerwear and top previews side by side (never layered); use existing core solver and full cheaper-basket certificate over replayable fixture ratings. Disable unrated-pair assessment where images are missing; label example pricing and provenance, no guessed retailer details or equivalent-ownership claims. |
| PR-D / board 09 | A closed browser cannot guarantee background generation and notifications; the Worker has no occasion background job. | Implement offline three-look preparation in the open tab only, with live wardrobe readiness validation and explicit wear logging. The intermediary "preparing" stage reflects a local task, never a fake OS notification; native/Worker background execution remains a gap. |
| PR-D / boards 10-11 | A camera file/photo is not automatically a generated YouCam try-on; browser IndexedDB can be denied or evicted and there is no background render queue. | Capture separate device photos immediately to IndexedDB, keep metadata in versioned localStorage, allow successive captures without waiting for an API task; display saved prerecorded demos separately and mark new captures "photo only". No network requests, retry promises, fake previews, maps or invented shop/floor. User can review, skip, shortlist and remove locally. |
| PR-D / boards 06, 12 | Mockup's "28 / 16 / 5", six-month unworn history, two identical blazers and rain-shoe gap are not evidenced by user's demo wardrobe. | Derive item totals and attention from actual stored wardrobe, monthly worn-item count only from explicit wear logs, condition from user-entered availability. Empty history is labelled unknown, categories are only review candidates (not duplicates), gaps are UNKNOWN, and "keep/repair/donate/sell" is an explicit user choice without automatic disposal. |
| PR-E / board 13 | First offline load requires an online precache. Fonts may be unavailable offline. | PWA install shell only, cache approved public demo assets, never live/API/auth/private responses. |
| PR-E / board 14 | Retail pilot conversion, returns and margin are proposed evaluation measures, **not obtained results**. | One-category pilot plan vs control group; no unmeasured improvement claims. |
| PR-E / board 15 | Fictional retailer/product/prices; private wardrobe cannot be exposed to a real merchant by mockup alone. | Explicit fictional store labels, real scoped data boundaries and no personal photos shared with retailer. |
| PR-E / boards 16-17 | Judges need a working integration, 1–3 minute video, code and test instructions. Saved previews are not fresh API calls. | "Judges · Start here ↗" header link, 3-step demo, real input/task/result, separate saved and fresh states; remove design-concept note only after actual wiring. |

Later PR screens are **not implemented by PR-A**. Preserve missing capabilities
as explicit gaps instead of fake buttons or unverified product claims.

## PR-D image and readiness corrections
The v2 stylist now uses three distinct saved YouCam top examples; board 09 morning looks likewise use these existing manifest entries. Full-length model jeans in a single-garment render are **not** the trousers listed in the wardrobe outfit. The hero is intentionally framed on the upper body, with the actual trouser/shoe items listed separately. The mobile Stylist look screen now has a back/occasion/save app bar. No provider compositing is claimed.

## PR-C polish fixed in PR-D
- Mobile purchase verdict comes before candidate scrolling and pair previews, matching the "decision first" board. All three sample candidates are reachable in a compact three-column mobile list and via Previous/Next controls (no hidden third card).
- The zero-purchase fixture has **one compact no-recording explanation**, not two tall fake model photos; disabled "would not wear" never shows as selected. Example fixture ratings remain explicitly separate from visually backed personal ratings.
- In-place UI updates preserve keyboard focus on matching controls and keep the purchase certificate's "Why?" details expanded. The fit note is shown once per pair, not stamped on both images and in the footer.
- "Add photo" and "Paste link" link to the real local gallery capture/link-only forms. They do **not** claim automatic conversion of those entries into Worker/catalogue candidates. Example thumbnails crop edge strips via CSS only; the original saved JPEGs remain unchanged.
- PR-B now has three distinct recorded top hero identities. The full-body model's jeans are **not** an outfit's owned trousers; the stylist image is intentionally framed on the upper body, and the exact listed garment tiles remain separate. A mobile app bar provides back, title and save.

## PR-E implementation notes
Board 13/14 marketing photography comes from the six **recorded, separately rendered upper-body YouCam assets**, labelled accordingly rather than misrepresenting board compositions as real provider output. Board 15 has no matching verified isolated merchant catalogue photograph; it explicitly shows the saved on-model candidate in the fictional shop image area and distinguishes it from a genuine product photo. The original mockup's €320 fictional wool coat is replaced by the real core-fixture candidate's ID, name and synthetic PLN 40 sample price so visual evidence remains consistent. Board 16's 2-minute video is not supplied and private code links require reviewer access; board 17's guided flow leaves the fresh-task state NOT SUBMITTED and reads actual saved manifest and solver/certificate evidence. A browser PWA cannot guarantee background rendering or private-photo sync. Production Pages remains on web/dist; web2/_headers requires Pages hosting before CSP and permissions policies are enforced.
