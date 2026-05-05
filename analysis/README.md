# Analysis

Quantitative artifacts that turn the technical pipeline into a
business case. Everything here is read-only: the JSON files are
populated by SQL queries elsewhere in the repo.

## Table of Contents

- [Files](#files)
- [Workflow](#workflow)

## Files

| File                         | Source / Purpose                                                       |
| ---------------------------- | ---------------------------------------------------------------------- |
| `data/baseline-metrics.json` | Output of `sql/04_baseline_metrics.sql`. The "Before" benchmark.       |
| `data/projected-uplift.json` | Conservative-scenario projection derived from the baseline.           |
| `before-after-model.md`      | Financial-model methodology and scenario walkthrough.                  |

## Workflow

1. Run `sql/04_baseline_metrics.sql` in the BigQuery console.
2. Paste the single-row result into `data/baseline-metrics.json`.
3. Apply the assumptions from `before-after-model.md` and update
   `data/projected-uplift.json`.
4. Numbers from both JSON files cascade into the tables in
   `docs/04-business-impact.md`.
