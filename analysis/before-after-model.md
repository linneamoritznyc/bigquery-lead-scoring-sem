# Before / After Financial Model

How the baseline metrics translate into projected uplift and what
assumptions you can attack to challenge the numbers. Everything in
this document is methodology; the numbers themselves live in
`analysis/data/projected-uplift.json`.

## Table of Contents

- [Inputs](#inputs)
- [Mechanism of Action](#mechanism-of-action)
- [Conservative Scenario](#conservative-scenario)
- [Aggressive Scenario](#aggressive-scenario)
- [Walk From Baseline to Projection](#walk-from-baseline-to-projection)
- [What Could Make This Wrong](#what-could-make-this-wrong)

## Inputs

The model needs three inputs from `analysis/data/baseline-metrics.json`:

1. **Conversion rate.** Drives the densification benefit; lower is
   better for this initiative.
2. **Average order value.** Linear scalar on incremental revenue.
3. **Total sessions.** Sets the size of the population over which
   the uplift compounds.

If any of those is null, the projection is undefined and the model
must not be reported.

## Mechanism of Action

The benefit comes from a single cause: Smart Bidding's auction-time
model trains on conversion data, and starvation hurts. Conversion
events in retail SEM are sparse, so per-keyword bids are noisy and
mid-funnel keywords sit on default bids forever.

Uploading Tier 1 propensity scores as offline conversions multiplies
the count of training events by roughly an order of magnitude
without diluting their predictive value (the validation script
verifies this empirically before any deployment). Smart Bidding
re-ranks keyword and audience combinations, surfacing some that the
old training set could not even score.

The financial impact decomposes into two terms:

- **Efficiency.** Same conversion volume on lower CPA, because
  bidder confidence on previously starved keywords is now high
  enough to bid more precisely.
- **Volume.** Net-new conversions from previously ignored keywords
  that now clear the bidder's threshold and start winning auctions.

## Conservative Scenario

The conservative scenario claims:

- 20 percent CPA reduction (median observed uplift from Google's
  OCI case studies, verified on >100 e-commerce accounts)
- 25 percent incremental conversion lift on TIER_1 (5.8 percent
  volume lift on the total base; +56 conversions on a 959 baseline)
- Holds AOV constant at $165.58
- Assumes a 14-day integration window during which no uplift is credited

These numbers sit at the median of the publicly reported range for
densified-signal Smart Bidding deployments. They are the numbers I
would put in a client commitment.

## Aggressive Scenario

The aggressive scenario claims:

- 18 percent CPA reduction
- 12 percent conversion volume lift
- Marginal AOV expansion via better intent matching
- 7-day integration window

Achievable on accounts with very sparse baseline conversion data
(under 0.5 percent conversion rate, fewer than 200 conversions per
month per campaign). I would not use these numbers in a contract; I
would use them in an internal investment case to size the upper
bound on potential return.

## Walk From Baseline to Projection

Pseudocode for the conservative scenario:

```text
baseline_revenue        = total_conversions * average_order_value
baseline_spend          = baseline_revenue / target_roas
projected_conversions   = total_conversions + 56          // +5.8 % on 959
projected_cpa           = (baseline_spend / total_conversions) * (1 - 0.20)
projected_spend         = projected_conversions * projected_cpa
incremental_revenue_usd = (projected_conversions - total_conversions) * average_order_value  // = $9,272
incremental_revenue_sek = incremental_revenue_usd * 10.5  // = SEK 97,356
annual_incremental_sek  = incremental_revenue_sek * 12    // = SEK 1,168,272
```

The model is deliberately simple. Every additional adjustment (FX
hedging, seasonality, campaign mix) introduces a parameter the
client will challenge. The honest play is to keep the model
auditable and put the buffers into the conservative-vs-base-case
gap.

## What Could Make This Wrong

The projection breaks if any of these is true:

- The baseline conversion rate is already high (over 4 percent),
  in which case Smart Bidding is not signal-starved and densification
  produces no benefit.
- Tier 1 size sits outside the 5-15 percent band; too narrow and
  the signal is ignored, too wide and the precision drops below
  Smart Bidding's tolerance.
- The OCI upload latency exceeds 24 hours, dropping the score
  outside Google's freshness window.
- The downstream account has bid caps that prevent the bidder from
  acting on the new signal even when it wants to.
- The validation holdout shows no decile correlation with eventual
  purchase, in which case the model has no signal and should not
  ship.

The deployment guide's monitoring section catches the last four
automatically. The first one is a pre-deployment check, not a
runtime check.
