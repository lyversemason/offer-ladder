-- USAGE: COVERAGE BY REP AND MONTH
-- Question: of the customers each rep helped, how many did they use the app with?
-- "9 of 11 customers" says more than "signed in 4 times."
--
-- Columns:
--   customers      customers the store counted for the rep (from outside the app)
--   tickets        customers the rep started a ticket for
--   coverage_pct   tickets ÷ customers
--   no_ticket      customers helped without the app: customers − tickets
--
-- SQL ideas: the same "two counts, then JOIN" pattern as the company report,
-- grouped by rep and month. Sorted by rep, so one rep's months sit together
-- and a trend (a new hire using it more each month) is easy to see.
WITH store_count AS (
  SELECT rep_id,
         substr(day, 1, 7) AS month,
         SUM(ups)          AS customers
  FROM traffic
  GROUP BY rep_id, month
),
tickets AS (
  SELECT rep_id,
         substr(at, 1, 7) AS month,
         COUNT(*)         AS tickets
  FROM events
  WHERE type = 'ticket_started'
  GROUP BY rep_id, month
)
SELECT r.name                                   AS rep,
       s.month,
       s.customers,
       COALESCE(t.tickets, 0)                   AS tickets,
       ROUND(100.0 * COALESCE(t.tickets, 0) / s.customers, 1) AS coverage_pct,
       s.customers - COALESCE(t.tickets, 0)     AS no_ticket
FROM store_count s
JOIN reps r ON r.id = s.rep_id
LEFT JOIN tickets t ON t.rep_id = s.rep_id AND t.month = s.month
WHERE s.customers > 0
ORDER BY r.name, s.month;
