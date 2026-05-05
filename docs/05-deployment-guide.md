# Deployment Guide

How to take the portfolio build and run it daily against a real
client account. Assumes familiarity with GCP and Google Ads.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [GCP Project Setup](#gcp-project-setup)
- [Service Account Configuration](#service-account-configuration)
- [Cloud Scheduler for Daily Runs](#cloud-scheduler-for-daily-runs)
- [GitHub Actions CI/CD](#github-actions-cicd)
- [Monitoring and Alerting](#monitoring-and-alerting)
- [Runbook](#runbook)

## Architecture Overview

```
[Cloud Scheduler] ──cron──▶ [Cloud Run Job] ──reads──▶ [BigQuery]
                                  │
                                  └──uploads──▶ [Google Ads OCI API]
                                  │
                                  └──logs──▶ [Cloud Logging]
                                                  │
                                                  ▼
                                       [Cloud Monitoring + Alerts]
```

The Cloud Run Job is the production analogue of `scripts/src/index.ts`
running with `--upload`. Cloud Scheduler triggers it at a fixed time
each day; Cloud Logging captures stdout and stderr; Cloud Monitoring
alerts on failure or anomalous output volume.

## GCP Project Setup

```bash
# 1. Create a dedicated project
gcloud projects create precis-lead-scoring-prod --name="Lead Scoring Prod"
gcloud config set project precis-lead-scoring-prod

# 2. Enable required APIs
gcloud services enable \
  bigquery.googleapis.com \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  logging.googleapis.com

# 3. Create the Artifact Registry repository
gcloud artifacts repositories create lead-scoring \
  --repository-format=docker \
  --location=europe-north1
```

Pick the GCP region closest to the client's BigQuery dataset.
`europe-north1` (Finland) is the default for Stockholm-based clients.

## Service Account Configuration

```bash
# Pipeline runner service account
gcloud iam service-accounts create lead-scoring-runner \
  --display-name="Lead Scoring Pipeline Runner"

# Grant only the roles the pipeline actually needs
gcloud projects add-iam-policy-binding precis-lead-scoring-prod \
  --member="serviceAccount:lead-scoring-runner@precis-lead-scoring-prod.iam.gserviceaccount.com" \
  --role="roles/bigquery.jobUser"

gcloud projects add-iam-policy-binding precis-lead-scoring-prod \
  --member="serviceAccount:lead-scoring-runner@precis-lead-scoring-prod.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataViewer"

gcloud projects add-iam-policy-binding precis-lead-scoring-prod \
  --member="serviceAccount:lead-scoring-runner@precis-lead-scoring-prod.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

Google Ads credentials (developer token, OAuth refresh token,
customer ID) live in Secret Manager, never in code. The pipeline
fetches them at startup and holds them in memory only.

## Cloud Scheduler for Daily Runs

```bash
# 1. Build and push the container
gcloud builds submit --tag europe-north1-docker.pkg.dev/precis-lead-scoring-prod/lead-scoring/pipeline:latest

# 2. Create the Cloud Run job (not service - this is one-shot)
gcloud run jobs create lead-scoring-daily \
  --image=europe-north1-docker.pkg.dev/precis-lead-scoring-prod/lead-scoring/pipeline:latest \
  --region=europe-north1 \
  --service-account=lead-scoring-runner@precis-lead-scoring-prod.iam.gserviceaccount.com \
  --set-env-vars=PIPELINE_MODE=upload \
  --max-retries=2 \
  --task-timeout=15m

# 3. Schedule it daily at 06:00 Europe/Stockholm
gcloud scheduler jobs create http lead-scoring-trigger \
  --location=europe-north1 \
  --schedule="0 6 * * *" \
  --time-zone="Europe/Stockholm" \
  --uri="https://europe-north1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/precis-lead-scoring-prod/jobs/lead-scoring-daily:run" \
  --http-method=POST \
  --oauth-service-account-email=lead-scoring-runner@precis-lead-scoring-prod.iam.gserviceaccount.com
```

Run at 06:00 local time. The previous day's GA export is reliably
available by then, and the upload lands well inside Google Ads' OCI
freshness window.

## GitHub Actions CI/CD

`.github/workflows/ci.yml` runs on every PR and on pushes to `main`.
A separate `deploy.yml` (out of scope for this case study) builds
and pushes the Docker image when a release tag is created.

CI checks:

1. `npm ci` - reproducible install.
2. `npm run lint` - ESLint with the strict TypeScript config.
3. `npm run typecheck` - `tsc --noEmit`.
4. `npm test` - Jest with coverage threshold at 80 percent.

Deployment checks (release branch only):

1. SQL files lint with `bq query --dry_run` against a sandbox dataset.
2. Container image scanned with Trivy.
3. Manual approval gate before promoting to prod.

## Monitoring and Alerting

| Signal                        | Alert when                                                    |
| ----------------------------- | ------------------------------------------------------------- |
| Pipeline run failure          | Cloud Run job exits non-zero. Page on-call immediately.       |
| Tier 1 row count anomaly      | Daily count outside 30 percent of trailing-7-day median.      |
| BigQuery query duration       | Over 5 minutes for `01_lead_scoring.sql`.                     |
| OCI upload failure rate       | Over 5 percent of rows fail in a single batch.                |
| Holdout decile correlation    | Top decile conversion rate drops below 3x bottom decile.      |

The last metric is the one that catches model drift. When it slips,
the Tier 1 audience has stopped being predictive and the upload
should be paused while the weights are reviewed.

## Runbook

**Symptom: Pipeline failed overnight.**
Check Cloud Logging for the run ID. Most failures are transient
BigQuery quota errors; rerun the Cloud Run job manually.

**Symptom: Tier 1 row count dropped suddenly.**
Inspect `_TABLE_SUFFIX` coverage. The GA export is occasionally
delayed, leaving the previous day's partition empty. Wait two hours
and rerun.

**Symptom: Smart Bidding performance degraded after deployment.**
Pause the OCI upload (disable the Cloud Scheduler job) and let
Smart Bidding revert to its prior signal mix. Investigate the
weight configuration before re-enabling.

**Symptom: Holdout correlation dropped below threshold.**
Treat as model drift. Pull the validation report, retune weights,
and re-deploy through the standard PR flow. Do not hot-fix in prod.
