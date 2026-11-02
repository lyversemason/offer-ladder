-- DEAL PATTERNS: WHAT CHANGED AFTER A "NO"
-- Question: when a customer turned down the first offer and the rep made another,
-- what was different about the last offer for the customers who then bought,
-- compared with those who still walked?
--
-- Columns:
--   outcome                 bought on a later offer, or walked anyway
--   customers               customers who said no to offer 1 and got at least one more
--   extra_discount_pts      how much deeper the last offer was than the first, in
--                           percentage points of the asking price
--   delivery_made_free_pct  share where delivery was charged on offer 1 and free on
--                           the last
--   more_off_base_pct       share where more came off the base on the last offer
--
-- Read it with care: a pattern, not proof. The last offer of a walk-out is the
-- last one the rep recorded; offers said but never recorded aren't here.
--
-- SQL ideas: two copies of the same view, "f" for each customer's first offer and
-- "l" for their last, joined on the customer. The "last" step comes from a small
-- named step that finds each customer's highest step number.
WITH last_step AS (
  SELECT visit_id, MAX(step_no) AS step_no
  FROM offer_facts
  GROUP BY visit_id
)
SELECT CASE WHEN l.bought = 1 THEN 'Bought on a later offer' ELSE 'Walked anyway' END AS outcome,
       COUNT(*)                                                      AS customers,
       ROUND(AVG(l.discount_pct - f.discount_pct), 1)                AS extra_discount_pts,
       ROUND(100.0 * SUM(CASE WHEN f.delivery = 'charged' AND l.delivery = 'waived' THEN 1 ELSE 0 END) / COUNT(*), 1)
                                                                     AS delivery_made_free_pct,
       ROUND(100.0 * SUM(CASE WHEN l.base_cut_pct > f.base_cut_pct THEN 1 ELSE 0 END) / COUNT(*), 1)
                                                                     AS more_off_base_pct
FROM offer_facts f
JOIN last_step s   ON s.visit_id = f.visit_id
JOIN offer_facts l ON l.visit_id = f.visit_id AND l.step_no = s.step_no
WHERE f.step_no = 1
  AND f.accepted = 0
  AND l.step_no > 1
GROUP BY outcome
ORDER BY outcome;
