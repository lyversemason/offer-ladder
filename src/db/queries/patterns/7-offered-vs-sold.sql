-- DEAL PATTERNS: OFFERED VS SOLD, BY PRODUCT TYPE
-- Question: which kinds of products get onto tickets but don't get bought, and how
-- much are they discounted when they do sell?
--
-- Columns:
--   category        the kind of product
--   customers       recorded customers whose ticket had one (at the asking price)
--   bought          how many of them bought one
--   close_pct       bought ÷ customers
--   discount_pct    total discount ÷ total list price, on the ones that sold
--
-- Read it with care: a pattern, not proof. A customer who walks takes every item
-- on the ticket with them, so a low close rate can come from the rest of the ticket.
--
-- SQL ideas: two named steps, one from the offers (what was on the ticket) and
-- one from the sales (what was bought), each counting distinct customers per
-- category, then a LEFT JOIN so a category nobody bought still shows up.
WITH offered AS (
  SELECT p.category, COUNT(DISTINCT o.visit_id) AS customers
  FROM offers o
  JOIN offer_lines l ON l.offer_id = o.id
  JOIN products p    ON p.sku = l.sku
  WHERE o.step_no = 0
  GROUP BY p.category
),
sold AS (
  SELECT p.category,
         COUNT(DISTINCT d.visit_id)  AS customers,
         SUM(dl.discount_cents)      AS discount_cents,
         SUM(dl.list_cents)          AS list_cents
  FROM deals d
  JOIN deal_lines dl ON dl.deal_id = d.id
  JOIN products p    ON p.sku = dl.sku
  GROUP BY p.category
)
SELECT o.category,
       o.customers,
       COALESCE(s.customers, 0)                                   AS bought,
       ROUND(100.0 * COALESCE(s.customers, 0) / o.customers, 1)   AS close_pct,
       ROUND(100.0 * s.discount_cents / s.list_cents, 1)          AS discount_pct
FROM offered o
LEFT JOIN sold s ON s.category = o.category
ORDER BY o.customers DESC, o.category;
