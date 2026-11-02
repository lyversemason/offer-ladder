-- DEAL PATTERNS: OFFERS ACCEPTED BY DISCOUNT SIZE
-- Question: when a rep makes an offer, how often does the customer say yes,
-- depending on how far below the asking price it is?
--
-- Columns:
--   discount       how far below the asking price the offer was
--   offers         offers made at that depth (after the asking price)
--   accepted       offers the customer said yes to
--   accepted_pct   accepted ÷ offers
--   note           "too few to trust" when a group has under 30 offers
--
-- Read it with care: a pattern, not proof. Deeper offers come later in a
-- negotiation, to customers who already said no, so depth and timing are mixed up.
--
-- SQL ideas: reads the offer_facts view (one row per offer, see schema.sql), so
-- the query itself is one GROUP BY. CASE sorts each offer into a band; ORDER BY
-- MIN(discount_pct) puts the bands in order from smallest to deepest.
SELECT CASE WHEN discount_pct < 10 THEN 'Under 10%'
            WHEN discount_pct < 15 THEN '10–15%'
            WHEN discount_pct < 20 THEN '15–20%'
            WHEN discount_pct < 30 THEN '20–30%'
            ELSE '30% or more' END                    AS discount,
       COUNT(*)                                       AS offers,
       SUM(accepted)                                  AS accepted,
       ROUND(100.0 * SUM(accepted) / COUNT(*), 1)     AS accepted_pct,
       CASE WHEN COUNT(*) < 30 THEN 'too few to trust' END AS note
FROM offer_facts
WHERE step_no > 0
GROUP BY discount
ORDER BY MIN(discount_pct);
