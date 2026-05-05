/**
 * Pure transformation from BigQuery scored rows into Google Ads OCI rows.
 *
 * Why this layer exists, and why it matters commercially:
 *
 * The Offline Conversion Import contract is the seam where a generic
 * Smart Bidding setup becomes a proprietary, agency-owned optimization
 * loop. Every advertiser can buy the same Google Ads inventory and
 * use the same auction-time signals. The differentiator is the
 * *signal layer* fed into the auction.
 *
 * Once a client adopts a custom propensity score - trained on their
 * own behavioral data, transformed in the agency's pipeline, and
 * piped back into Google Ads as offline conversions - the bidding
 * model is conditioned on signals the client cannot reproduce by
 * switching agencies. The SQL, the weights, the validation
 * thresholds, and the tier definitions are institutional knowledge
 * that lives in the agency's repo, not in the ad account.
 *
 * That stickiness is the entire point of investing in this layer.
 * The transformer must therefore be pure, testable, and audit-friendly:
 * a hiring manager reading this file should be able to reproduce any
 * uploaded value from the source row by hand.
 */

import type {
  ActivationTier,
  OciCsvRow,
  PipelineConfig,
  ScoredUserRow,
} from '../types';

const TIER_RANK: Record<ActivationTier, number> = {
  TIER_4_LOW_SIGNAL: 1,
  TIER_3_BROWSER: 2,
  TIER_2_WARM: 3,
  TIER_1_HIGH_INTENT: 4,
};

export class TransformerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransformerError';
  }
}

/**
 * Format a UNIX seconds timestamp into the Google Ads OCI date-time
 * format: `YYYY-MM-DD HH:mm:ss+00:00`. UTC is used unconditionally
 * because the upstream BigQuery export normalizes timestamps and the
 * downstream Ads API does not require a local zone.
 */
export function formatOciTimestamp(unixSeconds: number): string {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) {
    throw new TransformerError(`Invalid last_visit_unixts: ${unixSeconds}`);
  }
  const d = new Date(unixSeconds * 1000);
  const pad = (n: number): string => n.toString().padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  const mm = pad(d.getUTCMonth() + 1);
  const dd = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mi = pad(d.getUTCMinutes());
  const ss = pad(d.getUTCSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}+00:00`;
}

/**
 * Returns true when the row's tier ranks at or above the configured
 * minimum tier. Lower tiers are dropped silently; the orchestrator is
 * responsible for tracking skip counts.
 */
export function passesTierFilter(row: ScoredUserRow, minimumTier: ActivationTier): boolean {
  const rowRank = TIER_RANK[row.activation_tier];
  const minRank = TIER_RANK[minimumTier];
  if (rowRank === undefined) {
    throw new TransformerError(`Unknown activation_tier: ${String(row.activation_tier)}`);
  }
  return rowRank >= minRank;
}

/**
 * Transform a single scored user into an OCI row. Throws on
 * malformed input. The caller is responsible for handling thrown
 * errors and routing the offending row to the dead-letter sink.
 */
export function transformRow(row: ScoredUserRow, config: PipelineConfig): OciCsvRow {
  validateRow(row);

  const conversionValue = (row.propensity_score * config.conversionValueMultiplier).toFixed(2);

  return {
    'Google Click ID': syntheticGclid(row.fullVisitorId),
    'Conversion Name': config.conversionName,
    'Conversion Time': formatOciTimestamp(row.last_visit_unixts),
    'Conversion Value': conversionValue,
    'Conversion Currency': config.conversionCurrency,
  };
}

/**
 * Transform an entire batch. Rows that fail the tier filter are
 * dropped. Rows that throw during transform are dropped and counted
 * - the upstream uploader logs and surfaces the count.
 */
export function transformBatch(
  rows: readonly ScoredUserRow[],
  config: PipelineConfig,
): { rows: OciCsvRow[]; skipped: number; failed: number } {
  const out: OciCsvRow[] = [];
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    if (!passesTierFilter(row, config.minimumTier)) {
      skipped += 1;
      continue;
    }
    try {
      out.push(transformRow(row, config));
    } catch {
      failed += 1;
    }
  }

  return { rows: out, skipped, failed };
}

function validateRow(row: ScoredUserRow): void {
  if (typeof row.fullVisitorId !== 'string' || row.fullVisitorId.length === 0) {
    throw new TransformerError('Missing or empty fullVisitorId');
  }
  if (typeof row.propensity_score !== 'number' || Number.isNaN(row.propensity_score)) {
    throw new TransformerError(`Invalid propensity_score for ${row.fullVisitorId}`);
  }
  if (row.propensity_score < 0 || row.propensity_score > 100) {
    throw new TransformerError(
      `propensity_score out of bounds for ${row.fullVisitorId}: ${row.propensity_score}`,
    );
  }
}

/**
 * In production the gclid is joined upstream from the GA4 export.
 * For a portfolio build with the public GA360 sample we synthesize
 * a deterministic identifier so the CSV shape is realistic. The
 * function is exported for tests.
 */
export function syntheticGclid(fullVisitorId: string): string {
  return `LEAD_SCORE_${fullVisitorId}`;
}
