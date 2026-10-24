# Final purchase-focus acceptance — 24 October 2026

The application revision `6d4b35e1de597a327542e603bc9ed18f9088a223` was checked on immutable preview https://ce358e92.wearagain.pages.dev. Its main functional changes were first checked at `fd4243f` / https://f53f8524.wearagain.pages.dev; the later delta adds the explicit mobile-first/desktop label. The submission-text clarification accompanying this report changes no application asset. [PR #29](https://github.com/Powers-P1/WearAgain/pull/29) identifies the complete source history.

## User-visible result

The saved judging replay follows the same genuine Nova single-garment recording through the verdict. The checker derives its initial candidate from its solved basket. Rejecting Nova + Striped tee changes the example basket from Nova at PLN 90 to Aster + Mila at PLN 100 while preserving the manually inspected Nova. The explanation attributes the change to the human rating. Preset and human pair ratings are distinct; Not sure and render error remain unresolved, with a provisional result where appropriate. The separate buy-nothing example returns PLN 0 without borrowing unrelated preview images.

The consumer landing remains visually unchanged. The judges hero states MOBILE-FIRST PWA / FULL DESKTOP WORKSPACE and retains the installation, tutorial and dashboard entries. No account, Worker, secret, route or provider configuration changed.

## Checks

- **348/348 offline tests**, strict types, core build and both frontend builds pass on Linux and Windows: [CI](https://github.com/Powers-P1/WearAgain/actions/runs/40043535970).
- **Chromium browser suite passes**: [visual and interaction CI](https://github.com/Powers-P1/WearAgain/actions/runs/40043536185). The actual rating/identity regression runs at 375, 768, 980, 1100 and 1440 px. It checks the changed, unchanged, provisional and zero-purchase outcomes, control sizes and console health.
- Existing own-data flows, isolated profiles/photos, explicit opt-in, transfer, saved outfits/plans/lists, PWA/offline/update and all nine action-gated walkthrough steps pass. The guide runs at 390 and 1280 px without a paid provider request.
- Primary CUA acceptance in actual Edge covers mobile 390 and desktop, rating→basket, zero outcome, replay identity, installation-dialog dismissal and console/overflow. Approved v7 plays with default English captions. The hosted CI Chromium lacks the H.264 codec, so its explicit decode skip is supplemented by actual Edge playback rather than called a playback pass.
- Read-only public asset checks match the built JS/CSS/PWA/media bytes. The approved MP4 SHA remains `0af4fbaca6bf98cf0463f4fcc68ff861338cbf61e8b1aeb416f074ced2331fe1`; VTT and SRT each contain 12 cues.

Three independent simulated jury/investor conversations, including a separate Astra review, performed actual CUA acceptance and returned GO for the tested demo with no reproduced product P0/P1. They separately accepted the mobile-first label delta. Astra also completed all nine guide steps with a local garment image and live mode disabled. Their opinion is neither an official contest judgement nor customer validation. Full review texts, screenshots and exact production receipts are included in the owner submission kit.

## Boundaries

No new paid provider task was run. The previous one-task production YouCam receipt remains two credits with read-only recovery of the same successful result. Physical phone installation, real camera/store use and personal-body try-on have not been certified. The demo uses synthetic models and separate garments; no fit, merchant stock, checkout or business-outcome claim is added.

The approved film captures the earlier working UI; the current replay makes candidate identity and rating provenance clearer. After the reviews, approved v7 was published on Oliwia's YouTube channel at https://youtube.com/shorts/HLbEffHG95E with prepared English captions. GitHub invitation 339415895 was sent to the exact official email, resolved to YouCamAPI; acceptance/effective access remains pending. The [submission package](../SUBMISSION_PACKAGE.md) records those follow-up actions. The entrant's own eligibility/rights declarations and Devpost submission remain separate. GO for the demo does not itself close formal gates.
