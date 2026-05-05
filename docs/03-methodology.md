# Methodology

Statistical rationale behind the scoring model. Written for someone
auditing the model on its merits, not for someone running the
pipeline.

## Table of Contents

- [Why Score, Not Predict](#why-score-not-predict)
- [Funnel-Weighted Feature Contributions](#funnel-weighted-feature-contributions)
- [Capping with LEAST](#capping-with-least)
- [Min-Max Normalization](#min-max-normalization)
- [Excluding Already-Converted Users](#excluding-already-converted-users)
- [Decile Tiering](#decile-tiering)
- [Signal-to-Noise and Data Latency](#signal-to-noise-and-data-latency)
- [Why API-First Architecture](#why-api-first-architecture)
- [Tier Scoring Algorithm](#tier-scoring-algorithm)
- [Why Capping is Critical](#why-capping-is-critical)
- [Conversion Exclusion Logic](#conversion-exclusion-logic)
- [Limitations and Future Work](#limitations-and-future-work)

## Why Score, Not Predict

A traditional propensity model is a classifier: trained on a binary
label (purchased / didn't) and producing a calibrated probability.
That works when conversions are dense enough to support training and
when stable holdout windows exist.

Retail SEM violates both assumptions. Daily conversion volume is
small, distributions shift on every campaign change, and the
downstream consumer (Google's bidder) does not need a probability -
it needs a *relative ranking*. Smart Bidding will re-calibrate any
score we send it against its own conversion outcomes.

So we build a heuristic ranker grounded in domain knowledge rather
than a probabilistic classifier. The output is rank-stable and
interpretable, which matters more than calibration when the
downstream model handles its own calibration.

## Funnel-Weighted Feature Contributions

Each behavioral signal is weighted by its position in the purchase
funnel. The relative weights reflect the marginal information each
event carries:

| Signal                  | Weight | Cap | Rationale                                                     |
| ----------------------- | -----: | --: | ------------------------------------------------------------- |
| Product detail view     |    3.0 |  20 | Cheap and noisy; many viewers do not advance.                 |
| Add-to-cart             |    8.0 |  10 | Strong intent; cart abandonment is high but never zero.       |
| Checkout initiation     |   15.0 |   5 | Highest pre-purchase intent observable in GA.                 |
| Unique products viewed  |    2.0 |  15 | Breadth proxies for shopping mode vs. accidental landing.     |
| Session count           |    4.0 |   8 | Repeat visits indicate consideration, not just bookmarking.   |
| Time on site (minutes)  |    1.0 |  30 | Weak per-minute signal but useful for tie-breaking.           |
| Bounce rate             |   -5.0 |   - | Single negative term; offsets accidental high-volume noise.   |

Weights were chosen by inspection of the dataset rather than learned;
this is appropriate for a heuristic ranker that downstream Smart
Bidding will re-calibrate. A learned variant is documented under
[Limitations and Future Work](#limitations-and-future-work).

## Capping with LEAST

`LEAST(metric, cap) * weight` is the central trick. Without caps, a
single hyperactive bot or a power user with hundreds of pageviews
would dominate the score distribution and crowd legitimate
high-intent shoppers out of Tier 1.

The caps are deliberately tight - the marginal information from the
21st product detail view is essentially zero, so we discard it.
This compresses the upper tail and fattens the working middle of
the distribution, which is exactly the part of the funnel where
incremental Smart Bidding wins are achievable.

## Min-Max Normalization

`100 * (raw - min) / (max - min)` produces a 0-100 score that is
comparable across runs only after the model is stable. The
`score_distribution` CTE recomputes min and max per run, which is
correct for a daily refresh but means scores are not directly
comparable across weeks.

For the OCI use case this is fine: Google Ads treats each upload as
an independent batch and re-learns its own calibration internally.
For longitudinal analysis, persist the percentile rank instead.

## Excluding Already-Converted Users

`WHERE u.completed_purchases = 0` is the most important line in the
model. We are predicting *future* purchase intent. Including users
who already bought leaks the label into the features (their
add-to-cart count is higher because they completed checkout) and
collapses the model into a tautology.

This single filter is also why the scoring window must end before
the activation window, not overlap it. In production, score on
`yesterday - 30d` to `yesterday - 1d`, then activate on `today`.

## Decile Tiering

`NTILE(10)` over the raw score, bucketed into four tiers:

- Tier 1 (deciles 9-10): high intent. Default OCI export target.
- Tier 2 (deciles 7-8): warm. Useful for retargeting audience builds.
- Tier 3 (deciles 4-6): browsers. Good for top-of-funnel audiences.
- Tier 4 (deciles 1-3): low signal. Excluded from all activations.

Tiers are an interpretation layer, not a model artifact. The
underlying score is what flows downstream when finer granularity is
needed.

## Signal-to-Noise and Data Latency

Smart Bidding's per-keyword model is data-hungry: it needs roughly
30-50 conversions per keyword per month to find a stable bid. Most
SEM accounts never reach that threshold for the long-tail half of
their keyword set, which is why those keywords languish on default
bids.

Densifying the conversion signal by an order of magnitude (top-decile
score uploads run into the thousands per week for mid-sized
accounts) raises previously ignored keywords above the bidder's
noise floor. That is the entire mechanism of action.

Latency matters because Smart Bidding values fresh signal more than
old signal. The pipeline targets a sub-24-hour round trip from
visit to OCI upload, which keeps every score within Google's
freshness window.

## Why API-First Architecture

The transformer is a pure function and the uploader is a class with
an injectable logger and a dry-run flag. That structure is overkill
for a one-shot script and exactly right for a system that has to
survive five years of agency tenure.

Future requirements that this architecture absorbs without rewrites:

- Swapping Google Ads for Microsoft Ads (replace one class).
- Adding a Customer Match audience export (compose the same transformer).
- Sending the same score to a CRM for nurture sequencing (a third sink).
- A/B testing a new weight configuration (config object, no code change).

The cost of the upfront abstraction is one weekend. The cost of
retrofitting it later is months.

## Tier Scoring Algorithm

The `raw_scoring` CTE in `sql/01_lead_scoring.sql` is the heart of
the model. Reproduced below with line-by-line annotation:

```sql
raw_scoring AS (
  SELECT
    u.fullVisitorId,
    -- Capped, weighted contributions per behavioral signal:
      LEAST(u.product_detail_views, 20)              *  3.0
    --        ^ raw count             ^ cap ^ weight (small per-event signal)
    + LEAST(u.add_to_cart_events,   10)              *  8.0
    --                                                  ^ medium signal: explicit purchase candidacy
    + LEAST(u.checkout_initiations,  5)              * 15.0
    --                                                  ^ strongest pre-purchase signal
    + LEAST(IFNULL(p.unique_products_viewed, 0), 15) *  2.0
    --                                                  ^ breadth proxy for shopping mode
    + LEAST(u.session_count, 8)                      *  4.0
    --                                                  ^ repeat-visit signal: consideration
    + LEAST(u.total_time_on_site_sec / 60.0, 30)     *  1.0
    --                                                  ^ weak per-minute signal, useful as tiebreaker
    - (u.bounce_rate * 5.0)                          AS raw_score
    --   ^ negative term: penalty for accidental high-volume sessions
  FROM user_aggregates u
  LEFT JOIN product_breadth p USING (fullVisitorId)
  WHERE u.completed_purchases = 0
  --    ^ exclude already-converted users (see "Conversion Exclusion Logic")
)
```

The output is a single `raw_score` per user. Downstream CTEs apply
min-max normalization to 0-100 and `NTILE(10)` to bucket into the
four activation tiers.

## Why Capping is Critical

Without the `LEAST(metric, cap)` wrappers, a single user with 100+
product detail views would score off the chart and break the model.
The caps ensure long-tail stability, and the math is easy to verify:

| Signal                  | Cap | Weight | Max contribution |
| ----------------------- | --: | -----: | ---------------: |
| Product detail view     |  20 |    3.0 |               60 |
| Add-to-cart             |  10 |    8.0 |               80 |
| Checkout initiation     |   5 |   15.0 |               75 |
| Unique products viewed  |  15 |    2.0 |               30 |
| Session count           |   8 |    4.0 |               32 |
| Time on site (minutes)  |  30 |    1.0 |               30 |
| **Maximum raw score**   |   - |      - |          **307** |

Maximum raw score from positive signals alone, before bounce penalty
and before normalization, is **307 points**. After min-max
normalization, the observed maximum in the April 2017 BigQuery run
is **100.00**, exactly as the formula predicts.

If the caps were removed, a single hyperactive user with 200 product
detail views would land at 600 points just from PDV - enough to
push every legitimate Tier 1 user into Tier 2 by relative ranking.
The cap prevents that single-user dominance and forces the model to
identify *patterns* rather than *individuals*.

## Conversion Exclusion Logic

The `WHERE u.completed_purchases = 0` filter in `raw_scoring` is the
most important line in the model. Its purpose is subtle and worth
making explicit.

The model exists to identify users who are *likely* to convert. A
user who has already converted is no longer a prediction target -
they are ground truth. Including them in the scoring universe would
produce two failure modes:

1. **Label leakage.** Converters have higher add-to-cart counts
   *because they completed checkout*. Including them in training
   collapses the model into a tautology: "users who bought have
   higher purchase scores".
2. **Signal pollution.** Converters are already in Smart Bidding's
   training set via the native conversion event. Re-uploading them
   as offline conversions would double-count and inflate the
   bidder's confidence in already-resolved auctions.

OCI's strategic value is identifying *future* converters, not
relabeling past ones. The exclusion clause is what enforces that.

## Limitations and Future Work

- **Heuristic, not learned.** Weights are reasoned, not optimized.
  A logistic regression or gradient-boosted tree trained on the
  validation holdout would likely produce a better ranking. This is
  the next iteration once a stable training pipeline is in place.
- **Single-window scoring.** Production should use rolling 30-day
  windows with daily refresh. The portfolio build uses a single
  month for clarity.
- **No identity resolution.** The synthetic gclid in the OCI export
  is a placeholder. A real deployment joins fullVisitorId to gclid
  via the GA4 `event_params` table or to hashed user-provided data
  via Customer Match.
- **Static feature set.** Adding signals like recency, device
  consistency, or referrer-source loyalty is straightforward but
  out of scope for the case study.
