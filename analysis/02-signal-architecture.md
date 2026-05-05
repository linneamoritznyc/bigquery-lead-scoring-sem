# Six-Tier Intent Pyramid: From Converter to Noise

## Table of Contents

- [The Pyramid](#the-pyramid)
- [Weighting Logic](#weighting-logic)
- [Why Capping Matters](#why-capping-matters)
- [Observed Score Distribution](#observed-score-distribution)
- [How the Tiers Are Used](#how-the-tiers-are-used)

## The Pyramid

```
                  ┌──────────────────────────────────────────┐
   Converted  ─── │  959 users (the ground truth)            │
                  │  Already in Smart Bidding's training set │
                  └──────────────────────────────────────────┘

                  ┌──────────────────────────────────────────┐
   TIER_1     ─── │  5,644 users  (20%, avg propensity 14.52)│  ← OCI gold
   HIGH_INTENT    │  79 add-to-carts, 16 checkouts, $0 rev   │
                  │  → checkout-friction or off-channel      │
                  │  → uploaded as offline conversions       │
                  └──────────────────────────────────────────┘

                  ┌──────────────────────────────────────────┐
   TIER_2     ─── │  5,644 users  (20%, avg propensity 3.63) │  ← Phase 2
   WARM           │  Multiple sessions, light funnel signal  │
                  │  Candidate audience for retargeting      │
                  └──────────────────────────────────────────┘

                  ┌──────────────────────────────────────────┐
   TIER_3     ─── │  8,467 users  (30%, avg propensity 1.53) │  ← Awareness
   BROWSER        │  PDV-only, single-session, exploratory   │
                  │  Useful for top-of-funnel audience builds│
                  └──────────────────────────────────────────┘

                  ┌──────────────────────────────────────────┐
   TIER_4     ─── │  8,469 users  (30%, avg propensity 0.81) │  ← Noise
   LOW_SIGNAL     │  Bounces, single-pageview, near-zero     │
                  │  Excluded from all activations           │
                  └──────────────────────────────────────────┘
```

The pyramid has six levels conceptually - the converted population at
the top sets ground truth, the four scoring tiers are the prediction
output, and the unscored population (users with raw_score = 0)
forms an implicit floor. The four scoring tiers are what the SQL
output emits.

## Weighting Logic

Each behavioral signal contributes a capped, weighted amount to the
raw score:

| Signal                  | Weight | Cap | Max contribution |
| ----------------------- | -----: | --: | ---------------: |
| Product detail view     |    3.0 |  20 |               60 |
| Add-to-cart             |    8.0 |  10 |               80 |
| Checkout initiation     |   15.0 |   5 |               75 |
| Unique products viewed  |    2.0 |  15 |               30 |
| Session count           |    4.0 |   8 |               32 |
| Time on site (minutes)  |    1.0 |  30 |               30 |
| Bounce rate (penalty)   |   -5.0 |   - |               -5 |

The weights step up sharply as the signal moves down the funnel.
A product detail view is worth 3 points; a checkout initiation is
worth 15. That asymmetry is intentional: the marginal information
content of "this user reached the checkout step" is roughly five
times the information content of "this user looked at a product
page", and the model should reflect that.

## Why Capping Matters

`LEAST(metric, cap) * weight` is the central trick in the model.
Without it, a single hyperactive user with 100+ product detail views
would dominate the score distribution and crowd legitimate
high-intent shoppers out of the activation tier.

Without caps, the maximum theoretical score is unbounded. With
caps, the maximum theoretical score from positive signals alone is
roughly **307 points** before normalization (60 + 80 + 75 + 30 + 32
+ 30). After min-max normalization to a 0-100 scale, the observed
maximum in the April 2017 dataset is **100.00**, the observed
minimum is **0.00**, and the median sits in the single digits. The
caps work exactly as intended.

The reason this matters commercially: a model whose top tier is
dominated by one or two outlier users does not generalize. It
identifies a specific person rather than a behavioral pattern. The
caps force the model to find the pattern.

## Observed Score Distribution

The April 2017 distribution from the BigQuery run:

```
Tier              users      min   avg     max
TIER_1_HIGH_INTENT  5,644    5.66  14.52   100.00
TIER_2_WARM         5,644    2.32   3.63     5.65
TIER_3_BROWSER      8,467    1.04   1.53     2.32
TIER_4_LOW_SIGNAL   8,469    0.00   0.81     1.04
```

Two observations worth flagging:

1. **The tail in Tier 1 is real and expected.** Tier 1 spans
   propensity 5.66 to 100.00 because a few power-shoppers genuinely
   exhibit dramatically more intent than the median Tier 1 user.
   The cap prevents one user from dominating, but it does not (and
   should not) flatten genuine differences within the tier.
2. **The tier sizes are remarkably balanced.** 20/20/30/30 is what
   the NTILE-driven definition produces by construction. Any drift
   away from this distribution in a future run is a leading
   indicator of model drift and should trigger an alert.

## How the Tiers Are Used

| Tier              | Activation                                                 |
| ----------------- | ---------------------------------------------------------- |
| TIER_1_HIGH_INTENT | Daily OCI upload to Google Ads. Conversion value = score. |
| TIER_2_WARM       | Phase 2 activation: retargeting list, RLSA bid modifier.   |
| TIER_3_BROWSER    | Top-of-funnel audience for similar-audience expansion.     |
| TIER_4_LOW_SIGNAL | Excluded. Treated as the noise floor for monitoring.       |

The portfolio build only activates Tier 1 because that is where the
signal-to-noise ratio is high enough to give Smart Bidding clean
training data. Tier 2 is the obvious next deployment once Tier 1's
lift is measured and validated.
