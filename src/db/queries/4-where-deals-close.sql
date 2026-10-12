-- WHERE DEALS CLOSE ON THE LADDER
-- Question: at which offer do customers say yes, and what does each step down
-- cost? Rung 0 is the asking price, rung 1 the first offer, and so on.
--
-- Columns:
--   closed_at_rung    0 = asking price, 1 = first offer, ...
--   deals             how many sales closed there
--   share_pct         that rung's share of all sales
--   avg_price         average customer price
--   discount_pct      total discount ÷ total list price
--   avg_margin_pct    average margin
--   avg_commission    average commission per sale, in dollars
--
-- SQL ideas: GROUP BY the rung, then a window function: SUM(COUNT(*)) OVER ()
-- adds up the counts of ALL the groups, so each row can show its share of the
-- total without a second query.
SELECT closed_at_rung,
       COUNT(*)                                                  AS deals,
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1)        AS share_pct,
       ROUND(AVG(topline_cents) / 100.0, 2)                      AS avg_price,
       ROUND(100.0 * SUM(list_topline_cents - topline_cents) / SUM(list_topline_cents), 1)
                                                                 AS discount_pct,
       ROUND(AVG(margin_bp) / 100.0, 1)                          AS avg_margin_pct,
       ROUND(AVG(commission_cents) / 100.0, 2)                   AS avg_commission
FROM deals
GROUP BY closed_at_rung
ORDER BY closed_at_rung;
