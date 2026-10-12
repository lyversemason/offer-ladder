-- Step 3: turn the vendor's text into clean values.
--
-- • Sizes and categories: looked up in size_codes and category_codes. No match
--   gives NULL, which step 4 reports instead of guessing.
-- • Money: "$1,299.00" becomes 129900 (whole cents). The text has to look like a
--   number first; "two hundred" is kept as text and flagged in step 4.
--
-- SQL ideas: LEFT JOIN keeps every row even when the lookup finds nothing;
-- CASE WHEN ... THEN ... ELSE ... END is an if/else; GLOB is a simple pattern
-- match ('*[^0-9.]*' means "contains a character that isn't a digit or a dot").

CREATE TABLE vendor_normalized AS
WITH money_text AS (
  SELECT
    f.*,
    REPLACE(REPLACE(TRIM(COALESCE(f.outlet_cost, '')), '$', ''), ',', '')    AS outlet_txt,
    REPLACE(REPLACE(TRIM(COALESCE(f.cost, '')), '$', ''), ',', '')           AS cost_txt,
    REPLACE(REPLACE(TRIM(COALESCE(f.retail, '')), '$', ''), ',', '')         AS retail_txt
  FROM vendor_filled f
)
SELECT
  m.row_no,
  m.vendor,
  m.brand,
  m.category                 AS category_as_written,
  c.category                 AS category,
  m.product,
  m.color,
  m.size                     AS size_as_written,
  s.size                     AS size,
  m.item,
  -- A blank stays NULL; a number becomes cents; anything else is "not a number".
  CASE WHEN m.cost_txt = '' THEN NULL
       WHEN m.cost_txt GLOB '*[^0-9.]*' THEN NULL
       ELSE CAST(ROUND(CAST(m.cost_txt AS REAL) * 100) AS INTEGER) END        AS cost_cents,
  CASE WHEN m.retail_txt = '' THEN NULL
       WHEN m.retail_txt GLOB '*[^0-9.]*' THEN NULL
       ELSE CAST(ROUND(CAST(m.retail_txt AS REAL) * 100) AS INTEGER) END      AS retail_cents,
  CASE WHEN m.outlet_txt = '' OR m.outlet_txt GLOB '*[^0-9.]*' THEN NULL
       ELSE CAST(ROUND(CAST(m.outlet_txt AS REAL) * 100) AS INTEGER) END      AS outlet_cost_cents,
  (m.cost_txt GLOB '*[^0-9.]*' OR m.retail_txt GLOB '*[^0-9.]*'
   OR m.outlet_txt GLOB '*[^0-9.]*')                                           AS has_bad_number
FROM money_text m
LEFT JOIN size_codes s     ON s.code = LOWER(m.size)
LEFT JOIN category_codes c ON c.label = LOWER(m.category);
