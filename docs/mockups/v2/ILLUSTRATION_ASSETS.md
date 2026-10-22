# Outfit illustration assets

Three selected ImageGen photographs live in `web2/public/illustrations/` and
build to `/assets/illustrations/`. They supplement the accepted boards; no
existing design board was regenerated. Built-in ImageGen was used, one image
per asset, on 22 October 2026. Selected originals were converted to 960 px WebP.

These are **editorial illustrations**, not YouCam recordings, live results,
fit predictions or previews of a personal model. `illustrationFor` binds them
only to exact, unchanged demo garment identities and metadata. Any personal
photo, changed piece, missing identity or different recipe uses the actual
separate wardrobe photographs instead. Visible captions identify illustrations;
the morning selection has one shared visible disclosure. The immutable YouCam
manifest and its six original recordings are unchanged.

| Asset | Demo recipe | Reference inputs |
| --- | --- | --- |
| `classic.webp` | blazer, recorded-work, trousers, loafers | Work-top synthetic model; board-05 blazer, trousers and loafers; board 07 mood. |
| `soft.webp` | recorded-weekend, trousers, loafers | Weekend-top synthetic model; board-05 trousers and loafers; board 07 mood. |
| `relaxed.webp` | recorded-evening, trousers, loafers | Striped-top synthetic model; board-05 trousers and loafers; board 07 mood. |

## Final prompt set

The soft and relaxed prompts used this shared specification, with the exact
top constraint substituted below:

> Use case: identity-preserve / compositing. Asset type: one standalone portrait
> fashion photograph for WearAgain's clearly labelled illustrative demo styling.
> Make ONE image only, no grid or UI. Reference 1 is the synthetic adult model
> and TOP to preserve. References 2 and 3 are the exact beige high-waisted pleated
> wool trousers and brown leather penny loafers. Reference 4 is mood, lighting
> and interior only; no UI or lettering. Preserve face, hair, body proportions
> and the exact top. Replace jeans with reference 2 trousers and shoes with
> reference 3 loafers. Full length, head to heels, feet visible, centered,
> relaxed standing arms. Elegant warm ivory Parisian interior, soft daylight,
> cream wall, pale stone floor. No coat, blazer, belt, handbag, jewellery or
> accessory. No text, label, watermark or border. Illustration of a complete
> look, never a YouCam output. Portrait 2:3.

- Soft: preserve the exact navy crewneck top.
- Relaxed: preserve the ivory tee with the same navy horizontal stripe width,
  spacing, round neck and sleeves.

Classic used:

> Use case: identity-preserve compositing. Create ONE standalone full-length
> portrait editorial fashion photograph for WearAgain clearly labelled
> illustrative demo styling. Reference 1: preserve this synthetic adult model's
> exact face, hair, proportions and cream shirt. References 2, 3, 4: exact dark
> navy single breasted blazer, beige high waist pleated wool trousers and brown
> leather penny loafers to wear together. Reference 5 mood only: warm ivory quiet
> Parisian interior, natural daylight, pale stone floor, no UI or lettering.
> Full body head to heels with shoes fully visible, relaxed standing arms,
> centered, roomy margins. Do not change her identity, garment colours, details
> or cuts. No bag, belt, jewellery or other accessories. Portrait 2:3,
> photographic realism, no text, watermark, labels or grid. This is an
> illustration of a complete look, never a YouCam output.
