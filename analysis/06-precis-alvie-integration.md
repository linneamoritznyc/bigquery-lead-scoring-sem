# Productizing for Scale: How This Fits Into Alvie

> Alvie is Precis Digital's proprietary platform for multi-account
> SEM management, bid automation, and reporting. This document
> sketches how the lead-scoring pipeline would integrate as a
> first-class Alvie module rather than a bespoke per-client build.

## Table of Contents

- [Why Productize](#why-productize)
- [Module Architecture](#module-architecture)
- [Per-Client Configuration](#per-client-configuration)
- [Replication Across Verticals](#replication-across-verticals)
- [Alvie UI Integration](#alvie-ui-integration)
- [Operational Model](#operational-model)
- [Migration Path](#migration-path)

## Why Productize

A bespoke build for one e-commerce client takes ~40 hours of MSE
labor up front and ~10 hours of recurring monthly maintenance. That
is fine for one client. For ten clients, it is ten parallel
codebases, ten sets of configs to keep in sync, ten places where a
change to the Google Ads OCI API contract breaks production.

A productized module takes the same SQL, transformer, and uploader
- already factored into clean layers in the portfolio repository -
and exposes them as a single Alvie module that scales linearly with
clients rather than quadratically with maintenance burden.

The case for doing this inside Alvie rather than as a standalone
microservice:

1. **Auth and tenancy already exist.** Alvie handles per-client
   service accounts, IAM, and GCP project boundaries. The lead
   scoring module reuses the existing tenancy plumbing rather than
   reinventing it.
2. **Reporting is centralized.** Alvie's Looker integration is the
   right surface for tier-distribution dashboards, conversion-lift
   tracking, and model-health monitoring.
3. **Account managers already log into Alvie.** Surfacing this
   capability inside the existing tool is dramatically lower
   friction than introducing a new tool to a busy MSE workflow.

## Module Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      Alvie Platform                          │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │ Lead Scoring    │  │ Bid Automation  │  │ Reporting    │ │
│  │ Module (NEW)    │  │ (existing)      │  │ (existing)   │ │
│  └────────┬────────┘  └─────────────────┘  └──────────────┘ │
│           │                                                  │
│  ┌────────▼─────────────────────────────────────────────┐   │
│  │   Shared:  Auth, tenancy, secret manager, Looker     │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────┐
│  Per-client GCP project                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────────┐   │
│  │ BigQuery │───▶│ SQL Job  │───▶│ Cloud Run OCI Upload │   │
│  └──────────┘    └──────────┘    └──────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
                                ┌────────────────────┐
                                │  Google Ads OCI    │
                                └────────────────────┘
```

The module exposes three interfaces:

| Interface     | Audience                | Purpose                                      |
| ------------- | ----------------------- | -------------------------------------------- |
| Config UI     | MSE / Account Manager   | Set per-client tier thresholds and weights.  |
| Dashboard     | Account team + client   | Tier distribution, lift tracking, alerts.    |
| Health Report | Engineering             | Model drift, error rates, SLA compliance.    |

## Per-Client Configuration

Each client gets a YAML config file checked into the Alvie repo and
deployed via the existing CI/CD pipeline:

```yaml
# clients/<client-slug>/lead-scoring.yaml
client_slug: matas-dk
gcp_project: matas-prod
bigquery_dataset: matas_ga4_export
ga_export_table_pattern: events_*

scoring_window:
  type: rolling_30_day

vertical: beauty_retail        # selects default weight registry

weights:
  product_detail_view: 3.0
  add_to_cart: 8.0
  checkout_initiation: 15.0
  unique_products_viewed: 2.0
  session_count: 4.0
  time_on_site_min: 1.0
  bounce_penalty: -5.0

caps:
  product_detail_view: 20
  add_to_cart: 10
  checkout_initiation: 5
  unique_products_viewed: 15
  session_count: 8
  time_on_site_min: 30

activation:
  upload_tiers: [TIER_1_HIGH_INTENT]
  conversion_action: "Predictive Lead Score - Tier 1"
  lookback_days: 14

monitoring:
  alert_email: msx-team@precis.digital
  tier_1_min_share_pct: 15
  tier_1_max_share_pct: 25
```

Defaults come from the vertical (beauty retail, fashion, electronics,
travel, etc.); per-client overrides are explicit and reviewed in
pull requests.

## Replication Across Verticals

Different retail verticals have different funnel shapes. Beauty
shoppers visit more product pages per session; furniture shoppers
have longer between-session gaps; electronics shoppers do more
comparison browsing. The same SQL runs everywhere; the *weights*
and *caps* differ.

Vertical defaults the module would ship with:

| Vertical              | Notable adjustment                                          |
| --------------------- | ----------------------------------------------------------- |
| Beauty / cosmetics    | Higher PDV cap (browsers compare many SKUs).                |
| Fashion / apparel     | Higher unique-products cap; size-variant browsing inflates. |
| Furniture / home      | Lower session-count cap; long consideration cycles.         |
| Electronics           | Higher checkout-initiation weight; comparison-shopping is dense. |
| Travel / hospitality  | Higher time-on-site weight; inspirational browsing matters. |

Each vertical default is a baseline. Per-client overrides absorb
account-specific anomalies (a luxury beauty client might tune
differently from a mass-market beauty client).

## Alvie UI Integration

Three views, embedded in the existing Alvie navigation:

1. **Lead Scoring → Overview.** Tier distribution chart for the last
   30 days, daily conversion-event volume, signal multiplier.
2. **Lead Scoring → Health.** Model drift indicator, alert history,
   last successful upload timestamp, holdout decile correlation.
3. **Lead Scoring → ROI.** Conversion lift attribution, incremental
   revenue, payback tracker. This is the view the MSE shows the
   client during quarterly business reviews.

All three are Looker dashboards backed by BigQuery views the module
materializes; embedding into Alvie is the same pattern existing
modules already use.

## Operational Model

| Cadence    | Activity                                                          |
| ---------- | ----------------------------------------------------------------- |
| Daily      | Scoring SQL runs; OCI upload fires; alerts evaluated.             |
| Weekly     | Holdout decile correlation reviewed by on-call engineer.          |
| Monthly    | Model retrain (re-derive normalization bounds; review weights).   |
| Quarterly  | Client business review with Lead Scoring → ROI dashboard.         |
| Annually   | Vertical-default weight audit across all clients in the vertical. |

## Migration Path

A path from "portfolio repo" to "Alvie module" would look roughly:

1. **Week 1-2.** Lift the SQL and TypeScript pipeline from the
   portfolio repo into the Alvie monorepo as `modules/lead-scoring/`.
2. **Week 3-4.** Wire the YAML config layer; backfill default
   configs for one pilot client.
3. **Week 5-6.** Build the three Looker dashboards against the
   pilot client's data.
4. **Week 7-8.** Run the pilot for one billing cycle. Measure lift.
5. **Month 3.** Onboard two more clients. Iterate the vertical
   defaults based on pilot results.
6. **Month 4-6.** Roll out to remaining e-commerce clients in the
   portfolio. Build the operational runbook into Alvie's existing
   on-call rotation.

Total elapsed time from green-light to ten clients live: roughly
six months. The marginal cost of client number eleven, after that,
is the same as the cost of a config-only PR.
