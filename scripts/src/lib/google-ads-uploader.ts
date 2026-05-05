/**
 * Google Ads Offline Conversion uploader.
 *
 * Production-shaped class with retry, exponential backoff, and
 * per-batch error accounting. The actual network call is mocked: the
 * portfolio repo deliberately does not depend on the Google Ads API
 * client library, because making a live conversion-upload call from
 * a public repo demo would be irresponsible.
 *
 * To go live, replace the body of `performUpload` with a call to
 * `customer.conversionUploads.uploadClickConversions(...)` from the
 * google-ads-api Node client and supply OAuth credentials through an
 * environment-driven config.
 */

import type { OciCsvRow, UploaderResult } from '../types';

export interface UploaderOptions {
  /** When true the uploader logs the payload and never opens a socket. */
  dryRun: boolean;
  /** Maximum retry attempts for transient failures. */
  maxRetries: number;
  /** Initial backoff in ms; doubled on each retry. */
  baseBackoffMs: number;
  /** Optional logger override; defaults to console. */
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export const DEFAULT_UPLOADER_OPTIONS: UploaderOptions = {
  dryRun: true,
  maxRetries: 3,
  baseBackoffMs: 500,
};

export class GoogleAdsUploader {
  private readonly options: UploaderOptions;
  private readonly logger: Pick<Console, 'info' | 'warn' | 'error'>;

  constructor(options: Partial<UploaderOptions> = {}) {
    this.options = { ...DEFAULT_UPLOADER_OPTIONS, ...options };
    this.logger = this.options.logger ?? console;
  }

  async upload(rows: readonly OciCsvRow[]): Promise<UploaderResult> {
    const start = Date.now();

    if (rows.length === 0) {
      return { uploaded: 0, skipped: 0, failed: 0, durationMs: 0 };
    }

    let attempt = 0;
    let lastError: unknown = null;

    while (attempt <= this.options.maxRetries) {
      try {
        const uploaded = await this.performUpload(rows);
        return {
          uploaded,
          skipped: 0,
          failed: 0,
          durationMs: Date.now() - start,
        };
      } catch (err) {
        lastError = err;
        attempt += 1;
        if (attempt > this.options.maxRetries) {
          break;
        }
        const delay = this.options.baseBackoffMs * 2 ** (attempt - 1);
        this.logger.warn(
          `[uploader] attempt ${attempt} failed, retrying in ${delay}ms: ${describeError(err)}`,
        );
        await sleep(delay);
      }
    }

    this.logger.error(`[uploader] giving up after ${attempt} attempts: ${describeError(lastError)}`);
    return {
      uploaded: 0,
      skipped: 0,
      failed: rows.length,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Mocked production call. In dry-run mode this resolves
   * synchronously after logging; in upload mode it would invoke the
   * Google Ads API. The throw-on-error contract is preserved so the
   * retry loop above can be exercised by tests.
   */
  private async performUpload(rows: readonly OciCsvRow[]): Promise<number> {
    if (this.options.dryRun) {
      this.logger.info(`[uploader] dry-run: would upload ${rows.length} OCI rows`);
      return rows.length;
    }
    throw new Error(
      'Live Google Ads upload is not wired in this portfolio build. ' +
        'Replace performUpload() with the google-ads-api client call.',
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
