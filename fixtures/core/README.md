# Solver fixtures

All scenarios in this directory are hand-authored, synthetic test data. Prices,
item names, requirements, and ratings are invented; they are not catalogue
offers, user research, YouCam responses, or evidence of physical fit. No images
or personal data are included.

Each JSON file wraps a versioned `scenario` with an explicit `expected` result.
These fixtures exercise the decision model rather than the image-generation
pipeline. API-shaped fixtures belong in `fixtures/youcam/` in a later PR.

The tests additionally enumerate small rating spaces with an independent
brute-force oracle. The oracle never calls the production basket evaluator or
certificate generator; it checks the chosen basket and every cheaper-basket
certificate witness against the original scenario.

Unrated outfits and render errors cannot satisfy a requirement. They remain
unresolved evidence, not a shopper's rejection, and can prevent an unconditional
minimality claim.
