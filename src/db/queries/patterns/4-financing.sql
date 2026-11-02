-- DEAL PATTERNS: CLOSE RATE BY FINANCING TERM
-- Question: do customers on financing buy more often, and does the term matter?
-- (Financing is on the ticket from the start, so this one counts customers, not
-- offers.)
--
-- Columns:
--   financing      the term on the ticket, or none
--   customers      recorded customers with that term
--   bought         how many of them bought
--   close_pct      bought ÷ customers
--   note           "too few to trust" when a group has under 30 customers
--
-- Read it with care: a pattern, not proof. Customers who ask about financing may
-- already be more serious about buying.
--
-- SQL ideas: step_no = 0 picks each customer's asking-price row from the view,
-- so every customer counts once. || joins text ('6' || ' months'). Terms of 36
-- months and longer are grouped together because each has only a few customers.
SELECT CASE WHEN financing_months IS NULL THEN 'None'
            WHEN financing_months < 36 THEN CAST(financing_months AS TEXT) || ' months'
            ELSE '36 months or more' END              AS financing,
       COUNT(*)                                       AS customers,
       SUM(bought)                                    AS bought,
       ROUND(100.0 * SUM(bought) / COUNT(*), 1)       AS close_pct,
       CASE WHEN COUNT(*) < 30 THEN 'too few to trust' END AS note
FROM offer_facts
WHERE step_no = 0
GROUP BY financing
ORDER BY MIN(COALESCE(financing_months, 0));
