-- Step 5: compare the usable rows with the catalog.
--
-- A row is usable when nothing blocks it (and it's the first copy of its item).
-- Each one is matched to the catalog by SKU and size together: every size of a
-- model shares the model's SKU, so the SKU alone would match all of them. Then
-- it's labeled:
--   new      the catalog doesn't have this size of this SKU yet
--   changed  its retail price, cost or outlet cost is different
--   same     nothing to do
-- Nothing in the catalog changes here: the manager reviews this list first.
--
-- SQL ideas: a CTE ("usable") keeps the filter readable; LEFT JOIN to products
-- keeps new items (no match → the products columns are NULL); a join can match
-- on two columns at once (ON ... AND ...); CASE labels each row; || joins text.

CREATE TABLE vendor_changes AS
WITH usable AS (
  SELECT n.*
  FROM vendor_normalized n
  WHERE n.row_no NOT IN (
    SELECT row_no FROM vendor_issues
    WHERE level = 'block' OR problem LIKE 'Listed twice%'
  )
)
SELECT
  u.row_no,
  -- The item code a rep types: the catalog's, or SKU + our size code when new.
  COALESCE(p.sku, u.item || '-' || z.code) AS sku,
  u.item                    AS model_sku,
  u.brand,
  u.product                 AS model,
  u.category,
  u.size,
  p.list_cents              AS old_list_cents,
  u.retail_cents            AS new_list_cents,
  p.cost_cents              AS old_cost_cents,
  u.cost_cents              AS new_cost_cents,
  p.outlet_cost_cents       AS old_outlet_cost_cents,
  -- A blank outlet cost means "no change", not "can't be sold as outlet".
  COALESCE(u.outlet_cost_cents, p.outlet_cost_cents) AS new_outlet_cost_cents,
  CASE
    WHEN p.sku IS NULL THEN 'new'
    WHEN p.list_cents <> u.retail_cents
      OR p.cost_cents <> u.cost_cents
      OR COALESCE(p.outlet_cost_cents, -1) <> COALESCE(u.outlet_cost_cents, p.outlet_cost_cents, -1)
      THEN 'changed'
    ELSE 'same'
  END AS change
FROM usable u
LEFT JOIN products p        ON p.model_sku = u.item AND p.size = u.size
LEFT JOIN item_size_codes z ON z.size = u.size;

-- A brand that differs from the catalog's usually means a merged cell was filled
-- down too far (step 2). Worth a look, but not a reason to stop the row.
INSERT INTO vendor_issues (row_no, item, level, problem)
SELECT c.row_no, c.model_sku, 'warn',
       'The sheet says brand ' || c.brand || ' but the catalog has ' || p.brand || ': check the merged cells above it'
FROM vendor_changes c
JOIN products p ON p.sku = c.sku
WHERE c.brand <> p.brand;
