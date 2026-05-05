# From $32/Day in Signal to $9,272/Month in Incremental Revenue

> The Google Merchandise Store is a US account; all USD figures
> below are source values. SEK figures are presentation-layer
> conversions at 10.5 SEK/USD for the Stockholm-based reader.

## Table of Contents

- [Part A: The Baseline Problem](#part-a-the-baseline-problem)
- [Part B: The Payback](#part-b-the-payback)
- [Part C: Why This Is Stickiness](#part-c-why-this-is-stickiness)
- [Sensitivity: What Could Make This Wrong](#sensitivity-what-could-make-this-wrong)

## Part A: The Baseline Problem

The numbers from `analysis/data/baseline-metrics.json`:

| Metric                       | Value      |
| ---------------------------- | ---------: |
| Monthly conversions          | 959        |
| Monthly revenue (USD)        | $158,789   |
| Average order value (USD)    | $165.58    |
| Conversion rate              | 1.43 %     |
| Daily conversions            | ~32        |
| Tier 1 high-intent users     | 5,644      |
| Tier 1 monthly revenue (USD) | **$0**     |

That last row is the one that earns its keep in any conversation
with a hiring manager. Five thousand six hundred and forty-four
users exhibited strong purchase intent - multiple sessions, deep
funnel engagement, abandoned carts, initiated checkouts - and
contributed zero dollars in attributable revenue during the window.

A representative top-decile user from the April 2017 run:

- 9 sessions
- 443 page views
- 304 minutes on site
- 79 add-to-cart events
- 16 checkout initiations
- **0 completed purchases**

The interpretation is not that this user lacks intent. The
interpretation is that this user almost certainly converts somewhere
- through direct, organic, a returned visit through a different
channel, or a cross-device session not stitched together by GA. Paid
Search did the work of acquiring this user; some other channel got
the credit. That is the structural problem the OCI feedback loop
is built to solve.

### The Conservative Lift Model

Industry benchmarks for OCI-densified Smart Bidding put conversion
lift in the 5-15 percent range. The conservative model used here
takes the floor of that range *and* applies it only to the Tier 1
population, not the whole account:

- Tier 1 size: 5,644 users
- Assumed capture rate from improved bidding: 1 percent
- Incremental conversions: 56 per month
- Incremental revenue: 56 × $165.58 = **$9,272 per month**

Even the rosier interpretation - a 5 percent lift on the full account
(959 × 5% = 48 conversions) - lands in the same neighborhood. The
mechanism of action is signal densification, not audience expansion;
it does not matter much which population frame is used as long as it
is held constant across scenarios.

## Part B: The Payback

Implementation cost, in agency labor:

| Phase                          | Hours | Loaded rate (USD/hr) | Cost      |
| ------------------------------ | ----: | -------------------: | --------: |
| SQL and validation             | 12    | 75                   | $900      |
| TypeScript pipeline            | 16    | 75                   | $1,200    |
| Deployment and monitoring      | 8     | 75                   | $600      |
| Documentation and handoff      | 4     | 75                   | $300      |
| **Total one-time**             | **40**| **75**               | **$3,000**|

Monthly impact:

| Item                                | USD        |
| ----------------------------------- | ---------: |
| Incremental revenue                 | +$9,272    |
| BigQuery on-demand cost             | <$10       |
| Cloud Run + Cloud Scheduler         | <$5        |
| Recurring labor (~10 hrs/month)     | $750       |
| **Net monthly impact**              | **+$8,507**|

Payback math:

```
payback (weeks) = one-time-cost / weekly-impact
                = $3,000 / ($8,507 / 4.33)
                ≈ $3,000 / $1,964
                ≈ 1.5 weeks
```

**Annualized:**

| Metric                         | Year 1     |
| ------------------------------ | ---------: |
| Incremental revenue            | $111,264   |
| Net of recurring cost          | $102,180   |
| Net of one-time + recurring    | $99,180    |
| **ROI on $3,000 build cost**   | **3,206%** |

Even with the recurring labor cost stripped in, the ROI sits north
of three thousand percent in the first year. By Year 2 the pipeline
is pure efficiency.

In SEK at 10.5 SEK/USD: roughly **SEK 97,000 per month** in net
impact, **SEK 1.16 M annualized**.

## Part C: Why This Is Stickiness

The financial case is strong on its own. The strategic case is
stronger.

The signal layer is **proprietary by construction.** Every artifact
that produces the OCI feed lives in the agency's GitHub repository,
not in Google Ads:

- The SQL that computes the propensity score.
- The funnel weights and the cap parameters.
- The four tier definitions.
- The TypeScript transformer.
- The OCI uploader and its retry logic.
- The validation queries and the alert thresholds.

If the client switches agencies, none of this transfers. The new
agency inherits whatever conversion actions exist in the Google Ads
UI - which is to say, they inherit nothing of the signal layer. The
new agency would need to rebuild the entire pipeline from scratch
or operate without it and lose the 5-15 percent conversion lift.

That is intentional lock-in, built into the technical architecture.
It is not unethical lock-in, because the value the lock-in protects
is value the agency genuinely created. It is the same dynamic that
makes a senior engineer's tribal knowledge sticky - except codified
in a repository that does not quit, get sick, or take parental leave.

The hiring case I would make: every hour spent building this signal
layer is an hour invested in compounding agency value. Account
managers can churn; campaigns can change; bid strategies can be
swapped out. The signal layer keeps producing.

## Sensitivity: What Could Make This Wrong

Three failure modes have to be acknowledged honestly:

1. **The capture rate is the soft spot.** The 1 percent assumption
   on Tier 1 is conservative, but it is not measured. The real
   capture rate could be anywhere from 0.3 percent to 5 percent
   depending on the account, the seasonality, and the quality of
   the keyword tail. The conservative number is defensible; the
   real number requires measurement.
2. **Smart Bidding's integration window is not zero.** The first
   14 days post-launch typically show no measurable lift while the
   bidder integrates the new signal. The 1.5-week payback figure
   assumes immediate lift; in practice, payback is 4-6 weeks once
   the integration window is included.
3. **Tier 1 size depends on traffic patterns.** A change in
   marketing mix, a seasonal lull, or a campaign pause can shrink
   Tier 1 below the 5-15 percent target band. Below that band, the
   densification benefit attenuates and the payback period stretches.

The deployment runbook in `docs/05-deployment-guide.md` specifies
how each of these is monitored and what to do when one of them
slips.
