# Technical Summary

> One-page brief for hiring managers. Read this first.

## The Architecture

```
GA360 / GA4 export
        │
        ▼
   BigQuery (sql/01_lead_scoring.sql)
   - Funnel-weighted scoring
   - Capped feature contributions
   - Min-max normalized 0-100 score
   - Decile rank → activation tier
        │
        ▼
   TypeScript pipeline (scripts/)
   - Tier filter (Tier 1 only by default)
   - Transform to OCI CSV shape
   - Retry-aware uploader
        │
        ▼
   Google Ads Offline Conversion Import
        │
        ▼
   Smart Bidding receives a DENSER signal
```

## What This Does

The repository builds a behavioral propensity score on top of the
public GA Merchandise Store dataset and feeds the resulting Tier 1
audience back into Google Ads as offline conversions. The point is
not to "predict purchases" - that is a side effect. The point is to
give Smart Bidding a richer training signal than the raw conversion
event alone.

In retail SEM, conversion data is sparse. A typical e-commerce
account sees a fraction of a percent of clicks convert in-session.
Smart Bidding's auction-time models suffer when their target signal
is rare; their lookback windows lengthen, their per-keyword bids
become noisy, and the optimizer overfits to a tiny set of converters.

By scoring every visitor on a 0-100 propensity scale and uploading
the top decile as offline conversions, we densify the signal by an
order of magnitude. The bidder now has thousands of "soft conversions"
per week instead of dozens of hard ones, which is enough to optimize
mid-funnel keywords that previously sat below the noise floor.

## Methodology in Plain Language

Every visitor accumulates points for product detail views, add-to-
cart events, checkout starts, product breadth, session count, and
time on site. Each contribution is capped (`LEAST(...)`) so a power
user cannot dominate. The aggregate is min-max normalized to a
0-100 scale, ranked into deciles, and bucketed into four activation
tiers. Already-converted users are excluded - we are predicting
*future* purchase intent, not labeling completed ones.

The validation script holds out the final ten days of the scoring
window and measures whether higher-decile users actually convert at
higher rates. If they do not, the model has no signal and should
not be deployed.

## Projected Impact

Numbers below are filled in after running the queries against a real
account. The skeleton in `docs/04-business-impact.md` carries the
full table and methodology.

| Metric                     | Conservative | Aggressive |
| -------------------------- | -----------: | ---------: |
| CPA reduction              | TBD          | TBD        |
| Conversion volume increase | TBD          | TBD        |
| Incremental revenue (SEK)  | TBD          | TBD        |
| Payback period             | TBD          | TBD        |

The case I make to a Precis Digital hiring manager: this layer is
where the agency creates compounding value. Once a client's bidding
model is conditioned on signals defined in *our* SQL and shaped by
*our* transformer, switching agencies means rebuilding that layer
from scratch. That is the technical foundation of agency stickiness.
