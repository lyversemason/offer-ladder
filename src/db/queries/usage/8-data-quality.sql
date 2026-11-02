-- USAGE: DATA QUALITY: WHAT THE REPORTS CAN SEE
-- Question: how much of each rep's floor does the data cover? The sales reports
-- (and the deal patterns) only see customers with an outcome recorded, so
-- they're only as good as these numbers.
--
-- Columns:
--   customers               customers the store counted for the rep
--   recorded                customers with Bought or Walked recorded in the app
--   seen_pct                recorded ÷ customers: the share the reports can see
--   no_ticket               customers helped without the app
--   dropped                 tickets left without an outcome
--   walkouts_recorded_pct   walked ÷ (walked + dropped): of the customers who
--                           left without a sale, how many were recorded. Sales
--                           almost always get recorded (that's how a rep gets
--                           paid), so walk-outs are what goes missing.
--
-- SQL ideas: the store's count and the app's counts are two named steps joined
-- on the rep, the same pattern as the coverage report, over the whole period.
WITH store_count AS (
  SELECT rep_id, SUM(ups) AS customers
  FROM traffic
  GROUP BY rep_id
),
app_log AS (
  SELECT rep_id,
         SUM(CASE WHEN type = 'ticket_started' THEN 1 ELSE 0 END)                      AS tickets,
         SUM(CASE WHEN type = 'outcome_recorded' THEN 1 ELSE 0 END)                    AS recorded,
         SUM(CASE WHEN type = 'outcome_recorded' AND how = 'walked' THEN 1 ELSE 0 END) AS walked,
         SUM(CASE WHEN type = 'ticket_abandoned' THEN 1 ELSE 0 END)                    AS dropped
  FROM events
  GROUP BY rep_id
)
SELECT r.name                                                     AS rep,
       s.customers,
       a.recorded,
       ROUND(100.0 * a.recorded / s.customers, 1)                 AS seen_pct,
       s.customers - a.tickets                                    AS no_ticket,
       a.dropped,
       ROUND(100.0 * a.walked / NULLIF(a.walked + a.dropped, 0), 1) AS walkouts_recorded_pct
FROM store_count s
JOIN reps r ON r.id = s.rep_id
JOIN app_log a ON a.rep_id = s.rep_id
ORDER BY r.name;
