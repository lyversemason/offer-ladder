-- USAGE: WHAT HAPPENS TO EACH TICKET
-- Question: once a rep starts a ticket, how far does it get? Do they try a price,
-- record an offer, and record how it ended, or move on without recording it?
--
-- Columns:
--   tickets             tickets the rep started
--   tried_price_pct     tickets where the rep changed a price at least once
--   recorded_offer_pct  tickets with at least one "I offered this price"
--   bought, walked      tickets that ended with that outcome recorded
--   dropped             tickets left without an outcome (the rep moved on)
--   outcome_pct         (bought + walked) ÷ tickets
--
-- SQL ideas: first one row per ticket (GROUP BY ticket_id), where
-- MAX(CASE WHEN ... THEN 1 ELSE 0 END) asks "did this ever happen on the ticket?"
-- (1 = yes). Then a second GROUP BY adds the tickets up per rep. A ticket still
-- in progress counts as started but not yet bought, walked or dropped.
WITH ticket AS (
  SELECT ticket_id,
         MAX(CASE WHEN type = 'ticket_started'   THEN rep_id END)          AS rep_id,
         MAX(CASE WHEN type = 'discount_applied' THEN 1 ELSE 0 END)        AS tried_price,
         MAX(CASE WHEN type = 'offer_recorded'   THEN 1 ELSE 0 END)        AS recorded_offer,
         MAX(CASE WHEN type = 'outcome_recorded' AND how = 'bought' THEN 1 ELSE 0 END) AS bought,
         MAX(CASE WHEN type = 'outcome_recorded' AND how = 'walked' THEN 1 ELSE 0 END) AS walked,
         MAX(CASE WHEN type = 'ticket_abandoned' THEN 1 ELSE 0 END)        AS dropped
  FROM events
  WHERE ticket_id IS NOT NULL
  GROUP BY ticket_id
)
SELECT r.name                                              AS rep,
       COUNT(*)                                            AS tickets,
       ROUND(100.0 * SUM(t.tried_price) / COUNT(*), 1)     AS tried_price_pct,
       ROUND(100.0 * SUM(t.recorded_offer) / COUNT(*), 1)  AS recorded_offer_pct,
       SUM(t.bought)                                       AS bought,
       SUM(t.walked)                                       AS walked,
       SUM(t.dropped)                                      AS dropped,
       ROUND(100.0 * (SUM(t.bought) + SUM(t.walked)) / COUNT(*), 1) AS outcome_pct
FROM ticket t
JOIN reps r ON r.id = t.rep_id
GROUP BY r.name
ORDER BY r.name;
