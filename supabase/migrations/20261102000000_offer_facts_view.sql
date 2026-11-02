-- The offer_facts view (v0.18.0): one row per offer with what the Deal patterns
-- reports compare. The same query as the browser's (src/db/schema.sql); written so
-- it runs on both databases (CASE WHEN o.accepted turns true/false into 1 or 0).
-- security_invoker: the view follows the reader's own access rules, so it can't
-- become a way around row-level security once sign-in adds them.
CREATE VIEW offer_facts WITH (security_invoker = true) AS
WITH base_cut AS (
  -- The share taken off a discountable (not price-locked) adjustable base, per offer.
  SELECT l.offer_id, MAX(100.0 * l.discount_cents / l.list_cents) AS base_cut_pct
  FROM offer_lines l
  JOIN products p ON p.sku = l.sku
  WHERE p.category = 'adjustable-base' AND NOT l.locked AND l.list_cents > 0
  GROUP BY l.offer_id
)
SELECT o.id                                            AS offer_id,
       o.visit_id,
       v.rep_id,
       v.store_id,
       v.visited_on,
       o.step_no,                                      -- 0 = the asking price
       CASE WHEN o.accepted THEN 1 ELSE 0 END          AS accepted,
       CASE WHEN v.sold THEN 1 ELSE 0 END              AS bought,
       a.topline_cents                                 AS asking_cents,
       o.topline_cents,
       100.0 * (a.topline_cents - o.topline_cents) / a.topline_cents AS discount_pct,
       CASE WHEN o.delivery_tier_id IS NULL THEN 'pickup'
            WHEN o.delivery_list_cents = 0  THEN 'basic'    -- a tier that's always free
            WHEN o.delivery_price_cents = 0 THEN 'waived'   -- the rep made it free
            ELSE 'charged' END                         AS delivery,
       o.financing_months,
       b.base_cut_pct,                                 -- NULL = no discountable base
       o.commission_cents
FROM offers o
JOIN visits v ON v.id = o.visit_id
JOIN offers a ON a.visit_id = o.visit_id AND a.step_no = 0
LEFT JOIN base_cut b ON b.offer_id = o.id;
