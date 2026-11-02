-- DEAL PATTERNS: OFFERS ACCEPTED BY HOW MUCH CAME OFF THE BASE
-- Question: on tickets with an adjustable base the rep can discount, does taking
-- more off the base get more yeses? And is there a point where more stops helping?
--
-- Columns:
--   off_the_base   the share taken off the base on that offer
--   offers         offers made (after the asking price) on tickets with a base
--   accepted       offers the customer said yes to
--   accepted_pct   accepted ÷ offers
--   note           "too few to trust" when a group has under 30 offers
--
-- Read it with care: a pattern, not proof. If two bands close at the same rate,
-- the deeper one gives up commission for no extra sales.
--
-- SQL ideas: the same shape as the discount-size report. WHERE base_cut_pct IS
-- NOT NULL keeps only offers with a discountable base (the view leaves it empty
-- when there isn't one).
SELECT CASE WHEN base_cut_pct < 15 THEN 'Under 15% (or none)'
            WHEN base_cut_pct < 35 THEN '15–35%'
            ELSE '35% or more' END                    AS off_the_base,
       COUNT(*)                                       AS offers,
       SUM(accepted)                                  AS accepted,
       ROUND(100.0 * SUM(accepted) / COUNT(*), 1)     AS accepted_pct,
       CASE WHEN COUNT(*) < 30 THEN 'too few to trust' END AS note
FROM offer_facts
WHERE step_no > 0 AND base_cut_pct IS NOT NULL
GROUP BY off_the_base
ORDER BY MIN(base_cut_pct);
