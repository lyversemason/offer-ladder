-- Step 2: fill in the blanks left by merged cells.
--
-- In the vendor's spreadsheet, the vendor, brand and category were merged cells:
-- written once at the top of a group and blank below. Exported, only the first
-- row has them. Each blank takes the value from the nearest row above that has one.
--
-- SQL idea: a correlated subquery. For each row r, the inner SELECT looks at the
-- rows at or above r (v.row_no <= r.row_no), keeps the ones with a value, and
-- takes the closest (ORDER BY v.row_no DESC LIMIT 1).

CREATE TABLE vendor_filled AS
SELECT
  r.row_no,
  (SELECT TRIM(v.vendor) FROM vendor_rows v
    WHERE v.row_no <= r.row_no AND TRIM(COALESCE(v.vendor, '')) <> ''
    ORDER BY v.row_no DESC LIMIT 1) AS vendor,
  (SELECT TRIM(v.brand) FROM vendor_rows v
    WHERE v.row_no <= r.row_no AND TRIM(COALESCE(v.brand, '')) <> ''
    ORDER BY v.row_no DESC LIMIT 1) AS brand,
  (SELECT TRIM(v.category) FROM vendor_rows v
    WHERE v.row_no <= r.row_no AND TRIM(COALESCE(v.category, '')) <> ''
    ORDER BY v.row_no DESC LIMIT 1) AS category,
  TRIM(r.product)  AS product,
  TRIM(r.color)    AS color,
  TRIM(r.size)     AS size,
  r.floor_cost,
  r.clearance_cost,
  r.cost,
  r.retail,
  TRIM(r.item)     AS item
FROM vendor_rows r;
