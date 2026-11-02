-- PREMIUM (PRICE-LOCKED) LINE BY REP
-- (Postgres version of src/db/queries/6-premium-share.sql.)
-- Postgres differences: locked is true/false, so "dl.locked" on its own is the test
--   (SQLite writes dl.locked = 1).
-- Question: who sells the price-locked premium mattresses, and do they still
-- make margin on those sales? The premium line can't be discounted, so a good
-- rep builds the margin with full-price add-ons (bases, pillows, protectors).
--
-- Columns:
--   premium_sales        sales that include a price-locked mattress
--   premium_share_pct    premium mattress dollars ÷ all mattress dollars the rep sold
--   premium_margin_pct   margin on those whole sales (gross ÷ topline)
--   avg_add_ons          average dollars per premium sale from everything that
--                        isn't the mattress
--
-- SQL ideas: JOIN three tables (sales, their items, the catalog) to know which
-- items are mattresses; CASE picks out the price-locked ones. EXISTS keeps only
-- the sales that contain at least one price-locked mattress.
WITH mattress_dollars AS (
  SELECT d.rep_id,
         SUM(dl.net_cents)                                          AS all_mattress_cents,
         SUM(CASE WHEN dl.locked THEN dl.net_cents ELSE 0 END)      AS premium_mattress_cents
  FROM deals d
  JOIN deal_lines dl ON dl.deal_id = d.id
  JOIN products p    ON p.sku = dl.sku
  WHERE p.category = 'mattress'
  GROUP BY d.rep_id
),
premium_sales AS (
  SELECT d.id, d.rep_id, d.gross_cents, d.topline_cents
  FROM deals d
  WHERE EXISTS (
    SELECT 1
    FROM deal_lines dl
    JOIN products p ON p.sku = dl.sku
    WHERE dl.deal_id = d.id AND dl.locked AND p.category = 'mattress'
  )
),
premium_by_rep AS (
  SELECT rep_id,
         COUNT(*)            AS premium_sales,
         SUM(gross_cents)    AS gross_cents,
         SUM(topline_cents)  AS topline_cents
  FROM premium_sales
  GROUP BY rep_id
),
add_ons_by_rep AS (
  SELECT ps.rep_id,
         SUM(dl.net_cents) AS add_on_cents
  FROM premium_sales ps
  JOIN deal_lines dl ON dl.deal_id = ps.id
  JOIN products p    ON p.sku = dl.sku
  WHERE p.category <> 'mattress'
  GROUP BY ps.rep_id
)
SELECT r.name                                                             AS rep,
       COALESCE(pb.premium_sales, 0)                                      AS premium_sales,
       ROUND(100.0 * m.premium_mattress_cents / m.all_mattress_cents, 1)  AS premium_share_pct,
       ROUND(100.0 * pb.gross_cents / pb.topline_cents, 1)                AS premium_margin_pct,
       ROUND(a.add_on_cents / 100.0 / pb.premium_sales, 2)                AS avg_add_ons
FROM reps r
JOIN mattress_dollars m     ON m.rep_id = r.id
LEFT JOIN premium_by_rep pb ON pb.rep_id = r.id
LEFT JOIN add_ons_by_rep a  ON a.rep_id = r.id
ORDER BY premium_share_pct DESC;
