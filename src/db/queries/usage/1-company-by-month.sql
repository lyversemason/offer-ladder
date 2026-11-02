-- USAGE: THE COMPANY BY MONTH
-- Question: across both stores, how often do reps use the app with a customer,
-- how many reps use it at all, and how many tickets end with an outcome recorded?
--
-- Columns:
--   customers      customers the stores counted (the traffic table: the store's own
--                  count, which comes from outside the app)
--   tickets        customers a rep started a ticket for in the app
--   coverage_pct   tickets ÷ customers: how often reps use the app with a customer
--   reps_on_floor  reps who helped at least one customer that month
--   reps_using     reps who started at least one ticket that month
--   outcome_pct    tickets that ended with Bought or Walked recorded ÷ tickets
--   dropped_pct    tickets left without an outcome (the rep moved on) ÷ tickets
--
-- SQL ideas: two named steps, one from the store's count (traffic) and one from
-- the app's own log (events), each grouped by month, then a JOIN on the month.
-- CASE WHEN ... THEN 1 ELSE 0 END turns each event into a 1 or a 0, so SUM
-- counts one kind of event. Months without a store count (your own tickets
-- today) are left out, because coverage needs both numbers.
WITH store_count AS (
  SELECT substr(day, 1, 7)       AS month,          -- '2026-04-17' → '2026-04'
         SUM(ups)                AS customers,
         COUNT(DISTINCT rep_id)  AS reps_on_floor
  FROM traffic
  WHERE ups > 0
  GROUP BY month
),
app_log AS (
  SELECT substr(at, 1, 7) AS month,
         SUM(CASE WHEN type = 'ticket_started'   THEN 1 ELSE 0 END)  AS tickets,
         COUNT(DISTINCT CASE WHEN type = 'ticket_started' THEN rep_id END) AS reps_using,
         SUM(CASE WHEN type = 'outcome_recorded' THEN 1 ELSE 0 END)  AS outcomes,
         SUM(CASE WHEN type = 'ticket_abandoned' THEN 1 ELSE 0 END)  AS dropped
  FROM events
  GROUP BY month
)
SELECT s.month,
       s.customers,
       COALESCE(a.tickets, 0)                         AS tickets,
       ROUND(100.0 * COALESCE(a.tickets, 0) / s.customers, 1) AS coverage_pct,
       s.reps_on_floor,
       COALESCE(a.reps_using, 0)                      AS reps_using,
       ROUND(100.0 * a.outcomes / a.tickets, 1)       AS outcome_pct,
       ROUND(100.0 * a.dropped / a.tickets, 1)        AS dropped_pct
FROM store_count s
LEFT JOIN app_log a ON a.month = s.month
ORDER BY s.month;
