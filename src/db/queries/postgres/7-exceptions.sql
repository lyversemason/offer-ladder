-- EXCEPTIONS: SALES UNDER THE EXCEPTIONS MARGIN
-- (Postgres version of src/db/queries/7-exceptions.sql.)
-- Postgres differences: the rule set is JSONB, read with ->> and turned into a number with
--   ::int (SQLite uses json_extract).
-- Question: who gives the most margin away? Any sale that makes money is
-- allowed, but the manager wants to see sales under the exceptions margin (20% in
-- the demo rules). Per rep: sales that closed in the low tier, and sales that
-- closed under the exceptions margin.
--
-- Columns:
--   orders              the rep's sales
--   low_tier_sales      sales that closed in the low tier
--   low_tier_pct        low_tier_sales ÷ orders
--   under_margin_sales   sales that closed under the exceptions margin
--   under_margin_pct     under_margin_sales ÷ orders
--   last_under_margin    the most recent date of one of those sales
--
-- SQL ideas: the first CTE reads the exceptions margin from the newest saved
-- rule set (->> pulls one value out of the JSON, as text, and ::int makes it a number), so the report follows
-- the manager's rules instead of a number typed into the query. CROSS JOIN puts
-- that one value next to every sale. CASE inside SUM counts only the matching
-- rows. LEFT JOIN keeps reps with no sales (COALESCE turns their empty counts
-- into 0).
WITH rules AS (
  SELECT (settings_json ->> 'exceptionMarginBp')::int AS exception_bp
  FROM settings_history
  ORDER BY id DESC
  LIMIT 1
),
per_rep AS (
  SELECT d.rep_id,
         COUNT(*)                                                     AS orders,
         SUM(CASE WHEN d.tier_id = 'low' THEN 1 ELSE 0 END)           AS low_tier_sales,
         SUM(CASE WHEN d.margin_bp < rules.exception_bp THEN 1 ELSE 0 END) AS under_margin_sales,
         MAX(CASE WHEN d.margin_bp < rules.exception_bp THEN d.closed_on END) AS last_under_margin
  FROM deals d
  CROSS JOIN rules
  GROUP BY d.rep_id
)
SELECT r.name                                                  AS rep,
       COALESCE(p.orders, 0)                                   AS orders,
       COALESCE(p.low_tier_sales, 0)                           AS low_tier_sales,
       ROUND(100.0 * p.low_tier_sales / p.orders, 1)           AS low_tier_pct,
       COALESCE(p.under_margin_sales, 0)                        AS under_margin_sales,
       ROUND(100.0 * p.under_margin_sales / p.orders, 1)        AS under_margin_pct,
       p.last_under_margin
FROM reps r
LEFT JOIN per_rep p ON p.rep_id = r.id
ORDER BY under_margin_sales DESC, low_tier_pct DESC;
