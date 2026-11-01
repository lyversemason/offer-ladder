-- OfferLadder database: the tables every report reads.
--
-- Money is stored in whole cents (199900 = $1,999.00) and percents in basis
-- points (5000 = 50.00%), the same way the engine works, so no rounding creeps in.
-- Reports turn them back into dollars and percents at the very end.

-- The two stores.
CREATE TABLE stores (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

-- Sales reps. Each one works at one store.
CREATE TABLE reps (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  store_id TEXT NOT NULL REFERENCES stores(id),
  hired_on TEXT                               -- date, 'YYYY-MM-DD'
);

-- The catalog: one row per product and size. Every size of a model shares the
-- model's SKU (model_sku); sku is the item code a rep types, the model SKU plus a
-- size code ('365927-Q'). Outlet prices are empty (NULL) when the product can't
-- be sold as an outlet piece.
CREATE TABLE products (
  sku               TEXT PRIMARY KEY,
  model_sku         TEXT NOT NULL,
  brand             TEXT NOT NULL,
  model             TEXT NOT NULL,
  category          TEXT NOT NULL,            -- mattress, adjustable-base, pillow, ...
  size              TEXT,
  list_cents        INTEGER NOT NULL,
  cost_cents        INTEGER NOT NULL,
  outlet_list_cents INTEGER,
  outlet_cost_cents INTEGER
);

-- Every customer a rep helped: an "up". Conversion % = sold ups ÷ all ups.
CREATE TABLE visits (
  id         INTEGER PRIMARY KEY,
  rep_id     TEXT NOT NULL REFERENCES reps(id),
  store_id   TEXT NOT NULL REFERENCES stores(id),
  visited_on TEXT NOT NULL,                   -- date, 'YYYY-MM-DD'
  sold       INTEGER NOT NULL,                -- 1 = bought, 0 = walked
  ticket_id  TEXT                             -- the ticket in the events table; NULL before tracking
);

-- One row per sale. The totals are a SNAPSHOT of what the engine worked out on
-- the day of the sale, including the commission rate used. Rates and rules change
-- over time; like payroll, the record keeps what was actually paid, so changing a
-- rate next month never rewrites last month's commissions.
CREATE TABLE deals (
  id                   INTEGER PRIMARY KEY,
  visit_id             INTEGER NOT NULL REFERENCES visits(id),
  rep_id               TEXT NOT NULL REFERENCES reps(id),
  store_id             TEXT NOT NULL REFERENCES stores(id),
  closed_on            TEXT NOT NULL,         -- date, 'YYYY-MM-DD'
  list_topline_cents   INTEGER NOT NULL,      -- everything at list price
  topline_cents        INTEGER NOT NULL,      -- what the customer paid (pre-tax)
  product_cost_cents   INTEGER NOT NULL,
  delivery_cost_cents  INTEGER NOT NULL,
  gross_cents          INTEGER NOT NULL,      -- profit dollars commission is paid on
  margin_bp            INTEGER NOT NULL,      -- gross ÷ topline
  tier_id              TEXT,                  -- top, middle, low
  rate_bp              INTEGER NOT NULL,      -- commission rate used, bonus included
  attach               INTEGER NOT NULL,      -- 1 = sold an adjustable base
  commission_cents     INTEGER NOT NULL,
  financing_months     INTEGER,               -- NULL = no financing
  financing_adj_cents  INTEGER NOT NULL,      -- + added to gross, - taken out
  delivery_tier_id     TEXT,                  -- NULL = customer took it home
  delivery_price_cents INTEGER NOT NULL,
  tax_cents            INTEGER NOT NULL,      -- sales tax on the topline
  offers_made          INTEGER NOT NULL,      -- offers made after the asking price
  closed_at_rung       INTEGER NOT NULL       -- 0 = asking price, 1 = first offer, ...
);

-- The items in each sale. net = list − discount (the rep's).
CREATE TABLE deal_lines (
  deal_id        INTEGER NOT NULL REFERENCES deals(id),
  line_no        INTEGER NOT NULL,
  sku            TEXT NOT NULL REFERENCES products(sku),
  condition      TEXT NOT NULL,               -- new, outlet
  qty            INTEGER NOT NULL,
  list_cents     INTEGER NOT NULL,            -- list price × qty
  discount_cents INTEGER NOT NULL,
  net_cents      INTEGER NOT NULL,            -- what the customer paid for this line
  cost_cents     INTEGER NOT NULL,            -- cost × qty
  locked         INTEGER NOT NULL,            -- 1 = price-locked item
  PRIMARY KEY (deal_id, line_no)
);

-- Every price a rep offered, in order, including offers on customers who walked.
-- step_no 0 is the asking price. tier_id is NULL when the offer was below the
-- margin floor (it needed a manager's approval).
CREATE TABLE offers (
  id               INTEGER PRIMARY KEY,
  visit_id         INTEGER NOT NULL REFERENCES visits(id),
  deal_id          INTEGER REFERENCES deals(id), -- NULL when the customer walked
  step_no          INTEGER NOT NULL,
  topline_cents    INTEGER NOT NULL,
  margin_bp        INTEGER NOT NULL,
  tier_id          TEXT,
  commission_cents INTEGER NOT NULL,
  accepted         INTEGER NOT NULL,          -- 1 = the customer said yes to this one
  -- The rest of the offer, when it was recorded in full (NULL for older history):
  delivery_tier_id     TEXT,                  -- NULL = pickup (when the lines are recorded)
  delivery_list_cents  INTEGER,               -- delivery's full price
  delivery_price_cents INTEGER,               -- what the rep charged for it
  financing_months     INTEGER                -- NULL = no financing
);

-- Every line of every offer, so a report can see exactly what was on the table:
-- which items, at what price, and how the discount was entered.
CREATE TABLE offer_lines (
  offer_id       INTEGER NOT NULL REFERENCES offers(id),
  line_no        INTEGER NOT NULL,
  sku            TEXT NOT NULL REFERENCES products(sku),
  condition      TEXT NOT NULL,               -- new, outlet
  qty            INTEGER NOT NULL,
  list_cents     INTEGER NOT NULL,            -- list price × qty
  discount_cents INTEGER NOT NULL,
  net_cents      INTEGER NOT NULL,            -- the price offered for this line
  cost_cents     INTEGER NOT NULL,            -- cost × qty
  locked         INTEGER NOT NULL,            -- 1 = price-locked item
  discount_how   TEXT,                        -- dollars, percent, new_price; NULL = no discount
  discount_scope TEXT,                        -- row (this item) or ticket (the whole ticket)
  PRIMARY KEY (offer_id, line_no)
);

-- The reasons the rep gave for an offer's discount, one row each (they stack).
CREATE TABLE offer_reasons (
  offer_id  INTEGER NOT NULL REFERENCES offers(id),
  reason_no INTEGER NOT NULL,
  reason    TEXT NOT NULL,                    -- Financing, Military, Google review, ...
  PRIMARY KEY (offer_id, reason_no)
);

-- Usage tracking: one row per meaningful thing a rep did in the app. Never every
-- keystroke: an item added, a discount applied, an offer recorded, a screen opened.
-- Rows are only ever added: the triggers below refuse changes and deletes.
--   session_id: one sitting (a new one after 30 minutes without activity)
--   ticket_id:  one customer's ticket, from the first item to the outcome
--   how:        how it was done (sku, search, lookup, inventory; dollars, percent,
--               new_price; bought, walked; ...)
--   scope:      what it applied to (row, ticket, delivery)
--   value:      a number that goes with it (the iteration number, offers made, ...)
CREATE TABLE events (
  id         INTEGER PRIMARY KEY,
  at         TEXT NOT NULL,                   -- 'YYYY-MM-DD HH:MM:SS', store time
  rep_id     TEXT NOT NULL REFERENCES reps(id),
  store_id   TEXT NOT NULL REFERENCES stores(id),
  session_id TEXT NOT NULL,
  ticket_id  TEXT,                            -- NULL = not about a ticket
  type       TEXT NOT NULL,                   -- item_added, offer_recorded, ...
  how        TEXT,
  scope      TEXT,
  sku        TEXT,                            -- the item involved, if any
  value      INTEGER
);

CREATE TRIGGER events_no_update BEFORE UPDATE ON events
BEGIN SELECT RAISE(ABORT, 'The events table is add-only: rows can''t be changed.'); END;

CREATE TRIGGER events_no_delete BEFORE DELETE ON events
BEGIN SELECT RAISE(ABORT, 'The events table is add-only: rows can''t be deleted.'); END;

-- Customers each rep helped per day, as the store's own count reports them (a door
-- counter or the sales system), not the app. Usage is measured against this: on how
-- many of the customers they helped did the rep use the app?
CREATE TABLE traffic (
  day      TEXT NOT NULL,                     -- 'YYYY-MM-DD'
  rep_id   TEXT NOT NULL REFERENCES reps(id),
  store_id TEXT NOT NULL REFERENCES stores(id),
  ups      INTEGER NOT NULL,                  -- customers helped that day
  PRIMARY KEY (day, rep_id)
);

-- Each time the manager saves new rules, the whole rule set is kept here.
CREATE TABLE settings_history (
  id            INTEGER PRIMARY KEY,
  changed_on    TEXT NOT NULL,                -- date and time
  settings_json TEXT NOT NULL
);

-- Indexes: like a book's index, they let reports find a rep's or a month's rows
-- without reading the whole table.
CREATE INDEX visits_by_rep_date ON visits (rep_id, visited_on);
CREATE INDEX deals_by_rep_date  ON deals (rep_id, closed_on);
CREATE INDEX offers_by_visit    ON offers (visit_id);
CREATE INDEX events_by_rep_time ON events (rep_id, at);
CREATE INDEX events_by_ticket   ON events (ticket_id);
