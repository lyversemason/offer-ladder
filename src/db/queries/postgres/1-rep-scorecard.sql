-- REP SCORECARD BY MONTH
-- (Postgres version of src/db/queries/1-rep-scorecard.sql.)
-- Postgres differences: dates are real dates, so to_char(date, 'YYYY-MM') gives the month
--   (SQLite cuts it out of the text with substr); attach is true/false, so a CASE
--   turns it into 1 or 0 to add up.
-- Question: how did each rep do each month? The same numbers as a rep's
-- commission tracker: customers helped, sales, conversion, sales dollars,
-- average order, margin, adjustable-base attach rate, commission and comp %.
--
-- Columns:
--   ups              customers the rep recorded in the app that month (a sale or a
--                    walk-out; the store's own count of everyone is the traffic table)
--   orders           how many of them bought
--   conversion_pct   orders ÷ ups
--   topline          what customers paid, in dollars (pre-tax)
--   avg_order        topline ÷ orders (average order value)
--   margin_pct       total gross profit ÷ total topline (weighted: big sales count more)
--   base_attach_pct  share of orders that included an adjustable base
--   commission       commission earned, in dollars
--   comp_pct         commission ÷ topline: what the rep earned per sales dollar
--
-- SQL ideas: two named steps (CTEs) that each GROUP BY rep and month, then a
-- LEFT JOIN so a month with ups but no sales still shows up (with 0 orders).
WITH ups_by_month AS (
  SELECT rep_id,
         to_char(visited_on, 'YYYY-MM') AS month,  -- the date 2026-04-17 → '2026-04'
         COUNT(*)                 AS ups
  FROM visits
  GROUP BY rep_id, month
),
sales_by_month AS (
  SELECT rep_id,
         to_char(closed_on, 'YYYY-MM') AS month,
         COUNT(*)                AS orders,
         SUM(topline_cents)      AS topline_cents,
         SUM(gross_cents)        AS gross_cents,
         SUM(CASE WHEN attach THEN 1 ELSE 0 END) AS base_orders,
         SUM(commission_cents)   AS commission_cents
  FROM deals
  GROUP BY rep_id, month
)
SELECT u.month,
       r.name                                                  AS rep,
       u.ups,
       COALESCE(s.orders, 0)                                   AS orders,
       ROUND(100.0 * COALESCE(s.orders, 0) / u.ups, 1)         AS conversion_pct,
       ROUND(COALESCE(s.topline_cents, 0) / 100.0, 2)          AS topline,
       ROUND(s.topline_cents / 100.0 / s.orders, 2)            AS avg_order,
       ROUND(100.0 * s.gross_cents / s.topline_cents, 1)       AS margin_pct,
       ROUND(100.0 * s.base_orders / s.orders, 1)              AS base_attach_pct,
       ROUND(COALESCE(s.commission_cents, 0) / 100.0, 2)       AS commission,
       ROUND(100.0 * s.commission_cents / s.topline_cents, 2)  AS comp_pct
FROM ups_by_month u
JOIN reps r ON r.id = u.rep_id
LEFT JOIN sales_by_month s ON s.rep_id = u.rep_id AND s.month = u.month
ORDER BY u.month, r.name;
