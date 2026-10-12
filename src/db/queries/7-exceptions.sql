-- EXCEPTIONS: THE FLOOR
-- Question: who is pushing deals to the bottom? Per rep: offers made below the
-- margin floor (they needed a manager's approval) and sales that closed in the
-- low tier, the last stop before the floor.
--
-- Columns:
--   orders               the rep's sales
--   low_tier_sales       sales that closed in the low tier
--   low_tier_pct         low_tier_sales ÷ orders
--   below_floor_offers   offers made below the floor (needed approval)
--   last_below_floor     the most recent date of one of those offers
--
-- SQL ideas: two CTEs counted separately, then joined to the list of reps with
-- LEFT JOIN so reps with no exceptions still show (COALESCE turns their empty
-- count into 0). An offer is below the floor when it has no tier (tier_id IS NULL).
WITH low_tier AS (
  SELECT rep_id,
         COUNT(*)                                          AS orders,
         SUM(CASE WHEN tier_id = 'low' THEN 1 ELSE 0 END)  AS low_tier_sales
  FROM deals
  GROUP BY rep_id
),
below_floor AS (
  SELECT v.rep_id,
         COUNT(*)          AS below_floor_offers,
         MAX(v.visited_on) AS last_below_floor
  FROM offers o
  JOIN visits v ON v.id = o.visit_id
  WHERE o.tier_id IS NULL AND o.step_no > 0
  GROUP BY v.rep_id
)
SELECT r.name                                            AS rep,
       COALESCE(lt.orders, 0)                            AS orders,
       COALESCE(lt.low_tier_sales, 0)                    AS low_tier_sales,
       ROUND(100.0 * lt.low_tier_sales / lt.orders, 1)   AS low_tier_pct,
       COALESCE(bf.below_floor_offers, 0)                AS below_floor_offers,
       bf.last_below_floor
FROM reps r
LEFT JOIN low_tier lt    ON lt.rep_id = r.id
LEFT JOIN below_floor bf ON bf.rep_id = r.id
ORDER BY below_floor_offers DESC, low_tier_pct DESC;
