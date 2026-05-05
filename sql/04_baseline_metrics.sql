-- =============================================================================
-- Baseline KPI Snapshot (Pre-Implementation)
-- Purpose:        Capture the "Before" benchmarks that anchor the business
--                 case in docs/04-business-impact.md. All projected uplift
--                 is expressed relative to these numbers.
-- Input dataset:  bigquery-public-data.google_analytics_sample.ga_sessions_*
-- Output shape:   A single row with seven KPIs, easily serialized to JSON
--                 and dropped into analysis/data/baseline-metrics.json.
-- Assumptions:    1. Window matches the scoring window in 01_lead_scoring.sql
--                    (April 2017) so baseline and uplift compare like-for-like.
--                 2. transactionRevenue is stored in micro-units; divide by 1e6
--                    to convert to whole-dollar revenue.
--                 3. AOV is computed only across sessions that include at
--                    least one transaction. Otherwise the denominator includes
--                    non-converting sessions and AOV becomes meaningless.
-- =============================================================================

WITH base AS (
  SELECT
    fullVisitorId,
    visitId,
    IFNULL(totals.transactions,        0)        AS transactions,
    IFNULL(totals.transactionRevenue,  0) / 1e6  AS revenue_usd,
    IFNULL(totals.timeOnSite,          0)        AS time_on_site_sec
  FROM `bigquery-public-data.google_analytics_sample.ga_sessions_*`
  WHERE _TABLE_SUFFIX BETWEEN '20170401' AND '20170430'
)

SELECT
  COUNT(*)                                          AS total_sessions,
  COUNT(DISTINCT fullVisitorId)                     AS total_users,
  SUM(transactions)                                 AS total_conversions,
  ROUND(
    100 * SAFE_DIVIDE(SUM(transactions), COUNT(*)),
    4
  )                                                 AS conversion_rate_pct,
  ROUND(
    SAFE_DIVIDE(SUM(revenue_usd), NULLIF(SUM(transactions), 0)),
    2
  )                                                 AS average_order_value_usd,
  ROUND(AVG(time_on_site_sec), 1)                   AS average_session_duration_sec,
  ROUND(SUM(revenue_usd), 2)                        AS total_revenue_usd
FROM base;
