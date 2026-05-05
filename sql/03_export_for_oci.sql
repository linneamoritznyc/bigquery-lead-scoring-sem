-- =============================================================================
-- Offline Conversion Import (OCI) Export
-- Purpose:        Produce a slim, OCI-ready result set for the Tier 1 high-
--                 intent audience. The TypeScript pipeline reads this output
--                 and transforms it into a Google Ads OCI CSV upload.
-- Input dataset:  bigquery-public-data.google_analytics_sample.ga_sessions_*
-- Output shape:   (fullVisitorId STRING, propensity_score FLOAT64,
--                  last_visit_timestamp TIMESTAMP, activation_tier STRING)
-- Assumptions:    1. Only TIER_1_HIGH_INTENT users are exported. Lower tiers
--                    create noise that hurts Smart Bidding rather than helping.
--                 2. last_visit_timestamp is converted from GA's UNIX seconds
--                    into a TIMESTAMP for the OCI conversion_time column.
--                 3. fullVisitorId is the GA client identifier; in production
--                    this must be joined to a hashed CRM identifier (gclid or
--                    user-provided email/phone) before upload.
-- =============================================================================

WITH
sessions_base AS (
  SELECT
    fullVisitorId,
    visitId,
    visitStartTime,
    IFNULL(totals.pageviews,    0) AS pageviews,
    IFNULL(totals.timeOnSite,   0) AS time_on_site_sec,
    IFNULL(totals.transactions, 0) AS transactions,
    IFNULL(totals.bounces,      0) AS bounced
  FROM `bigquery-public-data.google_analytics_sample.ga_sessions_*`
  WHERE _TABLE_SUFFIX BETWEEN '20170401' AND '20170430'
),

funnel_actions AS (
  SELECT
    fullVisitorId,
    visitId,
    COUNTIF(h.eCommerceAction.action_type = '2') AS product_detail_views,
    COUNTIF(h.eCommerceAction.action_type = '3') AS add_to_cart_events,
    COUNTIF(h.eCommerceAction.action_type = '5') AS checkout_initiations
  FROM `bigquery-public-data.google_analytics_sample.ga_sessions_*`,
       UNNEST(hits) AS h
  WHERE _TABLE_SUFFIX BETWEEN '20170401' AND '20170430'
  GROUP BY fullVisitorId, visitId
),

user_aggregates AS (
  SELECT
    s.fullVisitorId,
    COUNT(DISTINCT s.visitId)              AS session_count,
    SUM(s.pageviews)                       AS total_pageviews,
    SUM(s.time_on_site_sec)                AS total_time_on_site_sec,
    SUM(s.transactions)                    AS total_transactions,
    SUM(IFNULL(f.product_detail_views, 0)) AS product_detail_views,
    SUM(IFNULL(f.add_to_cart_events,   0)) AS add_to_cart_events,
    SUM(IFNULL(f.checkout_initiations, 0)) AS checkout_initiations,
    SAFE_DIVIDE(SUM(s.bounced), COUNT(*))  AS bounce_rate,
    MAX(s.visitStartTime)                  AS last_visit_unixts
  FROM sessions_base s
  LEFT JOIN funnel_actions f USING (fullVisitorId, visitId)
  GROUP BY s.fullVisitorId
),

raw_scoring AS (
  SELECT
    fullVisitorId,
    last_visit_unixts,
    (
        LEAST(product_detail_views, 20)         *  3.0
      + LEAST(add_to_cart_events,   10)         *  8.0
      + LEAST(checkout_initiations,  5)         * 15.0
      + LEAST(session_count, 8)                 *  4.0
      + LEAST(total_time_on_site_sec / 60.0, 30)*  1.0
      - (bounce_rate * 5.0)
    ) AS raw_score
  FROM user_aggregates
  WHERE total_transactions = 0
),

bounds AS (
  SELECT MIN(raw_score) AS min_score, MAX(raw_score) AS max_score
  FROM raw_scoring
  WHERE raw_score > 0
),

scored AS (
  SELECT
    r.fullVisitorId,
    TIMESTAMP_SECONDS(r.last_visit_unixts) AS last_visit_timestamp,
    ROUND(
      100 * (r.raw_score - b.min_score) / NULLIF(b.max_score - b.min_score, 0),
      2
    ) AS propensity_score,
    NTILE(10) OVER (ORDER BY r.raw_score) AS score_decile
  FROM raw_scoring r
  CROSS JOIN bounds b
  WHERE r.raw_score > 0
)

SELECT
  fullVisitorId,
  propensity_score,
  last_visit_timestamp,
  'TIER_1_HIGH_INTENT' AS activation_tier
FROM scored
WHERE score_decile >= 9
ORDER BY propensity_score DESC;
