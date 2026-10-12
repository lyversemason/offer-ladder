-- Step 6: apply the approved changes to the catalog.
--
-- Runs only after the manager approves the review list from step 5.
-- Changed items get the new retail price and costs; new items are added.
-- Floor-model prices for new items are left empty, so they're sold new only
-- until someone sets them.
--
-- SQL ideas: UPDATE ... SET column = (a subquery) changes rows using values from
-- another table; INSERT INTO ... SELECT adds many rows at once.

UPDATE products
SET list_cents       = (SELECT c.new_list_cents       FROM vendor_changes c WHERE c.sku = products.sku),
    cost_cents       = (SELECT c.new_cost_cents       FROM vendor_changes c WHERE c.sku = products.sku),
    floor_cost_cents = (SELECT c.new_floor_cost_cents FROM vendor_changes c WHERE c.sku = products.sku)
WHERE sku IN (SELECT sku FROM vendor_changes WHERE change = 'changed');

INSERT INTO products (sku, brand, model, category, size, list_cents, cost_cents)
SELECT sku, brand, model, category, size, new_list_cents, new_cost_cents
FROM vendor_changes
WHERE change = 'new';
