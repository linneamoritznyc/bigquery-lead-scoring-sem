/**
 * Pipeline entry point.
 *
 * Reads scored users (mock fixture in dry-run, BigQuery in production),
 * filters and transforms them through the OCI transformer, and then
 * either prints the resulting CSV to stdout (dry-run) or hands the
 * batch to the Google Ads uploader (upload).
 *
 * Usage:
 *   ts-node src/index.ts --dry-run   # default; safe for portfolio demo
 *   ts-node src/index.ts --upload    # would push to Google Ads in prod
 */

import { configFromArgs } from './config';
import { BigQueryClient } from './lib/bigquery-client';
import { rowsToCsv } from './lib/csv-writer';
import { GoogleAdsUploader } from './lib/google-ads-uploader';
import { transformBatch } from './lib/oci-transformer';

async function main(): Promise<void> {
  const config = configFromArgs(process.argv.slice(2));
  const dryRun = config.mode === 'dry-run';

  const bq = new BigQueryClient({ dryRun });
  const scoredUsers = await bq.fetchHighIntentUsers();

  const { rows, skipped, failed } = transformBatch(scoredUsers, config);

  if (dryRun) {
    process.stdout.write(rowsToCsv(rows));
    process.stderr.write(
      `[pipeline] mode=dry-run input=${scoredUsers.length} ` +
        `transformed=${rows.length} skipped=${skipped} failed=${failed}\n`,
    );
    return;
  }

  const uploader = new GoogleAdsUploader({ dryRun: false });
  const result = await uploader.upload(rows);
  process.stderr.write(
    `[pipeline] mode=upload uploaded=${result.uploaded} ` +
      `skipped=${skipped} failed=${result.failed} durationMs=${result.durationMs}\n`,
  );
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write(`[pipeline] fatal: ${message}\n`);
  process.exit(1);
});
