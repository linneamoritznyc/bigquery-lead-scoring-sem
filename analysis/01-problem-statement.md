# The Data-Sparse SEM Problem: Why 99% of Keywords Bid Blind

## Table of Contents

- [The Threshold Smart Bidding Cannot Cross](#the-threshold-smart-bidding-cannot-cross)
- [The Math Behind the Sparseness](#the-math-behind-the-sparseness)
- [The Mid-Funnel Blind Spot](#the-mid-funnel-blind-spot)
- [Quantifying the Waste](#quantifying-the-waste)
- [Why This Problem Compounds](#why-this-problem-compounds)

## The Threshold Smart Bidding Cannot Cross

Google's Smart Bidding documentation is unambiguous: the auction-time
model needs roughly **30 to 50 conversions per keyword per month**
to stabilize. Below that threshold, the bidder cannot distinguish
real signal from noise on a given keyword and falls back on
account-level priors and broad-match priors that are far less
precise than per-keyword optimization.

The Google Merchandise Store, in April 2017, generated **959 total
conversions** across the entire account. Even if all 959 lived on a
single keyword, that would be one keyword at threshold. In reality,
they are spread across the account, and the long tail of mid-funnel
keywords sees zero of them in any given month.

## The Math Behind the Sparseness

The arithmetic is small enough to do in your head, which is why the
problem is so easy to dismiss until you draw it out:

| Quantity                                | Value                |
| --------------------------------------- | -------------------- |
| Total conversions in window             | 959                  |
| Days in window                          | 30                   |
| Conversions per day                     | **31.97**            |
| Assumed active keyword count            | 500 (conservative)   |
| Conversions per keyword per day         | **0.064**            |
| Conversions per keyword per month       | **1.92**             |

To put it bluntly: the average keyword in this account sees **two**
conversions per month. Smart Bidding wants thirty. The shortfall is
not marginal - it is an order of magnitude.

## The Mid-Funnel Blind Spot

Smart Bidding does not give up entirely when starved of signal. It
falls back on the bid setting the advertiser configured manually
(usually a static target CPA or default CPC) and applies broad
demographic and time-of-day modifiers from the account-level model.

That is acceptable on the head terms - "google merchandise store",
"google branded apparel" - because those keywords convert at high
enough volume to clear the threshold on their own. It is a disaster
on the mid-funnel: keywords like "embroidered hoodie unisex",
"laptop sleeve 13 inch", "logo water bottle reusable". These
keywords have lower volume per term but high commercial intent, and
they are precisely the keywords where a thoughtful bidder beats a
default-CPC bidder.

Without dense conversion signal, Smart Bidding bids those keywords
at default and the advertiser overpays on the ones that under-convert
while underpaying on the ones that would have converted with a
slightly higher bid.

## Quantifying the Waste

We do not have ad spend data for the GA Merchandise Store, so the
waste figure has to be modeled rather than measured. Using a
conservative illustrative frame:

- Assume 30 percent of monthly ad spend goes to mid-funnel keywords.
- Assume 20 percent of that spend is wasted because the bidder cannot
  optimize per-keyword.
- For an account spending the equivalent of $158,789 in revenue on
  a 1:1 cost-revenue ratio, that is roughly **$9,500 per month** in
  pure inefficiency from the data-sparseness problem alone.

The numbers move with account size, but the structure does not. On
a $1M-per-month account the waste is $60,000 per month. On a
SEK 100M-per-year retail account in Stockholm it is six figures of
SEK every month, indefinitely, unless the signal layer is densified.

## Why This Problem Compounds

The data-sparseness problem is self-reinforcing in a way that makes
it worse the longer it runs:

1. Mid-funnel keywords get default bids → impressions are mispriced.
2. Mispriced impressions deliver low-quality clicks → conversion
   rates on those keywords stay low.
3. Low conversion rates keep the keyword below threshold → the bidder
   never gets the data it would need to fix the bid.
4. The advertiser concludes the keyword "doesn't work" and pauses it.

The keyword was never given a chance. The signal was the bottleneck,
not the keyword.

This is the problem the lead-scoring pipeline solves: it manufactures
high-quality training signal from behavioral data that already
exists in BigQuery, gives it to Smart Bidding via the Offline
Conversion Import API, and lets the bidder finally see the long tail
of intent that the conversion event by itself was always going to
miss.
