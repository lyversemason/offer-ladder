-- USAGE: HOW ITEMS GET ON THE TICKET
-- (Postgres version of src/db/queries/usage/5-adding-items.sql.)
-- Postgres differences: to_char(date, 'YYYY-MM') gives the month (SQLite: substr).
-- Question: how does each rep add items: typing a SKU, searching by name, the
-- Look up screen, or Inventory? Does a new hire move to typing SKUs over time?
--
-- Columns:
--   items          items added to tickets that month
--   sku_pct        typed the SKU
--   search_pct     searched by name in the SKU box
--   lookup_pct     picked it on the Look up screen
--   inventory_pct  picked it on the Inventory screen
--
-- SQL ideas: one GROUP BY rep and month over the item_added events; each _pct
-- column is SUM(CASE WHEN how = ... THEN 1 ELSE 0 END) ÷ COUNT(*), so the four
-- add up to 100% in every row.
SELECT r.name                                                             AS rep,
       to_char(e.at, 'YYYY-MM')                                           AS month,
       COUNT(*)                                                           AS items,
       ROUND(100.0 * SUM(CASE WHEN e.how = 'sku'       THEN 1 ELSE 0 END) / COUNT(*), 1) AS sku_pct,
       ROUND(100.0 * SUM(CASE WHEN e.how = 'search'    THEN 1 ELSE 0 END) / COUNT(*), 1) AS search_pct,
       ROUND(100.0 * SUM(CASE WHEN e.how = 'lookup'    THEN 1 ELSE 0 END) / COUNT(*), 1) AS lookup_pct,
       ROUND(100.0 * SUM(CASE WHEN e.how = 'inventory' THEN 1 ELSE 0 END) / COUNT(*), 1) AS inventory_pct
FROM events e
JOIN reps r ON r.id = e.rep_id
WHERE e.type = 'item_added'
GROUP BY r.name, month
ORDER BY r.name, month;
