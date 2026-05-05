-- =============================================================================
-- Lead Scoring Validation Queries
-- Purpose:        Sanity-check the output of sql/01_lead_scoring.sql before
--                 promoting any score to the Google Ads OCI export pipeline.
-- Input dataset:  bigquery-public-data.google_analytics_sample.ga_sessions_*
-- Output shape:   Three diagnostic result sets - top users, tier distribution,
--                 and decile-vs-purchase correlation. Run each block manually.
-- Assumptions:    The lead scoring CTE is reproduced inline so this file is
--                 self-contained. In production, materialize the scoring
--                 query into a table and JOIN against it instead.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Block 1: Top 10 users by propensity score.
-- Used as a smoke test - the highest-scoring users should look obviously
-- engaged when their session detail is inspected manually.
-- -----------------------------------------------------------------------------
WITH scored AS (
  -- For brevity in this validation file we re-use a slim variant of the
  -- scoring logic. In production this is a single SELECT against the
  -- materialized lead_scoring table.
  SELECT
    fullVisitorId,
    COUNT(DISTINCT visitId)                                   AS session_count,
    SUM(IFNULL(totals.pageviews, 0))                          AS total_pageviews,
    SUM(IFNULL(totals.timeOnSite, 0))                         AS time_on_site_sec,
    SUM(IFNULL(totals.transactions, 0))                       AS purchases
  FROM `bigquery-public-data.google_analytics_sample.ga_sessions_*`
  WHERE _TABLE_SUFFIX BETWEEN '20170401' AND '20170430'
  GROUP BY fullVisitorId
)
SELECT
  fullVisitorId,
  session_count,
  total_pageviews,
  ROUND(time_on_site_sec / 60.0, 1) AS minutes_on_site,
  purchases
FROM scored
WHERE purchases = 0
ORDER BY total_pageviews DESC, session_count DESC
LIMIT 10;

-- -----------------------------------------------------------------------------
-- Block 2: Distribution of users across activation tiers.
-- Sanity check: TIER_1_HIGH_INTENT should be ~10-20 percent of the scored
-- universe. A wildly skewed distribution signals a broken NTILE or filter.
-- -----------------------------------------------------------------------------
WITH funnel AS (
  SELECT
    fullVisitorId,
    SUM(IFNULL(totals.transactions, 0)) AS purchases,
    COUNTIF(h.eCommerceAction.action_type = '3') AS add_to_carts,
    COUNTIF(h.eCommerceAction.action_type = '5') AS checkouts
  FROM `bigquery-public-data.google_analytics_sample.ga_sessions_*`,
       UNNEST(hits) AS h
  WHERE _TABLE_SUFFIX BETWEEN '20170401' AND '20170430'
  GROUP BY fullVisitorId
),
tiered AS (
  SELECT
    fullVisitorId,
    NTILE(10) OVER (ORDER BY add_to_carts * 8 + checkouts * 15) AS decile
  FROM funnel
  WHERE purchases = 0
)
SELECT
  CASE
    WHEN decile >= 9 THEN 'TIER_1_HIGH_INTENT'
    WHEN decile >= 7 THEN 'TIER_2_WARM'
    WHEN decile >= 4 THEN 'TIER_3_BROWSER'
    ELSE                  'TIER_4_LOW_SIGNAL'
  END AS activation_tier,
  COUNT(*) AS user_count,
  ROUND(100 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS share_pct
FROM tiered
GROUP BY activation_tier
ORDER BY activation_tier;

-- -----------------------------------------------------------------------------
-- Block 3: Decile vs eventual purchase correlation.
-- Validates that higher score deciles correspond to higher purchase rates in
-- a held-out forward-looking window. If TIER_1 does not show a measurable lift
-- over TIER_4, the model has no predictive signal and should not be deployed.
--
-- Methodology: Score on April 1 - April 20, then measure purchase behavior
-- in the April 21 - April 30 holdout window for the same fullVisitorIds.
-- -----------------------------------------------------------------------------
WITH scoring_window AS (
  SELECT
    fullVisitorId,
    NTILE(10) OVER (
      ORDER BY
          COUNTIF(h.eCommerceAction.action_type = '3') * 8.0
        + COUNTIF(h.eCommerceAction.action_type = '5') * 15.0
    ) AS decile
  FROM `bigquery-public-data.google_analytics_sample.ga_sessions_*`,
       UNNEST(hits) AS h
  WHERE _TABLE_SUFFIX BETWEEN '20170401' AND '20170420'
  GROUP BY fullVisitorId
),
holdout_purchases AS (
  SELECT
    fullVisitorId,
    SUM(IFNULL(totals.transactions, 0)) AS holdout_purchases
  FROM `bigquery-public-data.google_analytics_sample.ga_sessions_*`
  WHERE _TABLE_SUFFIX BETWEEN '20170421' AND '20170430'
  GROUP BY fullVisitorId
)
SELECT
  s.decile,
  COUNT(*)                                                   AS scored_users,
  COUNTIF(IFNULL(h.holdout_purchases, 0) > 0)                AS converters,
  ROUND(
    100 * SAFE_DIVIDE(
      COUNTIF(IFNULL(h.holdout_purchases, 0) > 0),
      COUNT(*)
    ),
    3
  ) AS holdout_conversion_rate_pct
FROM scoring_window s
LEFT JOIN holdout_purchases h USING (fullVisitorId)
GROUP BY s.decile
ORDER BY s.decile DESC;
