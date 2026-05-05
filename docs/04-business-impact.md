# Business Impact

Skeleton document. Real numbers populated after running the SQL
against a live account; placeholder cells marked `TBD`.

## Table of Contents

- [Baseline (Pre-Implementation)](#baseline-pre-implementation)
- [Projected Uplift](#projected-uplift)
- [Scenario Modeling](#scenario-modeling)
- [Investment and Payback](#investment-and-payback)
- [Sensitivity Analysis](#sensitivity-analysis)
- [Methodology Notes](#methodology-notes)

## Baseline (Pre-Implementation)

Numbers below are computed by `sql/04_baseline_metrics.sql` and
written to `analysis/data/baseline-metrics.json`. Until that script
is run, every cell is `TBD`.

| KPI                       | Value | Source                              |
| ------------------------- | ----- | ----------------------------------- |
| Total sessions            | TBD   | `04_baseline_metrics.sql`           |
| Total unique users        | TBD   | `04_baseline_metrics.sql`           |
| Total conversions         | TBD   | `04_baseline_metrics.sql`           |
| Conversion rate           | TBD   | `04_baseline_metrics.sql`           |
| Average order value (USD) | TBD   | `04_baseline_metrics.sql`           |
| Average session duration  | TBD   | `04_baseline_metrics.sql`           |
| Total revenue (USD)       | TBD   | `04_baseline_metrics.sql`           |

## Projected Uplift

Uplift estimates use industry-benchmark ranges, not vendor claims.
The methodology section below explains the derivation. Outputs land
in `analysis/data/projected-uplift.json`.

| Metric                              | Conservative | Base case | Aggressive |
| ----------------------------------- | -----------: | --------: | ---------: |
| CPA reduction                       | TBD          | TBD       | TBD        |
| Conversion volume increase          | TBD          | TBD       | TBD        |
| Incremental revenue (SEK, monthly)  | TBD          | TBD       | TBD        |

## Scenario Modeling

Three scenarios bracket the range of plausible outcomes:

- **Conservative.** Lower-bound assumptions: 8 percent CPA reduction,
  5 percent volume lift. Used in client commitments.
- **Base case.** Industry-average outcomes from published Smart
  Bidding case studies on densified signal layers. Used in
  internal forecasts.
- **Aggressive.** Upper-bound assumptions: 18 percent CPA reduction,
  12 percent volume lift. Achievable on accounts with very sparse
  baseline conversion data.

The numbers in `analysis/data/projected-uplift.json` reflect the
**conservative** scenario by default.

## Investment and Payback

| Line item                            | Estimate                       |
| ------------------------------------ | ------------------------------ |
| One-time engineering (build + QA)    | TBD hours                      |
| Recurring maintenance                | TBD hours / month              |
| BigQuery on-demand cost              | TBD SEK / month                |
| Cloud Scheduler + Cloud Run          | TBD SEK / month                |
| Total monthly run cost               | TBD SEK                        |
| Payback period (conservative)        | TBD months                     |

## Sensitivity Analysis

The model is most sensitive to:

1. **Baseline conversion rate.** Lower baselines benefit more,
   because the densified signal closes a larger gap relative to
   Smart Bidding's training threshold.
2. **Average order value.** Higher AOV linearly scales the
   incremental revenue figure. Conservative scenarios use the
   account's trailing-six-month median, not the mean.
3. **Tier 1 size as a share of total users.** If Tier 1 is too
   narrow (under 5 percent of users), the densification benefit
   does not clear the noise floor; if too wide (over 25 percent),
   precision drops and Smart Bidding ignores the signal.

## Methodology Notes

- All projections are presented as ranges, never point estimates.
- Industry benchmarks come from publicly available Google Ads case
  studies. Internal benchmarks are quoted only when accompanied by
  a sample size.
- "Incremental revenue" is the lift over the counterfactual where
  Smart Bidding runs without the densified signal. It is *not* the
  total revenue from Tier 1 users, which would double-count baseline
  conversions.
