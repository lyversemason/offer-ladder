-- Step 4: flag every row a person needs to look at.
--
-- Each INSERT below is one rule, written as "find the rows that break it".
-- 'block' rows can't be imported until fixed; 'warn' rows can, but get a look.
-- The rules follow the old custom-GPT's habit: never guess, ask.
--
-- SQL ideas: each rule is its own SELECT, so a rule can be read (or removed) on
-- its own. The duplicate rule uses a window function: ROW_NUMBER() OVER
-- (PARTITION BY item ORDER BY row_no) numbers the copies of each item 1, 2, 3...
-- so every copy after the first can be flagged.

INSERT INTO vendor_issues (row_no, item, level, problem)
SELECT row_no, item, 'block', 'Marked "do not use" by the vendor'
FROM vendor_normalized
WHERE UPPER(product) LIKE '%DO NOT USE%';

INSERT INTO vendor_issues (row_no, item, level, problem)
SELECT row_no, item, 'block', 'No item number, so it can''t be matched to the catalog'
FROM vendor_normalized
WHERE COALESCE(item, '') = '' AND UPPER(product) NOT LIKE '%DO NOT USE%';

INSERT INTO vendor_issues (row_no, item, level, problem)
SELECT row_no, item, 'block', 'A price or cost isn''t a number'
FROM vendor_normalized
WHERE has_bad_number;

INSERT INTO vendor_issues (row_no, item, level, problem)
SELECT row_no, item, 'block', 'No retail price'
FROM vendor_normalized
WHERE retail_cents IS NULL AND NOT has_bad_number AND UPPER(product) NOT LIKE '%DO NOT USE%';

INSERT INTO vendor_issues (row_no, item, level, problem)
SELECT row_no, item, 'block', 'No cost'
FROM vendor_normalized
WHERE cost_cents IS NULL AND NOT has_bad_number AND UPPER(product) NOT LIKE '%DO NOT USE%';

INSERT INTO vendor_issues (row_no, item, level, problem)
SELECT row_no, item, 'block', 'Cost is at or above the retail price (probably a typo)'
FROM vendor_normalized
WHERE cost_cents >= retail_cents;

INSERT INTO vendor_issues (row_no, item, level, problem)
SELECT row_no, item, 'block', 'Size "' || size_as_written || '" isn''t a size we know'
FROM vendor_normalized
WHERE size IS NULL AND COALESCE(size_as_written, '') <> '';

INSERT INTO vendor_issues (row_no, item, level, problem)
SELECT row_no, item, 'block', 'Category "' || category_as_written || '" isn''t one we sell'
FROM vendor_normalized
WHERE category IS NULL;

INSERT INTO vendor_issues (row_no, item, level, problem)
SELECT row_no, item, 'warn', 'Listed twice: only the first copy is used'
FROM (
  SELECT row_no, item,
         ROW_NUMBER() OVER (PARTITION BY item ORDER BY row_no) AS copy_no
  FROM vendor_normalized
  WHERE COALESCE(item, '') <> ''
)
WHERE copy_no > 1;
