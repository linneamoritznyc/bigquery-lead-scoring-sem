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
