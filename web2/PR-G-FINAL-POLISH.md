# PR-G - final v2 presentation and navigation polish

Scope: v2 frontend and tests only. No Worker, Durable Object ledger, budgets, rate limits, Cloudflare production deployment, local-font replacement, CSP rewrite or service-worker change.

- The v1-ported consumer landing links **Review the evidence** to `/judges/` rather than falsely advertising public GitHub access. The source repo remains private.
- **Explore the buy-nothing example** links to `/app/?scenario=zero#check`. At first page load, Check selects the **existing** `zero-purchase` core scenario by allowlisted query value, returning a real zero-cost/no-candidate basket. Fixture toggling afterward still works. Unknown query values fall back to the standard minimum-basket example.
- Board-08 desktop secondary text (model and product captions, shop provenance, disclosures and footer) is at least **12px**, while maintaining desktop vertical rhythm and the separately approved mobile purchase flow.
- The recommended-candidate (including Nova jacket) explanation is one shorter, core-grounded sentence. Desktop CSS balances its line wrapping without making fit, stock or duplication claims.
- Board-06 month selection now uses a labelled `select` with explicit **English** month/year strings (`Intl.DateTimeFormat('en-US')`) rather than native `input type="month"`, whose visible labels vary with browser language. Options include the previous 24 calendar months plus all months with recorded outfit wears, preserving the original deterministic monthly count and explicitly leaving unlogged use unknown.
- Corrected the misleading historical PR #18 description (where feasible): synthetic coat candidates use their own exact single-garment saved recordings; they never share an illustrative generic coat image.

The screenshot workflow also captures the zero-purchase deep link on mobile and desktop for reviewer verification. Tests cover URL allowlisting, actual zero-purchase solve result, private-code label, English month options and secondary caption scales.

All presentation text remains English. PR is review-only. No production deploy.
