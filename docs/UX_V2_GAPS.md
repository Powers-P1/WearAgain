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
| PR-C / boards 02, 08 | Six existing recorded outputs are one garment each; no proof of multi-piece fit, size or stock. | Reuse immutable manifest, solver/certificate and independent pair ratings. Label individual evidence and uncertainty. |
| PR-D / board 09 | A closed browser cannot guarantee background generation and notifications. | Resumable Worker job + permission where supported. Capacitor/native for robust background behavior; no fake timers. |
| PR-D / boards 10-11 | Camera, offline photo queue and nonblocking capture require storage, browser permissions, retries and device validation. | Implement real persistence and recovery or explicitly label limitations; native app for robust background capture. |
| PR-D / boards 06, 12 | No recorded wear is not proof of non-use; camera images do not establish item condition. | User-maintained availability and logged outfit history. Recommendations are qualified and disposal is user-controlled. |
| PR-E / board 13 | First offline load requires an online precache. Fonts may be unavailable offline. | PWA install shell only, cache approved public demo assets, never live/API/auth/private responses. |
| PR-E / board 14 | Retail pilot conversion, returns and margin are proposed evaluation measures, **not obtained results**. | One-category pilot plan vs control group; no unmeasured improvement claims. |
| PR-E / board 15 | Fictional retailer/product/prices; private wardrobe cannot be exposed to a real merchant by mockup alone. | Explicit fictional store labels, real scoped data boundaries and no personal photos shared with retailer. |
| PR-E / boards 16-17 | Judges need a working integration, 1–3 minute video, code and test instructions. Saved previews are not fresh API calls. | "Judges · Start here ↗" header link, 3-step demo, real input/task/result, separate saved and fresh states; remove design-concept note only after actual wiring. |

Later PR screens are **not implemented by PR-A**. Preserve missing capabilities
as explicit gaps instead of fake buttons or unverified product claims.
