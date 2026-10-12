-- Tables for importing a vendor's cost sheet.
--
-- vendor_raw keeps every row exactly as the file had it: all text, nothing fixed.
-- Keeping the original means every cleaning step can be checked against it, and
-- nothing the vendor sent is ever lost.
CREATE TABLE vendor_raw (
  row_no          INTEGER PRIMARY KEY,  -- the line in the file (header = 1, so data starts at 2)
  vendor          TEXT,
  brand           TEXT,
  category        TEXT,
  product         TEXT,
  color           TEXT,
  size            TEXT,
  floor_cost      TEXT,
  clearance_cost  TEXT,
  cost            TEXT,
  retail          TEXT,
  item            TEXT
);

-- Lookup tables: every way the vendor writes a size or category, and what it means.
-- Fixing abbreviations with a table (not with code) means the manager can see the
-- rules, and adding a new spelling is one row.
CREATE TABLE size_codes (
  code  TEXT PRIMARY KEY,  -- lowercase, as written by the vendor: 'q', 'qn', 'txl'
  size  TEXT NOT NULL      -- our name: 'Queen', 'Twin XL'
);

CREATE TABLE category_codes (
  label     TEXT PRIMARY KEY,  -- lowercase, as written by the vendor: 'adjustable bases'
  category  TEXT NOT NULL      -- our category id: 'adjustable-base'
);

-- One row per problem found. 'block' means the row can't be imported until it's
-- fixed; 'warn' means it can, but a person should look; 'skip' means it wasn't data.
CREATE TABLE vendor_issues (
  row_no   INTEGER NOT NULL,
  item     TEXT,
  level    TEXT NOT NULL CHECK (level IN ('block', 'warn', 'skip')),
  problem  TEXT NOT NULL
);

INSERT INTO size_codes (code, size) VALUES
  ('twin', 'Twin'), ('t', 'Twin'),
  ('twin xl', 'Twin XL'), ('txl', 'Twin XL'),
  ('full', 'Full'), ('f', 'Full'),
  ('queen', 'Queen'), ('q', 'Queen'), ('qn', 'Queen'), ('std/qn', 'Queen'), ('standard/queen', 'Queen'),
  ('king', 'King'), ('k', 'King'), ('kg', 'King'),
  ('cal king', 'Cal King'), ('ck', 'Cal King'), ('cal k', 'Cal King'),
  ('split king', 'Split King'), ('sk', 'Split King');

INSERT INTO category_codes (label, category) VALUES
  ('mattresses', 'mattress'),
  ('foundations', 'foundation'),
  ('adjustable bases', 'adjustable-base'),
  ('pillows', 'pillow'),
  ('protectors', 'protector'),
  ('sheets', 'sheets'),
  ('protection plans', 'protection-plan');
