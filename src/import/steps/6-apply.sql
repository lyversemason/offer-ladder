-- Step 6: apply the approved changes to the catalog.
--
-- Runs only after the manager approves the review list from step 5.
-- Changed items get the new retail price and costs; new items are added.
-- An outlet (pre-owned) piece is priced at 20% off the new retail price (the
-- store's rule), so its price follows the retail price. New items with no outlet
-- cost are sold new only until someone sets one.
--
-- SQL ideas: UPDATE ... SET column = (a subquery) changes rows using values from
-- another table; INSERT INTO ... SELECT adds many rows at once.

UPDATE products
SET list_cents        = (SELECT c.new_list_cents        FROM vendor_changes c WHERE c.sku = products.sku),
    cost_cents        = (SELECT c.new_cost_cents        FROM vendor_changes c WHERE c.sku = products.sku),
    outlet_cost_cents = (SELECT c.new_outlet_cost_cents FROM vendor_changes c WHERE c.sku = products.sku),
    outlet_list_cents = (SELECT CASE WHEN c.new_outlet_cost_cents IS NULL THEN NULL
                                     ELSE CAST(ROUND(c.new_list_cents * 0.8) AS INTEGER) END
                         FROM vendor_changes c WHERE c.sku = products.sku)
WHERE sku IN (SELECT sku FROM vendor_changes WHERE change = 'changed');

INSERT INTO products (sku, model_sku, brand, model, category, size, list_cents, cost_cents,
                      outlet_list_cents, outlet_cost_cents)
SELECT sku, model_sku, brand, model, category, size, new_list_cents, new_cost_cents,
       CASE WHEN new_outlet_cost_cents IS NULL THEN NULL ELSE CAST(ROUND(new_list_cents * 0.8) AS INTEGER) END,
       new_outlet_cost_cents
FROM vendor_changes
WHERE change = 'new';
