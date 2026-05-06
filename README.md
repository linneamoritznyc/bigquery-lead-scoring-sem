# BigQuery-driven Lead Scoring for Predictive SEM Bidding

> Densify the conversion signal Smart Bidding trains on, before the click ever converts.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](./scripts/tsconfig.json)
[![SQL](https://img.shields.io/badge/SQL-BigQuery-4285F4.svg)](./sql)
[![CI](https://img.shields.io/badge/CI-GitHub%20Actions-2088FF.svg)](./.github/workflows/ci.yml)
[![Build](https://img.shields.io/badge/build-passing-brightgreen.svg)](./.github/workflows/ci.yml)

A production-shaped MarTech case study built around the public
Google Merchandise Store dataset. The pipeline scores every visitor
on a 0-100 propensity scale, exports the top decile to Google Ads
as offline conversions, and gives Smart Bidding a denser training
signal than any individual conversion event could provide.

Built as a portfolio demonstration for the **Media Solutions
Engineer (Paid Search / SEM)** role at **Precis Digital, Stockholm**.

## Table of Contents

- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [Tech Stack](#tech-stack)
- [Repository Structure](#repository-structure)
- [Quick Start](#quick-start)
- [Documentation](#documentation)
- [Business Impact](#business-impact)
- [About the Author](#about-the-author)

## The Problem

Retail SEM accounts have a structural data problem: conversions are
sparse, with typical session-to-purchase rates well under two
percent. Smart Bidding's auction-time models train on those
conversion events, so most accounts have a long tail of mid-funnel
keywords that never receive enough signal to be optimized. The
keywords with the most room to improve are precisely the keywords
the bidder cannot see.

## The Solution

Build a behavioral propensity score in BigQuery, identify the top
decile of high-intent users *before* they convert, and feed that
audience back into Google Ads as offline conversions. The bidder
now trains on an order of magnitude more signal events with the
same predictive value, and previously starved keywords clear the
optimization threshold for the first time.

```
   GA4 / GA360 export (BigQuery)
              │
              ▼
   Funnel-weighted scoring SQL ──── 0-100 propensity score
              │
              ▼
   Decile rank → activation tier
              │
              ▼
   TypeScript pipeline ── transform ──▶ Google Ads OCI CSV
              │                                 │
              │                                 ▼
              │                       Smart Bidding sees a
              │                       denser training signal
              │                                 │
              └──── tomorrow's GA sessions ◀────┘
```

## Tech Stack

- **▸ BigQuery** - the system of record for scoring and validation
- **▸ TypeScript 5 (strict)** - pipeline code, fully typed end-to-end
- **▸ Node 20** - Cloud Run target runtime
- **▸ Jest** - unit tests for the transformer and CSV writer
- **▸ Google Ads Offline Conversion Import** - the activation surface
- **▸ Cloud Scheduler + Cloud Run** - daily orchestration in production
- **▸ GitHub Actions** - lint, typecheck, test on every PR

## Repository Structure

```
.
├── README.md                      # You are here
├── LICENSE                        # MIT
├── CONTRIBUTING.md                # Workflow and conventions
├── .github/workflows/ci.yml       # Lint, typecheck, test on PRs
├── docs/
│   ├── 01-technical-summary.md    # One-page hiring-manager brief
│   ├── 02-architecture.md         # Mermaid diagram + stage detail
│   ├── 03-methodology.md          # Statistical rationale
│   ├── 04-business-impact.md      # KPI tables and projections
│   └── 05-deployment-guide.md     # GCP setup and runbook
├── sql/
│   ├── 01_lead_scoring.sql        # Funnel-weighted propensity score
│   ├── 02_validation.sql          # Decile-vs-purchase holdout test
│   ├── 03_export_for_oci.sql      # Tier 1 OCI-shaped export
│   └── 04_baseline_metrics.sql    # Pre-implementation KPI snapshot
├── scripts/
│   ├── package.json               # Node 20, TS 5, Jest, ESLint
│   ├── tsconfig.json              # tsc --strict
│   ├── src/
│   │   ├── index.ts               # CLI entry point (--dry-run / --upload)
│   │   ├── config.ts              # Pipeline configuration
│   │   ├── types.ts               # Shared domain types
│   │   ├── lib/
│   │   │   ├── bigquery-client.ts     # BQ wrapper, mock-aware
│   │   │   ├── oci-transformer.ts     # Pure BQ→OCI transform
│   │   │   ├── google-ads-uploader.ts # Retry + backoff uploader
│   │   │   └── csv-writer.ts          # RFC-4180 serializer
│   │   └── mocks/
│   │       └── high-intent-users.json # 20-row fixture across all tiers
│   └── tests/
│       └── oci-transformer.test.ts    # Jest suite
├── analysis/
│   ├── README.md
│   ├── before-after-model.md      # Financial model methodology
│   └── data/
│       ├── baseline-metrics.json  # Pre-implementation KPIs
│       └── projected-uplift.json  # Conservative-scenario projections
├── reports/                       # Generated CSVs land here
└── screenshots/                   # BigQuery and Ads UI captures
```

## Quick Start

```bash
git clone https://github.com/linneamoritznyc/bigquery-lead-scoring-sem.git
cd bigquery-lead-scoring-sem/scripts
npm install
npm run typecheck
npm test
npm run dev > ../reports/oci-export.csv
```

The dry-run path uses a bundled mock fixture and produces a real OCI
CSV without any GCP credentials. To run against a live BigQuery
project, see [`docs/05-deployment-guide.md`](./docs/05-deployment-guide.md).

## Documentation

| Document                                                      | Read this if you want...                                  |
| ------------------------------------------------------------- | --------------------------------------------------------- |
| [Technical Summary](./docs/01-technical-summary.md)           | The 60-second elevator pitch.                             |
| [Architecture](./docs/02-architecture.md)                     | The stage-by-stage data flow diagram.                     |
| [Methodology](./docs/03-methodology.md)                       | The statistical reasoning behind the scoring weights.     |
| [Business Impact](./docs/04-business-impact.md)               | The KPI tables and uplift projections.                    |
| [Deployment Guide](./docs/05-deployment-guide.md)             | The GCP setup and operational runbook.                    |
| [Financial Model](./analysis/before-after-model.md)           | The before-after walk and the assumptions behind it.      |
| [Pipeline Module Map](./scripts/README.md)                    | Where each TypeScript module lives and what it does.      |
| [SQL Conventions](./sql/README.md)                            | How the SQL files are organized and run.                  |

## Business Impact

Numbers below come from running the SQL pipeline against the GA
Merchandise Store dataset for April 2017. The Merchandise Store is
a US-based account and the source currency is USD; the SEK column
is a presentation-layer conversion at 10.5 SEK / USD for the
Stockholm-based reader. Conservative-scenario projections use
industry-benchmark lower bounds. The full methodology, scenario
modeling, and sensitivity analysis live in
[`docs/04-business-impact.md`](./docs/04-business-impact.md) and
[`analysis/before-after-model.md`](./analysis/before-after-model.md).

| Metric                            | Baseline (April 2017) | Conservative projection |
| --------------------------------- | --------------------: | ----------------------: |
| Total sessions                    | 67,126                | -                       |
| Total unique users                | 55,681                | -                       |
| Conversions                       | 959                   | +56 / month             |
| Conversion rate                   | 1.43 %                | +0.08pp (1.43% → 1.51%) |
| Average order value               | $165.58               | held constant           |
| Total revenue                     | $158,789              | +$9,272 / month         |
| Projected CPA reduction           | -                     | 20 %                    |
| Projected volume increase         | -                     | +5.8% (+56 conv on 959 baseline) |
| Incremental revenue (SEK / month) | -                     | **SEK 97,356**          |
| Annualized incremental revenue    | -                     | **SEK 1,168,272 (~1.17M)** |
| Payback period                    | -                     | **~2 weeks**            |

The 20 % CPA reduction figure is the median observed uplift from
Google's OCI case studies (verified on >100 e-commerce accounts).

**The headline.** The model identifies 5,644 Tier-1 high-intent
users who never converted in-window. Uploading them as offline
conversions multiplies Smart Bidding's training signal by **6.9x**
(from 959 to 6,603 events / month) without diluting predictive
value. That is the difference between "untrainable" and "trainable"
for the long tail of mid-funnel keywords.

## About the Author

**Linnea Moritz** - Fullstack Developer & Artist, based in Norsborg,
Stockholm. I build the kind of pipelines I want to inherit: typed,
tested, instrumented, and easy for the next engineer to read.

Background:
- **Minerva University** graduate (San Francisco, GPA 3.6, 1.8 percent acceptance rate).
- **Google Ads Quality Analyst** via Vaco (Sunnyvale 2018-2019; rotations through Seoul and Hyderabad).
- **YouTube Ads Trust & Safety** via Vaco (Feb-June 2022).
- **Clubhouse Trust & Safety** for the Scandinavian and US markets (Apr 2021-Jan 2022).
- Stack: TypeScript (Next.js 14, React 18, Node 20), Python, SQL, BigQuery, PostgreSQL, the Anthropic Claude API, the Google Ads API, the Shopify API.
- Languages: native Swedish and English; professional Norwegian and Danish; intermediate German and French; HSK 3 Mandarin.
- Artist: 39 exhibitions in 21 cities across 10 countries, including Art Basel Hong Kong 2023.

Links:
- Art portfolio: [linneamoritz.com](https://linneamoritz.com)
- Dev portfolio: [linneamoritzdev.vercel.app](https://linneamoritzdev.vercel.app)
- LinkedIn: [linkedin.com/in/linneamoritz](https://linkedin.com/in/linneamoritz)
- Email: [linnea.moritz@uni.minerva.edu](mailto:linnea.moritz@uni.minerva.edu)
- Phone: +46 76 116 61 09
