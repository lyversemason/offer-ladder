-- ADJUSTABLE-BASE ATTACH RATE BY MONTH
-- (Postgres version of src/db/queries/5-attach-trend.sql.)
-- Postgres differences: to_char(date, 'YYYY-MM') gives the month; attach is true/false, so
--   a CASE turns it into 1 or 0 to add up.
-- Question: is the share of sales that include an adjustable base going up or
-- down? A base earns the rep a bonus on the whole sale, so managers watch it.
--
-- Columns:
--   month          '2026-04' etc.
--   orders         all sales that month
--   base_orders    sales with an adjustable base
--   attach_pct     base_orders ÷ orders
--   change_pts     attach_pct minus last month's, in percentage points
--
-- SQL ideas: a CTE for the monthly numbers, then LAG(), a window function that
-- reads a value from the row before (last month) so it can be subtracted.
WITH monthly AS (
  SELECT to_char(closed_on, 'YYYY-MM')              AS month,
         COUNT(*)                                   AS orders,
         SUM(CASE WHEN attach THEN 1 ELSE 0 END)    AS base_orders,
         ROUND(100.0 * SUM(CASE WHEN attach THEN 1 ELSE 0 END) / COUNT(*), 1) AS attach_pct
  FROM deals
  GROUP BY month
)
SELECT month,
       orders,
       base_orders,
       attach_pct,
       ROUND(attach_pct - LAG(attach_pct) OVER (ORDER BY month), 1) AS change_pts
FROM monthly
ORDER BY month;
