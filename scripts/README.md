# Pipeline Scripts

TypeScript pipeline that consumes the BigQuery scoring output and
emits a Google Ads Offline Conversion Import (OCI) CSV upload. Runs
end-to-end against a bundled mock fixture, so a fresh clone produces
real CSV output without any GCP credentials.

## Table of Contents

- [Quick Start](#quick-start)
- [Modes](#modes)
- [Module Map](#module-map)
- [Testing](#testing)
- [Going Live](#going-live)

## Quick Start

```bash
cd scripts
npm install
npm run typecheck
npm test
npm run dev          # dry-run, prints CSV to stdout
```

Output goes to stdout; status counters go to stderr. Pipe to a file
when capturing the CSV:

```bash
npm run dev > ../reports/oci-export.csv
```

## Modes

| Flag         | Behavior                                                                 |
| ------------ | ------------------------------------------------------------------------ |
| `--dry-run`  | Default. Reads the mock fixture, transforms, prints CSV to stdout.       |
| `--upload`   | Production path. Currently throws by design; wire up Google Ads API key. |

## Module Map

```
src/
  index.ts                Entry point and CLI flag handling
  config.ts               Default pipeline configuration
  types.ts                Shared domain types
  lib/
    bigquery-client.ts    BigQuery wrapper, mock-aware
    oci-transformer.ts    Pure transform from BQ row to OCI row
    google-ads-uploader.ts  Retry-aware uploader, mocked for portfolio
    csv-writer.ts         RFC-4180 CSV serializer
  mocks/
    high-intent-users.json  20 fixture rows in BQ output shape
tests/
  oci-transformer.test.ts   Jest suite for transform + CSV
```

## Testing

```bash
npm test                 # one-shot
npm run test:watch       # watch mode
```

The test suite covers empty input, timestamp formatting, CSV
escaping, tier filtering, malformed input, and batch error
accounting. CI runs the same command on every PR.

## Going Live

To turn this into a production pipeline:

1. Add `@google-cloud/bigquery` to `dependencies` and configure
   service account credentials via `GOOGLE_APPLICATION_CREDENTIALS`.
2. Replace `performUpload()` in `lib/google-ads-uploader.ts` with a
   call into the `google-ads-api` Node client.
3. Source `PipelineConfig` from environment variables and validate
   with `zod` or equivalent at startup.
4. Schedule the pipeline through Cloud Scheduler or GitHub Actions
   on a daily cadence (see `docs/05-deployment-guide.md`).
