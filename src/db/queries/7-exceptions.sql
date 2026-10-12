-- EXCEPTIONS: UNDER THE FINAL OFFER
-- Question: who gives the most margin away? Any sale that makes money is
-- allowed, but the offer ladder stops at the store's final-offer margin (20% in
-- the demo rules). Per rep: sales that closed in the low tier, and sales that
-- closed under the final-offer margin.
--
-- Columns:
--   orders              the rep's sales
--   low_tier_sales      sales that closed in the low tier
--   low_tier_pct        low_tier_sales ÷ orders
--   under_final_sales   sales that closed under the final-offer margin
--   under_final_pct     under_final_sales ÷ orders
--   last_under_final    the most recent date of one of those sales
--
-- SQL ideas: the first CTE reads the final-offer margin from the newest saved
-- rule set (json_extract pulls one value out of JSON text), so the report follows
-- the manager's rules instead of a number typed into the query. CROSS JOIN puts
-- that one value next to every sale. CASE inside SUM counts only the matching
-- rows. LEFT JOIN keeps reps with no sales (COALESCE turns their empty counts
-- into 0).
WITH rules AS (
  SELECT json_extract(settings_json, '$.finalOfferMarginBp') AS final_bp
  FROM settings_history
  ORDER BY id DESC
  LIMIT 1
),
per_rep AS (
  SELECT d.rep_id,
         COUNT(*)                                                     AS orders,
         SUM(CASE WHEN d.tier_id = 'low' THEN 1 ELSE 0 END)           AS low_tier_sales,
         SUM(CASE WHEN d.margin_bp < rules.final_bp THEN 1 ELSE 0 END) AS under_final_sales,
         MAX(CASE WHEN d.margin_bp < rules.final_bp THEN d.closed_on END) AS last_under_final
  FROM deals d
  CROSS JOIN rules
  GROUP BY d.rep_id
)
SELECT r.name                                                  AS rep,
       COALESCE(p.orders, 0)                                   AS orders,
       COALESCE(p.low_tier_sales, 0)                           AS low_tier_sales,
       ROUND(100.0 * p.low_tier_sales / p.orders, 1)           AS low_tier_pct,
       COALESCE(p.under_final_sales, 0)                        AS under_final_sales,
       ROUND(100.0 * p.under_final_sales / p.orders, 1)        AS under_final_pct,
       p.last_under_final
FROM reps r
LEFT JOIN per_rep p ON p.rep_id = r.id
ORDER BY under_final_sales DESC, low_tier_pct DESC;
