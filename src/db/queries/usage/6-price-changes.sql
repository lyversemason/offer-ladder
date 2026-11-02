-- USAGE: HOW PRICES GET CHANGED
-- Question: when reps change a price, how do they type it (a new price, % off or
-- $ off), and where (one row, the whole ticket, or delivery)? How often do they
-- try a price the store refuses because it's under the lowest allowed?
--
-- Columns:
--   price_changes     discounts applied (every one, whether it became an offer or not)
--   new_price_pct     typed the price they wanted
--   percent_pct       typed a % off
--   dollars_pct       typed a $ amount off
--   one_row_pct       changed one item's row
--   whole_ticket_pct  changed the whole ticket at once
--   delivery_pct      changed the delivery price
--   refused_per_100   prices the store refused, per 100 tickets
--
-- SQL ideas: step one counts everything per rep in a single pass (each
-- SUM(CASE WHEN ...) counts one kind of event); step two turns the counts into
-- shares. NULLIF(x, 0) turns a 0 into NULL, so a rep with no price changes yet
-- shows a blank instead of a divide-by-zero.
WITH counts AS (
  SELECT rep_id,
         SUM(CASE WHEN type = 'discount_applied' THEN 1 ELSE 0 END)                         AS changes,
         SUM(CASE WHEN type = 'discount_applied' AND how = 'new_price' THEN 1 ELSE 0 END)   AS new_price,
         SUM(CASE WHEN type = 'discount_applied' AND how = 'percent' THEN 1 ELSE 0 END)     AS percent,
         SUM(CASE WHEN type = 'discount_applied' AND how = 'dollars' THEN 1 ELSE 0 END)     AS dollars,
         SUM(CASE WHEN type = 'discount_applied' AND scope = 'row' THEN 1 ELSE 0 END)       AS one_row,
         SUM(CASE WHEN type = 'discount_applied' AND scope = 'ticket' THEN 1 ELSE 0 END)    AS whole_ticket,
         SUM(CASE WHEN type = 'discount_applied' AND scope = 'delivery' THEN 1 ELSE 0 END)  AS delivery,
         SUM(CASE WHEN type = 'floor_refused' THEN 1 ELSE 0 END)                            AS refused,
         SUM(CASE WHEN type = 'ticket_started' THEN 1 ELSE 0 END)                           AS tickets
  FROM events
  GROUP BY rep_id
)
SELECT r.name                                                  AS rep,
       c.changes                                               AS price_changes,
       ROUND(100.0 * c.new_price    / NULLIF(c.changes, 0), 1) AS new_price_pct,
       ROUND(100.0 * c.percent      / NULLIF(c.changes, 0), 1) AS percent_pct,
       ROUND(100.0 * c.dollars      / NULLIF(c.changes, 0), 1) AS dollars_pct,
       ROUND(100.0 * c.one_row      / NULLIF(c.changes, 0), 1) AS one_row_pct,
       ROUND(100.0 * c.whole_ticket / NULLIF(c.changes, 0), 1) AS whole_ticket_pct,
       ROUND(100.0 * c.delivery     / NULLIF(c.changes, 0), 1) AS delivery_pct,
       ROUND(100.0 * c.refused      / NULLIF(c.tickets, 0), 1) AS refused_per_100
FROM counts c
JOIN reps r ON r.id = c.rep_id
ORDER BY r.name;
