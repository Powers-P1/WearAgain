# PR-C - Purchase check (boards 02 / 08)

## Source of truth
`web2/src/purchase.ts` imports the existing `fixtures/core/minimum-basket.json` and `zero-purchase.json`. `parseScenario()` validates inputs, and `solveBasket()` recomputes the minimum basket and a minimality certificate after each independently recorded pair rating. No new solver was written.

The six actual `fixtures/youcam/demo-manifest.json` saved results are reused **by their exact** `{kind,id}` keys: three owned tops, three candidate outerwear. They are separate upper-body renders on the same synthetic model - **not layered outfits**. Missing recordings (especially the zero-purchase fixture) show an explicit empty state and disable visual pair rating.

## UX / interactions
- Select one of the three saved example candidates, then choose which recorded owned top to compare it with; their images are separate and labelled as saved single-garment previews.
- Rate the exact top/outerwear pair `would_wear`, `would_not_wear` or `unrated`. Use **Start without ratings** and **Replay example ratings** to understand why the verdict changes. Preferences in fixtures are disclosed as illustrative, never attributed to the actual user.
- Right column presents the winning **basket**, cost in PLN from the fixtures, price stability, unresolved combinations, and an expandable certificate listing **all strictly cheaper baskets and the requirements each fails**.
- A candidate absent from the cheapest basket is only `not required` in the example. The application does not infer it matches an owned equivalent without recorded evidence. **Keep what I own** and **Save candidate for later** are explicit per-candidate session-only choices, never checkout, inventory or purchase events.
- Keyboard-accessible `button` controls, descriptive captions, dynamic `aria-live` verdict, no credentials or network operations in demo mode.

## Deviations from boards 02 and 08
- The mockups show a realistic *layered* candidate-plus-wardrobe outfit and direct visual equivalence to a personal blazer. There is no provider proof of either; **we instead show separate real saved renders** and only state conclusions justified by core evidence.
- The labels "Mango", "COS", floors and stock in board 08 have no supporting merchant data and are omitted, not faked. All prices are labelled **Example price** and come from the synthetic fixture. A standalone photo/link import or actual store checkout would need separately scoped work.
- The second demo scenario proves "buy nothing" from its synthetic ratings, but lacks matching saved YouCam assets; image blocks say **No matching recording**. The UI is fully rendered and interactive without falsely manufacturing those photos.
- Main product / wardrobe is unchanged by any comparison; individual saved decisions live **only in tab memory**. Persistent shopping gallery and mobile capture are PR-D.
- All interface copy is English through `web2/src/i18n.ts` although the ImageGen boards are Polish. The underlying `web/`, Worker, unit ledger and core stay untouched.

## Verification
`npm run check` adds CPU tests in `tests/web2-purchase.test.mjs`: manifest key/path matching; exact optimum and certificate; pair selection/rerating; incomplete unrated decisions; buy-nothing; no invented equivalence; no mutation of the existing wardrobe. Existing suites must stay green on Ubuntu and Windows.
