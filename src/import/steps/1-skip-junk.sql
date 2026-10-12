-- Step 1: set aside rows that aren't products.
--
-- Spreadsheet exports carry junk: blank lines, and the header row repeated at
-- every page break. Those rows are logged as 'skip' (so nothing disappears
-- silently) and every other row goes on to the next step.
--
-- SQL ideas: INSERT ... SELECT copies the result of a query into a table;
-- TRIM removes spaces at the ends; COALESCE(x, '') treats a missing value as ''.

INSERT INTO vendor_issues (row_no, item, level, problem)
SELECT row_no, NULL, 'skip', 'Blank row'
FROM vendor_raw
WHERE TRIM(COALESCE(vendor, '') || COALESCE(brand, '') || COALESCE(category, '') || COALESCE(product, '')
         || COALESCE(size, '') || COALESCE(cost, '') || COALESCE(retail, '') || COALESCE(item, '')) = '';

INSERT INTO vendor_issues (row_no, item, level, problem)
SELECT row_no, NULL, 'skip', 'The header row repeated (a page break in the export)'
FROM vendor_raw
WHERE LOWER(TRIM(vendor)) = 'vendor' AND LOWER(TRIM(product)) = 'product';

CREATE TABLE vendor_rows AS
SELECT *
FROM vendor_raw
WHERE row_no NOT IN (SELECT row_no FROM vendor_issues WHERE level = 'skip');
