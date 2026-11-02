-- DEAL PATTERNS: COMMISSION GIVEN UP TO DISCOUNTING
-- Question: how much commission does each rep give up by discounting, compared
-- with selling at the asking price?
--
-- Columns:
--   sales                  the rep's sales
--   commission_at_asking   what those sales would have paid at the asking price
--   commission             what they actually paid
--   given_up               the difference, in dollars
--   given_up_pct           given_up ÷ commission_at_asking
--   given_up_per_sale      given_up ÷ sales
--
-- Read it with care: some discounting wins sales that would otherwise walk, so
-- not all of this is lost money. It shows who discounts deepest, not who's wrong.
--
-- SQL ideas: every sale's asking-price row (step 0) already holds the commission
-- the engine worked out at that price, so this is one JOIN and a subtraction;
-- the math stays in the engine, not the query.
SELECT r.name                                                      AS rep,
       COUNT(*)                                                    AS sales,
       ROUND(SUM(a.commission_cents) / 100.0, 2)                   AS commission_at_asking,
       ROUND(SUM(d.commission_cents) / 100.0, 2)                   AS commission,
       ROUND(SUM(a.commission_cents - d.commission_cents) / 100.0, 2) AS given_up,
       ROUND(100.0 * SUM(a.commission_cents - d.commission_cents) / SUM(a.commission_cents), 1) AS given_up_pct,
       ROUND(SUM(a.commission_cents - d.commission_cents) / 100.0 / COUNT(*), 2) AS given_up_per_sale
FROM deals d
JOIN offers a ON a.visit_id = d.visit_id AND a.step_no = 0
JOIN reps r   ON r.id = d.rep_id
GROUP BY r.name
ORDER BY given_up_pct DESC, rep;
