# Avatars: base models and selection

Try-on runs on a synthetic base model, never on a user photo. Index: `fixtures/base_models/avatars.json`.

## Library (in scope for the hackathon)

Ten synthetic adults plus one fallback: two neutral (M/L) and a pilot series of eight size-L silhouettes (4 builds - slim, average, muscular, belly - x 2 sexes, `woman_L_*_01` / `man_L_*_01`). Adults (18+) only; children are intentionally excluded. The wider grid of sex x size (S-3XL) x height x build is planned in `avatars.json`, not yet generated.

**Measurements are nominal.** The L series assumes about 45 years, 175 cm and size L; these are prompt assumptions (`assumptions` field), not measurements, and the height/weight bands are team-chosen selection bands. Belly differences are deliberately subtle. Never present an avatar as a size chart.

## Deterministic nearest-avatar selection

Input: sex, height, weight, age (declared, never inferred), optional girths.

1. Filter by sex and `ageBand: adult`. Selection order: sex, then build, then nearest height/weight bands. Skip entries with `role: fallback` unless nothing else remains.
2. For each remaining avatar, normalise every provided measure against its band: `d = max(0, |x - mid| - halfWidth) / halfWidth`, where `mid` and `halfWidth` come from the band.
3. Distance = sqrt of the weighted sum of squares (height 2, weight 2, girths 1 each). A requested build adds a penalty of 1 on mismatch.
4. Pick the lowest distance; break ties by `id`, so the same input always gives the same avatar.

The result is an approximation. Do not promise a garment size.

## Proposed on-device photo matching (later)

MediaPipe Pose Landmarker runs in the browser and yields shoulder and hip ratios, used as extra features in the same distance function. They are approximations, not measurements. The photo is never uploaded and the working copy is released after analysis; only the avatar render and the garment go to the try-on service.

Proposed UI text (use only after the network traffic has been verified to contain no photo data):

> **Match an avatar from a photo**
> We analyse the photo only on your device to pick a matching avatar. We do not send it to a server or store it on your account. When the analysis ends, we remove the working copy from the app. We keep your avatar settings only if you choose to.
> Take a photo / Choose a photo. Or enter your measurements manually.
> Optional, off by default: Remember my avatar settings.

## Scope

| Now | Later |
|---|---|
| Library of fixed avatars, manual selection by height/weight/build, deterministic nearest match | Photo matching, MakeHuman/MPFB-style parametric body with morph targets, calibrated girths |
