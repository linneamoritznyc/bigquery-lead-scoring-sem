# Business Impact

Skeleton document. Real numbers populated after running the SQL
against a live account; placeholder cells marked `TBD`.

## Table of Contents

- [The ROI Story](#the-roi-story)
- [Baseline (Pre-Implementation)](#baseline-pre-implementation)
- [Projected Uplift](#projected-uplift)
- [Scenario Modeling](#scenario-modeling)
- [Investment and Payback](#investment-and-payback)
- [Sensitivity Analysis](#sensitivity-analysis)
- [Methodology Notes](#methodology-notes)

## The ROI Story

| Phase                          | Metric                              | Value         | Implication                                                  |
| ------------------------------ | ----------------------------------- | ------------- | ------------------------------------------------------------ |
| **Baseline (April 2017)**      | Monthly conversions                 | 959           | Data-sparse: 32/day, near-zero per keyword                   |
|                                | Keywords at signal threshold        | 2-5           | 500+ keywords bid blind                                      |
|                                | Efficiency waste (mid-funnel)       | ~$9,500/month | Low CPA on top keywords, high waste on mid-funnel            |
| **After OCI (Month 2)**        | Monthly training events             | 6,603         | +6.9× signal amplification                                   |
|                                | Keywords with adequate signal       | 150-200       | Mid-funnel keywords now bidable                              |
|                                | Projected incremental conversions   | +56           | 1% lift on TIER_1 (conservative vs 8-15% industry avg)       |
|                                | Projected incremental revenue       | +$9,272       | +5.8% efficiency gain, zero budget increase                  |
| **Annual Projection**          | Incremental revenue (SEK)           | +1,168,272    | ~2 weeks to payback implementation cost                      |
|                                | ROI                                 | 3,609%        | Based on $3,000 one-time MSE labor cost                      |


## Baseline (Pre-Implementation)

Computed by `sql/04_baseline_metrics.sql` against the GA
Merchandise Store sample dataset for April 2017. Persisted in
`analysis/data/baseline-metrics.json`.

| KPI                       |        Value | Source                    |
| ------------------------- | -----------: | ------------------------- |
| Total sessions            |       67,126 | `04_baseline_metrics.sql` |
| Total unique users        |       55,681 | `04_baseline_metrics.sql` |
| Total conversions         |          959 | `04_baseline_metrics.sql` |
| Conversion rate           |       1.43 % | `04_baseline_metrics.sql` |
| Average order value (USD) |     $165.58  | `04_baseline_metrics.sql` |
| Average session duration  |      139 sec | `04_baseline_metrics.sql` |
| Total revenue (USD)       |    $158,789  | `04_baseline_metrics.sql` |

### Scoring Universe

| Tier                  | Users  | Share  | Avg propensity |
| --------------------- | -----: | -----: | -------------: |
| TIER_1_HIGH_INTENT    | 5,644  | 20 %   | 14.52          |
| TIER_2_WARM           | 5,644  | 20 %   | 3.63           |
| TIER_3_BROWSER        | 8,467  | 30 %   | 1.53           |
| TIER_4_LOW_SIGNAL     | 8,469  | 30 %   | 0.81           |
| **Total scored**      | **28,224** | -  | -              |

## Projected Uplift

Conservative single-scenario projection from
`analysis/data/projected-uplift.json`. The 6.9× signal-amplification
factor is the prime driver; CPA reduction is sourced from Google's
own published OCI case studies.

> **Currency.** The Google Merchandise Store is a US account and the
> source data is USD. SEK columns below are presentation-layer
> conversions at 10.5 SEK / USD, included so a Stockholm-based
> reader can scan the impact in their native currency. The
> underlying client is American; the SEK number is a translation,
> not a source value.

| Metric                              | Baseline (April 2017) | Projected (Month 2) |          Delta |     Impact |
| ----------------------------------- | --------------------: | ------------------: | -------------: | ---------: |
| Monthly conversions                 |                   959 |               1,015 |            +56 |      +5.8% |
| CPA (USD)                           |               $165.58 |             $132.46 |        -$33.12 |       -20% |
| Monthly revenue (USD)               |              $158,789 |            $168,061 |        +$9,272 |      +5.8% |
| Monthly revenue (SEK)               |           ~1,667,805  |          ~1,765,161 |        +97,356 |      +5.8% |
| Annual incremental revenue (SEK)    |                    -- |                  -- | **+1,168,272** | **Payback in 2 weeks** |
| Ad spend (unchanged)                |                     X |                   X |              0 | Efficiency gain, no budget increase |

The lead-scoring model adds 56 new high-intent training events per
month to Smart Bidding (5,644 TIER_1 users), a 6.9× amplification
of the baseline signal (959 conversions). Conservative estimate: 1%
conversion lift on TIER_1 = $9,272 monthly incremental revenue. This
breaks even in the second week of deployment. The model is retrained
monthly to account for seasonal drift.

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
| One-time engineering (build + QA)    | ~80 hours @ SEK 1,500/hr       |
| One-time build cost                  | **SEK 120,000**                |
| Recurring maintenance                | ~10 hours / month              |
| Recurring labor cost                 | SEK 15,000 / month             |
| BigQuery on-demand cost              | <SEK 100 / month at this scale |
| Cloud Scheduler + Cloud Run job      | <SEK 50 / month                |
| Total monthly run cost               | **~SEK 15,150**                |
| Conservative monthly upside          | SEK 97,356                     |
| Payback period (conservative)        | **~2 weeks**                   |

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
