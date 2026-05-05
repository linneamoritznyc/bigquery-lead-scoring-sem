-- =============================================================================
-- BigQuery-driven Lead Scoring for Predictive SEM Bidding
-- Dataset:  bigquery-public-data.google_analytics_sample (GA360, Aug'16-Aug'17)
-- Author:   Linnea Moritz | Target: Media Solutions Engineer, Precis Digital
-- -----------------------------------------------------------------------------
-- Objective: For every fullVisitorId, compute a 0-100 propensity score that
-- predicts purchase intent BEFORE conversion. Output is a tiered audience
-- ready for upload to Google Ads as Offline Conversions, densifying the
-- bidding signal so Smart Bidding can optimize earlier in the funnel.
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
    IFNULL(totals.bounces,      0) AS bounced,
    device.deviceCategory          AS device,
    trafficSource.source           AS source,
    trafficSource.medium           AS medium
  FROM `bigquery-public-data.google_analytics_sample.ga_sessions_*`
  WHERE _TABLE_SUFFIX BETWEEN '20170401' AND '20170430'
),

funnel_actions AS (
  SELECT
    fullVisitorId,
    visitId,
    COUNTIF(h.eCommerceAction.action_type = '2') AS product_detail_views,
    COUNTIF(h.eCommerceAction.action_type = '3') AS add_to_cart_events,
    COUNTIF(h.eCommerceAction.action_type = '5') AS checkout_initiations,
    COUNTIF(h.eCommerceAction.action_type = '6') AS completed_purchases
  FROM `bigquery-public-data.google_analytics_sample.ga_sessions_*`,
       UNNEST(hits) AS h
  WHERE _TABLE_SUFFIX BETWEEN '20170401' AND '20170430'
  GROUP BY fullVisitorId, visitId
),

product_breadth AS (
  SELECT
    fullVisitorId,
    COUNT(DISTINCT p.productSKU) AS unique_products_viewed
  FROM `bigquery-public-data.google_analytics_sample.ga_sessions_*`,
       UNNEST(hits) AS h,
       UNNEST(h.product) AS p
  WHERE _TABLE_SUFFIX BETWEEN '20170401' AND '20170430'
    AND h.eCommerceAction.action_type IN ('2','3','5')
  GROUP BY fullVisitorId
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
    SUM(IFNULL(f.completed_purchases,  0)) AS completed_purchases,
    SAFE_DIVIDE(SUM(s.bounced), COUNT(*))  AS bounce_rate,
    MAX(s.visitStartTime)                  AS last_visit_unixts
  FROM sessions_base s
  LEFT JOIN funnel_actions f USING (fullVisitorId, visitId)
  GROUP BY s.fullVisitorId
),

raw_scoring AS (
  SELECT
    u.fullVisitorId,
    u.session_count,
    u.total_pageviews,
    ROUND(u.total_time_on_site_sec / 60.0, 2)        AS total_minutes_on_site,
    IFNULL(p.unique_products_viewed, 0)              AS unique_products_viewed,
    u.product_detail_views,
    u.add_to_cart_events,
    u.checkout_initiations,
    u.completed_purchases,
    u.bounce_rate,
    (
        LEAST(u.product_detail_views, 20)              *  3.0
      + LEAST(u.add_to_cart_events,   10)              *  8.0
      + LEAST(u.checkout_initiations,  5)              * 15.0
      + LEAST(IFNULL(p.unique_products_viewed, 0), 15) *  2.0
      + LEAST(u.session_count, 8)                      *  4.0
      + LEAST(u.total_time_on_site_sec / 60.0, 30)     *  1.0
      - (u.bounce_rate * 5.0)
    ) AS raw_score
  FROM user_aggregates u
  LEFT JOIN product_breadth p USING (fullVisitorId)
  WHERE u.completed_purchases = 0
),

score_distribution AS (
  SELECT MIN(raw_score) AS min_score, MAX(raw_score) AS max_score
  FROM raw_scoring WHERE raw_score > 0
)

SELECT
  r.fullVisitorId,
  r.session_count,
  r.total_pageviews,
  r.total_minutes_on_site,
  r.unique_products_viewed,
  r.product_detail_views,
  r.add_to_cart_events,
  r.checkout_initiations,
  ROUND(r.raw_score, 2) AS raw_score,
  ROUND(
    100 * (r.raw_score - d.min_score) / NULLIF(d.max_score - d.min_score, 0),
    2
  ) AS propensity_score,
  NTILE(10) OVER (ORDER BY r.raw_score) AS score_decile,
  CASE
    WHEN NTILE(10) OVER (ORDER BY r.raw_score) >= 9 THEN 'TIER_1_HIGH_INTENT'
    WHEN NTILE(10) OVER (ORDER BY r.raw_score) >= 7 THEN 'TIER_2_WARM'
    WHEN NTILE(10) OVER (ORDER BY r.raw_score) >= 4 THEN 'TIER_3_BROWSER'
    ELSE                                                  'TIER_4_LOW_SIGNAL'
  END AS activation_tier
FROM raw_scoring r
CROSS JOIN score_distribution d
WHERE r.raw_score > 0
ORDER BY propensity_score DESC
LIMIT 1000;
