/**
 * Domain types shared across the pipeline.
 *
 * The shapes mirror the BigQuery output schema on one side and the
 * Google Ads Offline Conversion Import column contract on the other.
 * Keeping them strongly typed lets the transformer act as the single
 * boundary between the two systems.
 */

export type ActivationTier =
  | 'TIER_1_HIGH_INTENT'
  | 'TIER_2_WARM'
  | 'TIER_3_BROWSER'
  | 'TIER_4_LOW_SIGNAL';

/**
 * Row shape produced by sql/01_lead_scoring.sql, parsed into TS.
 * Numeric fields arrive as `number` because the BigQuery client
 * library coerces FLOAT64 to JS `number`. INT64 columns that exceed
 * MAX_SAFE_INTEGER would arrive as `string`, but no column in this
 * pipeline can reach that range.
 */
export interface ScoredUserRow {
  fullVisitorId: string;
  session_count: number;
  total_pageviews: number;
  total_minutes_on_site: number;
  unique_products_viewed: number;
  product_detail_views: number;
  add_to_cart_events: number;
  checkout_initiations: number;
  raw_score: number;
  propensity_score: number;
  score_decile: number;
  activation_tier: ActivationTier;
  /**
   * UNIX seconds of the user's most recent visit. Required so the OCI
   * conversion_time column can be set to a real moment that already
   * occurred - Google Ads rejects future-dated conversions.
   */
  last_visit_unixts: number;
}

/**
 * One row of the Google Ads Offline Conversion Import CSV.
 *
 * Column names match the official OCI schema. The pipeline targets
 * the conversion-action variant keyed by Google Click ID. In a live
 * deployment, gclid would be joined onto the BigQuery output through
 * the GA4 BigQuery export's `event_params.gclid` field; for this
 * portfolio build we surface it as a synthetic identifier instead.
 */
export interface OciCsvRow {
  'Google Click ID': string;
  'Conversion Name': string;
  'Conversion Time': string;
  'Conversion Value': string;
  'Conversion Currency': string;
}

export interface UploaderResult {
  uploaded: number;
  skipped: number;
  failed: number;
  durationMs: number;
}

export interface PipelineConfig {
  mode: 'dry-run' | 'upload';
  conversionName: string;
  conversionCurrency: string;
  /** Multiplier applied to propensity_score to derive a synthetic value. */
  conversionValueMultiplier: number;
  /** Tier filter; only rows at or above this tier are exported. */
  minimumTier: ActivationTier;
}
