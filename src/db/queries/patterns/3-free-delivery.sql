-- DEAL PATTERNS: OFFERS ACCEPTED BY DELIVERY, BIG TICKETS VS SMALL
-- Question: does making delivery free get more yeses, and does it matter more on
-- a big ticket ($2,500 or more at the asking price)?
--
-- Columns:
--   ticket         big ($2,500 or more at the asking price) or smaller
--   delivery_on_offer  free (the rep waived the charge), charged, the basic tier
--                  (always free), or the customer took it home
--   offers         offers made (after the asking price)
--   accepted_pct   share the customer said yes to
--   note           "too few to trust" when a group has under 30 offers
--
-- Read it with care: a pattern, not proof. Reps may waive delivery for customers
-- who were already close to buying.
--
-- SQL ideas: GROUP BY two things at once (ticket size and delivery), so each
-- combination gets its own row. CASE turns the view's short codes into words.
SELECT CASE WHEN asking_cents >= 250000 THEN 'Big ($2,500+)' ELSE 'Under $2,500' END AS ticket,
       CASE delivery WHEN 'waived'  THEN 'Free (waived)'
                     WHEN 'charged' THEN 'Charged'
                     WHEN 'basic'   THEN 'Basic tier (always free)'
                     ELSE 'Took it home' END          AS delivery_on_offer,
       COUNT(*)                                       AS offers,
       ROUND(100.0 * SUM(accepted) / COUNT(*), 1)     AS accepted_pct,
       CASE WHEN COUNT(*) < 30 THEN 'too few to trust' END AS note
FROM offer_facts
WHERE step_no > 0
GROUP BY ticket, delivery_on_offer
ORDER BY ticket, accepted_pct DESC, delivery_on_offer;
