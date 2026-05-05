# Offline Conversion Imports: The Bridge Between Intent and Smart Bidding

## Table of Contents

- [Why OCI, Not Native Conversion Tracking](#why-oci-not-native-conversion-tracking)
- [End-to-End Flow](#end-to-end-flow)
- [Implementation Choices That Matter](#implementation-choices-that-matter)
- [Lookback Window](#lookback-window)
- [Tier Selection: Why Only Tier 1](#tier-selection-why-only-tier-1)
- [Success Metrics](#success-metrics)

## Why OCI, Not Native Conversion Tracking

Native Google Ads conversion tracking captures events that happen
inside the click attribution window via the gtag pixel. That works
beautifully for hard conversions (a purchase happens, the pixel
fires, Smart Bidding learns). It is structurally incapable of
capturing two things this pipeline cares about:

1. **Soft signals.** A high-propensity user who never converts
   in-window contributes nothing to native tracking. They are the
   majority of the population and the entire point of the lead
   scoring exercise.
2. **Out-of-band conversions.** A user who converts after the
   tracking window closes, or who converts through a channel
   outside Google's measurement (in-store, phone, app), is invisible
   to the native pipeline.

Offline Conversion Import is built for exactly these two cases. The
contract: the advertiser uploads `(gclid, conversion_name,
conversion_time, conversion_value)` tuples, Google Ads matches them
back to the originating click, and Smart Bidding receives them as
training events with the same weight as native conversions.

## End-to-End Flow

```
[ BigQuery ]  bigquery-public-data.google_analytics_sample (or GA4 export)
     │
     │  daily, 06:00 Europe/Stockholm
     ▼
[ sql/01_lead_scoring.sql ]  scores 28,224 non-converter users
     │
     ▼
[ sql/03_export_for_oci.sql ]  filters to 5,644 Tier 1 users
     │
     ▼
[ scripts/src/index.ts ]  transforms to OCI CSV shape
     │
     ▼
[ Google Ads OCI API ]  bulk upload via google-ads-api Node client
     │
     ▼
[ Smart Bidding ]  trains on 6,603 events instead of 959
     │
     ▼
[ Auction-time bids ]  mid-funnel keywords now optimized
     │
     ▼
[ Tomorrow's GA sessions ]  feed back into the next day's score
```

Every arrow in this diagram is automatable. The portfolio build
runs the BigQuery and CSV transformation steps end-to-end with a
mock fixture; the production deployment guide
(`docs/05-deployment-guide.md`) wires the live BigQuery and OCI
calls.

## Implementation Choices That Matter

| Decision                       | Choice                                | Why                                                                 |
| ------------------------------ | ------------------------------------- | ------------------------------------------------------------------- |
| Conversion action name         | `Predictive Lead Score - Tier 1`      | Distinct from native conversions so they can be analyzed separately. |
| Conversion value               | propensity score × multiplier (USD)   | Lets Smart Bidding learn the *gradient* of intent, not just presence.|
| Identifier                     | gclid (production) / synthetic (demo) | gclid is the only identifier that works without Customer Match.     |
| Upload cadence                 | Daily, 06:00 Europe/Stockholm         | Inside Google's 24-hour freshness window for OCI.                   |
| Idempotency                    | Re-upload safe (Google dedupes)       | Lets the daily job retry on transient failure without duplicates.   |

The conversion-value choice is the one that earns its keep. By
sending the propensity score as the value, Smart Bidding can rank
imported conversions against each other and against native
conversions. A "real" $200 purchase is more valuable than a
propensity-87 lead, but a propensity-95 lead is more valuable than
a propensity-12 lead. The value column communicates that ranking.

## Lookback Window

The 14-day lookback window is the most-asked question and the most
important configuration choice. Three constraints have to be
satisfied simultaneously:

1. **Long enough** that legitimate offline conversions are captured.
   In retail SEM, the median time from click to checkout is 1-3
   days; the 95th percentile is around 14 days.
2. **Short enough** that the signal stays fresh. Smart Bidding
   weights recent conversions more heavily than old ones, so a
   60-day window dilutes the signal.
3. **Distinct from the native-tracking window** so OCI does not
   double-count conversions that were already captured natively.

Fourteen days threads all three needles. It is also the default in
most published Google Ads OCI case studies, which makes it the
defensible choice when a client asks why this number and not
another.

## Tier Selection: Why Only Tier 1

The portfolio build uploads only Tier 1. The reasoning:

- **Tier 1 has high signal-to-noise.** Avg propensity 14.52 with a
  sharp cutoff against Tier 2 at 5.65. A model trained on Tier 1
  will not be confused by ambiguous warm-prospect signals.
- **Smart Bidding tolerates a narrow tier better than a noisy one.**
  Adding Tier 2 doubles the volume but halves the signal density.
  The bidder learns slower from a noisier feed.
- **Phase 2 is a planned deployment, not an oversight.** Once Tier 1
  conversion lift is measured and validated, Tier 2 gets layered on
  with its own conversion action name so the contributions can be
  isolated in reporting.

This is also a conservative-by-design commercial posture. A
launching pipeline that quietly underdelivers because Tier 2 noise
diluted Tier 1 signal is a credibility hit. A launching pipeline
that delivers a measurable Tier 1 lift in Month 1 and adds Tier 2
in Month 3 builds compounding confidence.

## Success Metrics

The pipeline succeeds or fails on three signals:

1. **Smart Bidding convergence speed.** Bids stabilize on a larger
   set of keywords, faster. Pre-deployment, fewer than 5 keywords
   meet Google's signal-stability threshold; post-deployment, target
   is 150-200.
2. **Mid-funnel keyword CPC.** Drops 15-25 percent within four to
   six weeks as the bidder learns to bid more precisely on
   previously-default-CPC keywords.
3. **Conversion lift on Tier 1 keywords.** The tier acts as an
   audience overlay; Smart Bidding can be configured to bid 10-20
   percent higher when a Tier 1 user is in the auction. Conservative
   target: 1 percent lift on the 5,644-user Tier 1 audience monthly,
   equivalent to 56 incremental conversions and approximately
   $9,272 in incremental monthly revenue.

Each of these is monitored separately. The deployment guide's
runbook section specifies the alert thresholds and the
investigation playbook when one of them slips.
