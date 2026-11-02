-- STORE COMPARISON
-- (Postgres version of src/db/queries/2-store-comparison.sql.)
-- Postgres differences: attach is true/false, so a CASE turns it into 1 or 0 to add up.
-- Question: how do the two stores compare over the whole period?
--
-- Columns:
--   store, reps                 the store and how many reps sold there
--   ups, orders, conversion_pct customers helped, sales, and orders ÷ ups
--   topline, avg_order          sales dollars and average order value
--   margin_pct                  total gross ÷ total topline
--   base_attach_pct             share of orders with an adjustable base
--   commission, comp_pct        commission paid, and commission ÷ topline
--
-- SQL ideas: the same "count ups, sum sales, then JOIN" pattern as the
-- scorecard, grouped by store instead of rep and month. COUNT(DISTINCT ...)
-- counts each rep once no matter how many sales they made.
WITH ups_by_store AS (
  SELECT store_id, COUNT(*) AS ups
  FROM visits
  GROUP BY store_id
),
sales_by_store AS (
  SELECT store_id,
         COUNT(DISTINCT rep_id) AS reps,
         COUNT(*)               AS orders,
         SUM(topline_cents)     AS topline_cents,
         SUM(gross_cents)       AS gross_cents,
         SUM(CASE WHEN attach THEN 1 ELSE 0 END) AS base_orders,
         SUM(commission_cents)  AS commission_cents
  FROM deals
  GROUP BY store_id
)
SELECT st.name                                                 AS store,
       s.reps,
       u.ups,
       s.orders,
       ROUND(100.0 * s.orders / u.ups, 1)                      AS conversion_pct,
       ROUND(s.topline_cents / 100.0, 2)                       AS topline,
       ROUND(s.topline_cents / 100.0 / s.orders, 2)            AS avg_order,
       ROUND(100.0 * s.gross_cents / s.topline_cents, 1)       AS margin_pct,
       ROUND(100.0 * s.base_orders / s.orders, 1)              AS base_attach_pct,
       ROUND(s.commission_cents / 100.0, 2)                    AS commission,
       ROUND(100.0 * s.commission_cents / s.topline_cents, 2)  AS comp_pct
FROM stores st
JOIN ups_by_store u   ON u.store_id = st.id
JOIN sales_by_store s ON s.store_id = st.id
ORDER BY topline DESC;
