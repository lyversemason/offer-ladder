-- TIER MIX BY REP
-- Question: how much of each rep's business lands in each commission tier,
-- and how many offers does it take them to close? A rep who discounts too
-- early shows a big "low" share.
--
-- Columns:
--   orders            sales in the period
--   top_pct           share of the rep's sales that closed in the top tier
--   middle_pct        ... in the middle tier
--   low_pct           ... in the low tier
--   avg_offers        average number of offers made after the asking price
--   discount_pct      total discount ÷ total list price
--
-- SQL ideas: CASE turns each sale into a 1 or a 0 for "was it in this tier?",
-- and SUM adds those up. That's a common way to turn rows into columns (a pivot).
SELECT r.name                                                               AS rep,
       COUNT(*)                                                             AS orders,
       ROUND(100.0 * SUM(CASE WHEN d.tier_id = 'top'    THEN 1 ELSE 0 END) / COUNT(*), 1) AS top_pct,
       ROUND(100.0 * SUM(CASE WHEN d.tier_id = 'middle' THEN 1 ELSE 0 END) / COUNT(*), 1) AS middle_pct,
       ROUND(100.0 * SUM(CASE WHEN d.tier_id = 'low'    THEN 1 ELSE 0 END) / COUNT(*), 1) AS low_pct,
       ROUND(AVG(d.offers_made), 2)                                         AS avg_offers,
       ROUND(100.0 * SUM(d.list_topline_cents - d.topline_cents) / SUM(d.list_topline_cents), 1)
                                                                            AS discount_pct
FROM deals d
JOIN reps r ON r.id = d.rep_id
GROUP BY r.id, r.name
ORDER BY low_pct DESC;
