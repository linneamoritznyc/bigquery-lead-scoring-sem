# SQL Pipeline

BigQuery is the system of record for the lead scoring model. Each file
in this directory is independently runnable in the BigQuery console
against the public `bigquery-public-data.google_analytics_sample`
dataset.

## Table of Contents

- [Files](#files)
- [Execution Order](#execution-order)
- [Data Window](#data-window)
- [Cost Notes](#cost-notes)
- [Conventions](#conventions)

## Files

| File                        | Purpose                                                                 |
| --------------------------- | ----------------------------------------------------------------------- |
| `01_lead_scoring.sql`       | Funnel-weighted propensity score, decile rank, and tiered audience.     |
| `02_validation.sql`         | Top-10 spot check, tier distribution, and decile-vs-purchase holdout.   |
| `03_export_for_oci.sql`     | Slim OCI-shaped export of the Tier 1 high-intent audience.              |
| `04_baseline_metrics.sql`   | Pre-implementation KPI snapshot for the business-case "Before" column.  |

## Execution Order

For a first run, execute the files in order:

1. `04_baseline_metrics.sql` first - this anchors the business case.
2. `01_lead_scoring.sql` to materialize the scoring universe.
3. `02_validation.sql` to confirm the model has predictive lift.
4. `03_export_for_oci.sql` only after validation passes.

In production, scripts 1 and 3 run on a daily schedule via Cloud
Scheduler. Scripts 2 and 4 are run on demand or weekly.

## Data Window

Every query targets `_TABLE_SUFFIX BETWEEN '20170401' AND '20170430'`.
This is a deliberate choice: the GA Merchandise Store dataset has
twelve months available (Aug 2016 - Aug 2017), and a single month
gives a tractable, reviewable working set for a case study while
exercising every code path the production pipeline will hit.

To run against the full year, change the suffix range and remove the
`LIMIT 1000` from `01_lead_scoring.sql`.

## Cost Notes

Each query scans roughly 350 MB to 1.2 GB of partitioned data when
restricted to April 2017. Under BigQuery's on-demand pricing, the full
sequence costs well under a US dollar at current rates. Always check
the bytes-billed estimate in the BigQuery console before running an
unbounded variant.

## Conventions

- Every file opens with a header block: purpose, input dataset,
  output shape, and assumptions.
- CTE names are lower-snake-case and read as nouns.
- `SAFE_DIVIDE` and `NULLIF` are used wherever a denominator could be
  zero. Surfacing a NULL is preferred over throwing a runtime error.
- `LEAST(...)` caps every per-feature contribution before weighting,
  preventing power users from dominating the final score.
