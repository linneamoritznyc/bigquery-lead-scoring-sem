# Where This Model Breaks (And How to Fix It)

The propensity model is a heuristic ranker, not a calibrated
classifier. It works because the ranking is rank-stable and the
downstream consumer (Smart Bidding) recalibrates against its own
conversion outcomes anyway. But every heuristic has failure modes,
and a senior engineering posture requires naming them before a
client does.

## Table of Contents

- [Limitation 1: Model Drift](#limitation-1-model-drift)
- [Limitation 2: Attribution Leakage](#limitation-2-attribution-leakage)
- [Limitation 3: Tier Cannibalization](#limitation-3-tier-cannibalization)
- [Limitation 4: Seasonal Blindness](#limitation-4-seasonal-blindness)
- [What Is Not a Limitation](#what-is-not-a-limitation)

## Limitation 1: Model Drift

**Problem.** User behavior shifts over time. The funnel actions that
predicted purchase intent in April 2017 may predict it less well in
October 2017, and predict it differently again during Black Friday
in November. The weights and caps in the SQL are static; the
behavior they measure is not.

The leading indicator of drift is the tier distribution itself. By
construction the tiers should land at 20/20/30/30 percent. When they
don't, something in the input data has changed.

**Mitigation.**

1. Retrain the SQL monthly. "Retrain" here means re-derive the
   min/max bounds for normalization and re-tune the weights against
   a fresh holdout window.
2. Monitor the tier distribution daily. If `TIER_1_HIGH_INTENT` falls
   below 15 percent or rises above 25 percent of the scored
   universe, alert.
3. Track the holdout decile correlation from `sql/02_validation.sql`
   weekly. When the top decile's conversion rate drops below 3x the
   bottom decile's, treat as model drift and pause uploads pending
   review.

## Limitation 2: Attribution Leakage

**Problem.** The 14-day OCI lookback window can overlap with native
GA conversion tracking. A user who appears in the Tier 1 OCI upload
on day 5 and converts natively on day 7 risks being double-counted -
once as the offline conversion, once as the native conversion -
which inflates Smart Bidding's training set and corrupts the bid
optimization.

**Mitigation.**

1. Use distinct `Conversion Name` values for OCI and native
   conversions. Tier 1 uploads use `Predictive Lead Score - Tier 1`,
   never the same name as a native purchase event. Smart Bidding
   weights conversion actions independently.
2. Implement deduplication at the SQL layer: only export Tier 1
   users whose `fullVisitorId` does not appear in the native
   conversion table for the same window.
3. Document the lookback window explicitly in the client SLA so the
   contract reflects the technical reality.

## Limitation 3: Tier Cannibalization

**Problem.** Once Tier 1 is uploaded as offline conversions, Smart
Bidding will preferentially bid up Tier 1 users. Without
constraints, this can pull budget away from Tier 2 and Tier 3
audiences and shrink the top-of-funnel pipeline that produces
*future* Tier 1 users. Optimization in the short run, starvation
in the long run.

**Mitigation.**

1. Apply tier-specific bid modifiers with hard caps:
   - Tier 1: bid modifier ceiling of +20 percent.
   - Tier 2: bid modifier in the +5 to +10 percent range.
   - Tier 3: bid modifier no lower than -10 percent.
   - Tier 4: excluded from activation entirely.
2. A/B test the bid modifiers. Run a 2-week experiment with the
   modifiers on for half the campaigns and off for the other half;
   measure incremental conversions, not just CPA.
3. Monitor Tier 3 audience size. If it shrinks more than 15 percent
   month-over-month, the cannibalization is hitting top-of-funnel
   and the Tier 1 modifier should be tightened.

## Limitation 4: Seasonal Blindness

**Problem.** The April 2017 weights were tuned on spring traffic.
They do not know about Black Friday, Boxing Day, mid-summer
vacation lulls, or back-to-school. A weight that performs well in
April may underweight checkout-initiation signals during a
Black-Friday week when add-to-cart velocity goes up across the
board.

**Mitigation.**

1. Retrain the SQL before every major retail season, not just
   monthly. The recurring monthly retrain catches gradual drift; a
   pre-season retrain catches structural shifts.
2. Maintain a seasonal weight registry. For e-commerce verticals,
   keep two weight configurations: a default and a peak-season
   variant. Document the swap criteria.
3. When year-over-year data is available, validate this year's
   weights against last year's same-window data before deploying.
4. If no historical data exists for a given season (a new client),
   ship the default weights with conservative bid modifier caps and
   tighten the model after the season produces ground truth.

## What Is Not a Limitation

A few things that are sometimes raised as limitations are not, and
are worth pre-empting:

- **The model is heuristic, not learned.** This is by design. A
  learned classifier would be more accurate at the cost of being
  uninterpretable, and the downstream consumer (Smart Bidding) does
  the calibration that a learned classifier would have provided.
  The interpretability is the point.
- **The synthetic gclid in the demo build.** Production deployment
  joins real gclid via the GA4 export. The synthetic identifier
  exists only so the portfolio CSV has a realistic shape without
  exposing real client data.
- **The capping behavior could miss a true power-shopper.** It
  could, but the risk is asymmetric: missing a power-shopper costs
  one incremental conversion; letting a power-shopper dominate the
  signal corrupts thousands of bid decisions. The cap is the right
  trade-off.
