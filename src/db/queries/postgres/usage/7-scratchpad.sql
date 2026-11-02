-- USAGE: SCRATCHPAD SIGNALS
-- (Postgres version of src/db/queries/usage/7-scratchpad.sql.)
-- Postgres differences: times are real timestamps: subtract them and EXTRACT(EPOCH ...) gives
--   seconds (SQLite: julianday() days × 24 × 60).
-- Question: are reps using the app as a scratchpad, trying prices without
-- recording them? How quickly do they get to a first price, and how often do
-- they check the GM calculator? (No keystrokes are logged: these come from the
-- meaningful actions only.)
--
-- Columns:
--   tickets                   tickets the rep started
--   changes_per_ticket        price changes per ticket
--   offers_per_ticket         offers recorded with "I offered this price", per ticket
--   changes_per_offer         price changes per recorded offer (high = many tries
--                             for each price actually said to a customer)
--   minutes_to_first_price    average minutes from the first item to the first
--                             price change (tickets with a price change only)
--   gm_opens_per_100          GM calculator opens per 100 tickets
--
-- SQL ideas: one row per ticket first, with MIN(CASE WHEN ...) finding the time
-- of the first price change. Subtracting two times gives a length of time;
-- EXTRACT(EPOCH FROM ...) turns it into seconds, and ÷ 60 makes minutes.
-- AVG skips the NULLs, so tickets without a price change don't count there.
WITH ticket AS (
  SELECT ticket_id,
         MAX(CASE WHEN type = 'ticket_started'       THEN rep_id END)  AS rep_id,
         MIN(CASE WHEN type = 'ticket_started'       THEN at END)      AS started_at,
         MIN(CASE WHEN type = 'discount_applied'     THEN at END)      AS first_price_at,
         SUM(CASE WHEN type = 'discount_applied'     THEN 1 ELSE 0 END) AS changes,
         SUM(CASE WHEN type = 'offer_recorded'       THEN 1 ELSE 0 END) AS offers,
         SUM(CASE WHEN type = 'gm_calculator_opened' THEN 1 ELSE 0 END) AS gm_opens
  FROM events
  WHERE ticket_id IS NOT NULL
  GROUP BY ticket_id
)
SELECT r.name                                                 AS rep,
       COUNT(*)                                               AS tickets,
       ROUND(1.0 * SUM(t.changes) / COUNT(*), 1)              AS changes_per_ticket,
       ROUND(1.0 * SUM(t.offers) / COUNT(*), 2)               AS offers_per_ticket,
       ROUND(1.0 * SUM(t.changes) / NULLIF(SUM(t.offers), 0), 1) AS changes_per_offer,
       ROUND(AVG(EXTRACT(EPOCH FROM t.first_price_at - t.started_at) / 60), 1) AS minutes_to_first_price,
       ROUND(100.0 * SUM(t.gm_opens) / COUNT(*), 1)           AS gm_opens_per_100
FROM ticket t
JOIN reps r ON r.id = t.rep_id
GROUP BY r.name
ORDER BY r.name;
