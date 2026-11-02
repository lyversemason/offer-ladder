-- USAGE: EACH STORE BY WEEK
-- (Postgres version of src/db/queries/usage/2-stores-by-week.sql.)
-- Postgres differences: date_trunc('week', ...) finds the Monday (SQLite: date(day, '-6 days',
--   'weekday 1')).
-- Question: week by week, how many of each store's reps use the app, how many
-- times do they sit down with it, and how often do they use it with a customer?
--
-- Columns:
--   week           the Monday the week starts on (the first and last weeks of the
--                  history are partial)
--   reps_on_floor  reps who helped at least one customer that week
--   reps_using     reps who started at least one ticket that week
--   sittings       times a rep opened the app or came back after 30 quiet minutes
--   customers      customers the store counted that week
--   tickets        tickets started that week
--   coverage_pct   tickets ÷ customers
--
-- SQL ideas: date_trunc('week', day) rounds a date down to its week's Monday
-- (weeks start on Monday in Postgres), and CAST(... AS DATE) drops the time of
-- day it adds. Both steps group by store and week, then a JOIN lines them up.
WITH store_count AS (
  SELECT store_id,
         CAST(date_trunc('week', day) AS DATE) AS week,
         SUM(ups)                          AS customers,
         COUNT(DISTINCT rep_id)            AS reps_on_floor
  FROM traffic
  WHERE ups > 0
  GROUP BY store_id, week
),
app_log AS (
  SELECT store_id,
         CAST(date_trunc('week', at) AS DATE) AS week,
         COUNT(DISTINCT CASE WHEN type = 'ticket_started' THEN rep_id END) AS reps_using,
         SUM(CASE WHEN type = 'session_started' THEN 1 ELSE 0 END)        AS sittings,
         SUM(CASE WHEN type = 'ticket_started'  THEN 1 ELSE 0 END)        AS tickets
  FROM events
  GROUP BY store_id, week
)
SELECT s.week,
       st.name                                 AS store,
       s.reps_on_floor,
       COALESCE(a.reps_using, 0)               AS reps_using,
       COALESCE(a.sittings, 0)                 AS sittings,
       s.customers,
       COALESCE(a.tickets, 0)                  AS tickets,
       ROUND(100.0 * COALESCE(a.tickets, 0) / s.customers, 1) AS coverage_pct
FROM store_count s
JOIN stores st ON st.id = s.store_id
LEFT JOIN app_log a ON a.store_id = s.store_id AND a.week = s.week
ORDER BY s.week, st.name;
