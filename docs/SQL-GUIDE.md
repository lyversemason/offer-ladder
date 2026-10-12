# SQL guide: how OfferLadder's reports work

This is a study guide for the seven reports in OfferLadder. Each report is one SQL query
in `src/db/queries/`. The goal: be able to read every query out loud, say what each part
does, and answer "why did you do it that way?"

The SQL was written by an AI agent under my direction; I learned to read and explain it.
That's the honest way to describe it: "the reports are built on SQL queries I can walk
you through."

---

## Part 1: how to read a SELECT

### The tables (what's in the database)

| Table | One row is... | Key columns |
|---|---|---|
| `stores` | a store | `id`, `name` |
| `reps` | a sales rep | `id`, `name`, `store_id` |
| `products` | a product in one size (a SKU) | `sku`, `brand`, `category`, `list_cents`, `cost_cents` |
| `visits` | a customer a rep helped (an "up") | `rep_id`, `visited_on`, `sold` (1 or 0) |
| `deals` | a sale | `rep_id`, `closed_on`, `topline_cents`, `gross_cents`, `margin_bp`, `tier_id`, `commission_cents`, `attach` |
| `deal_lines` | one item in a sale | `deal_id`, `sku`, `qty`, `net_cents`, `locked` |
| `offers` | one price offered to a customer | `visit_id`, `step_no`, `topline_cents`, `tier_id`, `accepted` |
| `settings_history` | a saved copy of the manager's rules | `changed_on`, `settings_json` |

Two habits in the data:

- **Money is in cents** (`199900` = $1,999.00) and **percents are in basis points**
  (`5000` = 50.00%). Whole numbers never pick up rounding errors. The reports divide by
  100 at the very end to show dollars and percents.
- **A sale is a snapshot.** The `deals` row keeps the commission and rate the engine worked
  out on the day of the sale. If the manager changes a rate next month, last month's
  commissions don't change, the same way payroll keeps what it paid.

### The order SQL actually runs in

You write a query top to bottom, but the database runs it in a different order. Knowing
that order is most of reading SQL:

| Order | Clause | What it does, in plain words |
|---|---|---|
| 1 | `FROM` / `JOIN` | Which tables to start from, and how to line their rows up |
| 2 | `WHERE` | Throw away rows you don't want (before any grouping) |
| 3 | `GROUP BY` | Put the remaining rows into piles (one pile per rep, per month, ...) |
| 4 | `HAVING` | Throw away whole piles you don't want |
| 5 | `SELECT` | Work out the columns to show (sums, counts, averages of each pile) |
| 6 | `ORDER BY` | Sort the result |

So `SELECT rep_id, COUNT(*) FROM deals WHERE tier_id = 'low' GROUP BY rep_id` reads as:
*start with all sales → keep only low-tier ones → make a pile per rep → count each pile.*

### The words you'll see

- **`COUNT(*)`**: how many rows are in the pile. **`SUM(x)`**: add them up.
  **`AVG(x)`**: average. **`MAX(x)`**: the biggest (for dates, the latest).
- **`AS name`**: gives a column (or a table) a short name.
- **`JOIN ... ON ...`**: line up rows from two tables that belong together. `JOIN reps r
  ON r.id = d.rep_id` means "for each sale, find the rep whose id matches the sale's
  rep_id." A plain `JOIN` drops rows that have no match.
- **`LEFT JOIN`**: same, but **keeps** rows from the left table even with no match; the
  missing columns come back empty (`NULL`). Use it when "nothing" is a real answer
  (a rep with zero exceptions should still appear, with 0).
- **`COALESCE(x, 0)`**: "x, or 0 if x is empty." Turns the empties from a LEFT JOIN into 0.
- **`CASE WHEN ... THEN ... ELSE ... END`**: an if/then inside a query.
- **`ROUND(x, 1)`**: round to 1 decimal place.
- **`100.0 * a / b`**: the `.0` matters. In SQLite, whole number ÷ whole number drops the
  decimals (7 / 2 = 3). Multiplying by `100.0` first keeps them (and turns it into a percent).
- **`substr(date, 1, 7)`**: the first 7 characters of `'2026-04-17'`, which is `'2026-04'`:
  the month.

### CTEs: named steps

A **CTE** (common table expression) is the `WITH name AS ( ... )` part at the top of a
query. Think of it as a **named step**: work something out, give it a name, then use that
name like a table further down. It's the SQL version of breaking a problem into steps on a
whiteboard. These reports use them so each step can be read on its own.

```sql
WITH ups_by_month AS ( ...count customers per rep per month... ),
     sales_by_month AS ( ...add up sales per rep per month... )
SELECT ...
FROM ups_by_month
LEFT JOIN sales_by_month ON ...
```

### Window functions

A normal `SUM` squashes a pile into one row. A **window function** (anything with
`OVER (...)`) computes across rows **without** squashing them, so each row can see
others. Two show up here:

- `SUM(COUNT(*)) OVER ()`: the total of all the piles' counts, shown on every row (to
  work out each row's share of the total).
- `LAG(x) OVER (ORDER BY month)`: the value of `x` from the row before, in month order
  (to compare with last month).

---

## Part 2: the reports

### 1. Rep scorecard by month

**The business question.** How did each rep do each month? It's the commission tracker a
rep keeps by hand (customers helped, sales, conversion, average order, margin, base
attach, commission), produced for every rep at once.

```sql
WITH ups_by_month AS (
  SELECT rep_id,
         substr(visited_on, 1, 7) AS month,        -- '2026-04-17' → '2026-04'
         COUNT(*)                 AS ups
  FROM visits
  GROUP BY rep_id, month
),
sales_by_month AS (
  SELECT rep_id,
         substr(closed_on, 1, 7) AS month,
         COUNT(*)                AS orders,
         SUM(topline_cents)      AS topline_cents,
         SUM(gross_cents)        AS gross_cents,
         SUM(attach)             AS base_orders,
         SUM(commission_cents)   AS commission_cents
  FROM deals
  GROUP BY rep_id, month
)
SELECT u.month,
       r.name                                                  AS rep,
       u.ups,
       COALESCE(s.orders, 0)                                   AS orders,
       ROUND(100.0 * COALESCE(s.orders, 0) / u.ups, 1)         AS conversion_pct,
       ROUND(COALESCE(s.topline_cents, 0) / 100.0, 2)          AS topline,
       ROUND(s.topline_cents / 100.0 / s.orders, 2)            AS avg_order,
       ROUND(100.0 * s.gross_cents / s.topline_cents, 1)       AS margin_pct,
       ROUND(100.0 * s.base_orders / s.orders, 1)              AS base_attach_pct,
       ROUND(COALESCE(s.commission_cents, 0) / 100.0, 2)       AS commission,
       ROUND(100.0 * s.commission_cents / s.topline_cents, 2)  AS comp_pct
FROM ups_by_month u
JOIN reps r ON r.id = u.rep_id
LEFT JOIN sales_by_month s ON s.rep_id = u.rep_id AND s.month = u.month
ORDER BY u.month, r.name;
```

**Walkthrough**

1. **`ups_by_month`** starts from `visits` (every customer helped). `substr(visited_on, 1,
   7)` cuts each date down to its month. `GROUP BY rep_id, month` makes one pile per rep
   per month, and `COUNT(*)` counts the customers in each pile: that's the ups.
2. **`sales_by_month`** does the same with `deals`: per rep and month, the number of sales,
   and the totals of topline, gross, commission, and `SUM(attach)`. `attach` is 1 when the
   sale had an adjustable base and 0 when it didn't, so adding them up counts the base sales.
3. The final `SELECT` starts from the ups (every rep-month where the rep helped someone),
   joins the rep's name, and **LEFT JOINs** the sales on both rep **and** month. LEFT JOIN
   because a month with customers but no sales must still show up, with 0 orders.
4. The math: conversion = orders ÷ ups; average order = topline ÷ orders; margin = total
   gross ÷ total topline; attach % = base sales ÷ sales; comp % = commission ÷ topline.
   Dividing cents by `100.0` turns them into dollars.

**Likely questions**

- *Why is margin total gross ÷ total topline instead of the average of each sale's
  margin?* Because that's the margin the business actually earned. A $4,000 sale at 45%
  matters more than a $100 pillow at 70%; averaging the percentages would treat them the
  same. (It's called a weighted average.)
- *Why a LEFT JOIN?* So a rep-month with ups but no sales still appears with 0 orders and
  0% conversion. A plain JOIN would silently drop it, and a bad month would disappear
  from the report.
- *Why count ups from visits and orders from deals, in two steps?* They're two different
  tables at two different levels (every customer vs. only buyers). Counting each on its
  own and then joining avoids double counting.

### 2. Store comparison

**The business question.** How do the two stores compare over the whole six months?

```sql
WITH ups_by_store AS (
  SELECT store_id, COUNT(*) AS ups
  FROM visits
  GROUP BY store_id
),
sales_by_store AS (
  SELECT store_id,
         COUNT(DISTINCT rep_id) AS reps,
         COUNT(*)               AS orders,
         SUM(topline_cents)     AS topline_cents,
         SUM(gross_cents)       AS gross_cents,
         SUM(attach)            AS base_orders,
         SUM(commission_cents)  AS commission_cents
  FROM deals
  GROUP BY store_id
)
SELECT st.name                                                 AS store,
       s.reps,
       u.ups,
       s.orders,
       ROUND(100.0 * s.orders / u.ups, 1)                      AS conversion_pct,
       ROUND(s.topline_cents / 100.0, 2)                       AS topline,
       ROUND(s.topline_cents / 100.0 / s.orders, 2)            AS avg_order,
       ROUND(100.0 * s.gross_cents / s.topline_cents, 1)       AS margin_pct,
       ROUND(100.0 * s.base_orders / s.orders, 1)              AS base_attach_pct,
       ROUND(s.commission_cents / 100.0, 2)                    AS commission,
       ROUND(100.0 * s.commission_cents / s.topline_cents, 2)  AS comp_pct
FROM stores st
JOIN ups_by_store u   ON u.store_id = st.id
JOIN sales_by_store s ON s.store_id = st.id
ORDER BY topline DESC;
```

**Walkthrough**

1. **`ups_by_store`**: count customers per store.
2. **`sales_by_store`**: per store, the sales totals, plus `COUNT(DISTINCT rep_id)`, the
   number of different reps who sold there. `DISTINCT` counts each rep once, however many
   sales they made.
3. The final `SELECT` starts from `stores` for the names and joins both steps on the
   store id. The math is the same as the scorecard. `ORDER BY topline DESC` puts the
   bigger store first (`DESC` = biggest first).

**Likely questions**

- *What does COUNT(DISTINCT rep_id) do that COUNT(rep_id) doesn't?* COUNT(rep_id) counts
  sales (one per row); DISTINCT counts unique reps.
- *Riverside sells more. Is it the better store?* Not by itself: it has more reps and more
  customers. Compare conversion, average order, margin and comp % instead of totals.
  Those are per customer or per dollar, so store size doesn't skew them.

### 3. Tier mix by rep

**The business question.** How much of each rep's business lands in each commission tier,
and how hard do they negotiate? A rep who discounts early has a large low-tier share.

```sql
SELECT r.name                                                               AS rep,
       COUNT(*)                                                             AS orders,
       ROUND(100.0 * SUM(CASE WHEN d.tier_id = 'top'    THEN 1 ELSE 0 END) / COUNT(*), 1) AS top_pct,
       ROUND(100.0 * SUM(CASE WHEN d.tier_id = 'middle' THEN 1 ELSE 0 END) / COUNT(*), 1) AS middle_pct,
       ROUND(100.0 * SUM(CASE WHEN d.tier_id = 'low'    THEN 1 ELSE 0 END) / COUNT(*), 1) AS low_pct,
       ROUND(AVG(d.offers_made), 2)                                         AS avg_offers,
       ROUND(100.0 * SUM(d.list_topline_cents - d.topline_cents) / SUM(d.list_topline_cents), 1)
                                                                            AS discount_pct
FROM deals d
JOIN reps r ON r.id = d.rep_id
GROUP BY r.id, r.name
ORDER BY low_pct DESC;
```

**Walkthrough**

1. `FROM deals d JOIN reps r` lines each sale up with its rep's name.
2. `GROUP BY r.id, r.name` makes one pile per rep.
3. `CASE WHEN d.tier_id = 'top' THEN 1 ELSE 0 END` turns each sale into a 1 (top tier) or
   0 (not). `SUM` of those counts top-tier sales; dividing by `COUNT(*)` gives the share.
   The same is done for middle and low. This is a **pivot**: turning the values of one
   column (`tier_id`) into separate columns.
4. `AVG(offers_made)` is the average number of offers after the asking price.
   `discount_pct` is the total discount (list − paid) ÷ total list price.
5. `ORDER BY low_pct DESC` puts the rep with the biggest low-tier share on top.

**Likely questions**

- *How else could you get the tier breakdown?* `GROUP BY rep, tier_id` gives one row per
  rep per tier (long format). CASE + SUM gives one row per rep with a column per tier,
  which is easier to read side by side.
- *What would you do with this report as a manager?* Coach the rep at the top (biggest
  low-tier share): practice the offer ladder, not skipping the top-tier offer. Check
  their average offers: a low number with a high low-tier share means they jump straight
  to big discounts.

### 4. Where deals close on the ladder

**The business question.** At which offer do customers say yes, and what does each step
down cost? Rung 0 is the asking price, rung 1 the first offer, and so on.

```sql
SELECT closed_at_rung,
       COUNT(*)                                                  AS deals,
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1)        AS share_pct,
       ROUND(AVG(topline_cents) / 100.0, 2)                      AS avg_price,
       ROUND(100.0 * SUM(list_topline_cents - topline_cents) / SUM(list_topline_cents), 1)
                                                                 AS discount_pct,
       ROUND(AVG(margin_bp) / 100.0, 1)                          AS avg_margin_pct,
       ROUND(AVG(commission_cents) / 100.0, 2)                   AS avg_commission
FROM deals
GROUP BY closed_at_rung
ORDER BY closed_at_rung;
```

**Walkthrough**

1. `GROUP BY closed_at_rung`: one pile per rung (all sales that closed at the asking
   price, all that closed at the first offer, ...).
2. `COUNT(*)` is how many sales closed there.
3. `SUM(COUNT(*)) OVER ()` is a **window function**: `COUNT(*)` is each pile's count, and
   `SUM(...) OVER ()` adds up the counts of **all** the piles, shown on every row. So
   `COUNT(*) / SUM(COUNT(*)) OVER ()` is this rung's share of all sales, worked out in one query.
4. The averages show what each rung looks like: price, discount, margin and commission.

**Likely questions**

- *What does `OVER ()` with empty brackets mean?* The window is the whole result: every
  row. `OVER (PARTITION BY rep_id)` would be "every row for the same rep" instead.
- *What does this report tell a sales manager?* How much each step down the ladder costs.
  If many sales close at the last rung, reps are giving away margin the customer might
  not have needed.

### 5. Adjustable-base attach rate by month

**The business question.** Is the share of sales that include an adjustable base going up
or down? A base adds a bonus to the rep's whole commission, and it's a high-value add-on
for the store.

```sql
WITH monthly AS (
  SELECT substr(closed_on, 1, 7)                    AS month,
         COUNT(*)                                   AS orders,
         SUM(attach)                                AS base_orders,
         ROUND(100.0 * SUM(attach) / COUNT(*), 1)   AS attach_pct
  FROM deals
  GROUP BY month
)
SELECT month,
       orders,
       base_orders,
       attach_pct,
       ROUND(attach_pct - LAG(attach_pct) OVER (ORDER BY month), 1) AS change_pts
FROM monthly
ORDER BY month;
```

**Walkthrough**

1. **`monthly`** groups all sales by month: number of sales, number with a base
   (`SUM(attach)`), and the attach %.
2. The final `SELECT` reads those monthly rows and adds `change_pts`: this month's attach
   % minus `LAG(attach_pct) OVER (ORDER BY month)`, which is **last month's** value. The
   first month has nothing before it, so its change is empty (`NULL`).

**Likely questions**

- *Why a CTE before LAG?* LAG has to look at finished monthly numbers. The CTE builds
  those first, and the outer query compares neighboring months.
- *Why "points" and not percent?* Going from 25% to 30% is +5 percentage **points**. Calling
  it "+5%" would be ambiguous (5% of 25% is 1.25).

### 6. Premium (price-locked) line by rep

**The business question.** Who sells the price-locked premium mattresses, and do they
still make margin on those sales? The maker won't let the store discount that line, so a
rep has to build the margin elsewhere: full-price bases, pillows, protectors.

```sql
WITH mattress_dollars AS (
  SELECT d.rep_id,
         SUM(dl.net_cents)                                          AS all_mattress_cents,
         SUM(CASE WHEN dl.locked = 1 THEN dl.net_cents ELSE 0 END)  AS premium_mattress_cents
  FROM deals d
  JOIN deal_lines dl ON dl.deal_id = d.id
  JOIN products p    ON p.sku = dl.sku
  WHERE p.category = 'mattress'
  GROUP BY d.rep_id
),
premium_sales AS (
  SELECT d.id, d.rep_id, d.gross_cents, d.topline_cents
  FROM deals d
  WHERE EXISTS (
    SELECT 1
    FROM deal_lines dl
    JOIN products p ON p.sku = dl.sku
    WHERE dl.deal_id = d.id AND dl.locked = 1 AND p.category = 'mattress'
  )
),
premium_by_rep AS (
  SELECT rep_id,
         COUNT(*)            AS premium_sales,
         SUM(gross_cents)    AS gross_cents,
         SUM(topline_cents)  AS topline_cents
  FROM premium_sales
  GROUP BY rep_id
),
add_ons_by_rep AS (
  SELECT ps.rep_id,
         SUM(dl.net_cents) AS add_on_cents
  FROM premium_sales ps
  JOIN deal_lines dl ON dl.deal_id = ps.id
  JOIN products p    ON p.sku = dl.sku
  WHERE p.category <> 'mattress'
  GROUP BY ps.rep_id
)
SELECT r.name                                                             AS rep,
       COALESCE(pb.premium_sales, 0)                                      AS premium_sales,
       ROUND(100.0 * m.premium_mattress_cents / m.all_mattress_cents, 1)  AS premium_share_pct,
       ROUND(100.0 * pb.gross_cents / pb.topline_cents, 1)                AS premium_margin_pct,
       ROUND(a.add_on_cents / 100.0 / pb.premium_sales, 2)                AS avg_add_ons
FROM reps r
JOIN mattress_dollars m     ON m.rep_id = r.id
LEFT JOIN premium_by_rep pb ON pb.rep_id = r.id
LEFT JOIN add_ons_by_rep a  ON a.rep_id = r.id
ORDER BY premium_share_pct DESC;
```

**Walkthrough**

1. **`mattress_dollars`** joins three tables: each sale (`deals`), its items
   (`deal_lines`) and the catalog (`products`) to know which items are mattresses. `WHERE
   p.category = 'mattress'` keeps mattress lines only. Per rep, it adds up all mattress
   dollars, and with `CASE`, only the price-locked ones (`locked = 1`).
2. **`premium_sales`** keeps whole sales that contain a price-locked mattress. `EXISTS (...)`
   asks, for each sale, "is there at least one matching line?" It answers yes or no
   without multiplying rows.
3. **`premium_by_rep`** counts those sales per rep and adds up their gross and topline.
4. **`add_ons_by_rep`** adds up everything in those sales that **isn't** the mattress
   (`<>` means "not equal"): the add-ons.
5. The final `SELECT` lists every rep with: premium share = premium mattress dollars ÷ all
   mattress dollars; margin on premium sales; average add-on dollars per premium sale.

**Likely questions**

- *Why EXISTS instead of joining deal_lines straight in?* A join gives one row per
  matching line, so a sale with two premium items would be counted twice. EXISTS just asks
  yes/no for each sale.
- *What's "share" here and why use dollars?* It's the premium line's slice of the rep's
  mattress dollars (the "balance of share" idea in retail). Dollars rather than units
  because one premium bed is worth several value beds.
- *What does a high margin on premium sales tell you?* That the rep sells add-ons at full
  price around the locked mattress, which is the skill the premium line needs.

### 7. Exceptions: the floor

**The business question.** Who is pushing deals to the bottom? Offers below the margin
floor (they needed a manager's approval) and sales that closed in the low tier.

```sql
WITH low_tier AS (
  SELECT rep_id,
         COUNT(*)                                          AS orders,
         SUM(CASE WHEN tier_id = 'low' THEN 1 ELSE 0 END)  AS low_tier_sales
  FROM deals
  GROUP BY rep_id
),
below_floor AS (
  SELECT v.rep_id,
         COUNT(*)          AS below_floor_offers,
         MAX(v.visited_on) AS last_below_floor
  FROM offers o
  JOIN visits v ON v.id = o.visit_id
  WHERE o.tier_id IS NULL AND o.step_no > 0
  GROUP BY v.rep_id
)
SELECT r.name                                            AS rep,
       COALESCE(lt.orders, 0)                            AS orders,
       COALESCE(lt.low_tier_sales, 0)                    AS low_tier_sales,
       ROUND(100.0 * lt.low_tier_sales / lt.orders, 1)   AS low_tier_pct,
       COALESCE(bf.below_floor_offers, 0)                AS below_floor_offers,
       bf.last_below_floor
FROM reps r
LEFT JOIN low_tier lt    ON lt.rep_id = r.id
LEFT JOIN below_floor bf ON bf.rep_id = r.id
ORDER BY below_floor_offers DESC, low_tier_pct DESC;
```

**Walkthrough**

1. **`low_tier`**: per rep, number of sales, and with CASE + SUM, how many closed in the
   low tier.
2. **`below_floor`**: offers are linked to the customer visit, and the visit knows the rep,
   so `offers JOIN visits` gives each offer its rep. `tier_id IS NULL` means the offer was
   below the floor (no tier), and `step_no > 0` skips asking prices. Count them per rep,
   plus the latest date (`MAX`).
3. The final `SELECT` starts from **all reps** and LEFT JOINs both steps, so a rep with no
   exceptions still appears, and `COALESCE` shows their counts as 0.

**Likely questions**

- *Why `IS NULL` and not `= NULL`?* In SQL, NULL means "unknown", and nothing equals
  unknown, not even NULL. `= NULL` is never true; `IS NULL` is the right test.
- *What would you add next?* A detail list of each below-floor offer (date, customer
  price, margin) so a manager can review them, and a trend by month to see if coaching
  is working.

---

## Part 3: try it yourself (query lab)

The app's query lab runs any read-only `SELECT`. A few to start with:

```sql
-- My 10 biggest sales
SELECT closed_on, rep_id, topline_cents / 100.0 AS price, tier_id
FROM deals
ORDER BY topline_cents DESC
LIMIT 10;

-- Best-selling mattresses by units
SELECT p.brand, p.model, SUM(dl.qty) AS units
FROM deal_lines dl
JOIN products p ON p.sku = dl.sku
WHERE p.category = 'mattress'
GROUP BY p.brand, p.model
ORDER BY units DESC;

-- How often each financing term is used
SELECT financing_months, COUNT(*) AS sales
FROM deals
GROUP BY financing_months
ORDER BY sales DESC;
```

---

## Part 4: the vendor import (cleaning data with SQL)

The reports **read** clean data. The import is the other half of the job: getting messy
data **clean** in the first place. A vendor sends a cost sheet exported from a
spreadsheet; the sample (`src/data/samples/vendor-cost-sheet.csv`) has the problems real
ones have. The steps are in `src/import/steps/`, one file each, run in order.

The big idea: **load everything as text first, keep the original,
clean in named steps, flag instead of guess, and change nothing until a person approves.**

| Step | File | What it does | SQL idea |
|---|---|---|---|
| Load | `pipeline.ts` | Every row goes into `vendor_raw` exactly as written, all text | Keep the original so every step can be checked against it |
| 1 | `1-skip-junk.sql` | Blank rows and the header repeated at page breaks are logged as "skip" and left out | `INSERT ... SELECT`, `TRIM`, `COALESCE` |
| 2 | `2-fill-down.sql` | Merged cells (vendor, brand, category written once at the top of a group) are filled down | A correlated subquery: "the nearest row at or above me that has a value" |
| 3 | `3-normalize.sql` | `Q`, `QN`, `STD/QN` → Queen; `"$1,299.00"` → 129900 cents | `LEFT JOIN` to lookup tables; `REPLACE`; `CASE`; `GLOB` to check it looks like a number |
| 4 | `4-flag-problems.sql` | One `INSERT` per rule: do-not-use, no item number, not a number, no retail, no cost, cost ≥ retail, unknown size or category, duplicates | Each rule is its own query; `ROW_NUMBER() OVER (PARTITION BY item ...)` finds copies |
| 5 | `5-compare.sql` | Usable rows are matched to the catalog by item number: new / changed / same. Also warns when a filled-down brand disagrees with the catalog | `LEFT JOIN` keeps new items; `CASE` labels them |
| 6 | `6-apply.sql` | Runs only after the manager clicks Approve: updates changed items, adds new ones | `UPDATE ... SET col = (subquery)`; `INSERT INTO ... SELECT` |

### Step 2 up close: filling down merged cells

```sql
(SELECT TRIM(v.brand) FROM vendor_rows v
  WHERE v.row_no <= r.row_no AND TRIM(COALESCE(v.brand, '')) <> ''
  ORDER BY v.row_no DESC LIMIT 1) AS brand
```

Read it as: *for this row r, look at every row at or above it (`v.row_no <= r.row_no`)
that has a brand, sort them closest first (`ORDER BY v.row_no DESC`), and take the first
one (`LIMIT 1`).* That's what "fill down" does in a spreadsheet, written as a question.

The catch, and why step 5 checks brands: fill-down trusts the sheet's layout. In the
sample, two sheet sets sit under a Tidewell group, so they inherit "Tidewell" even though
the catalog says Lantern Lane. The import warns instead of silently trusting either one.

### Step 3 up close: money text into cents

```sql
CASE WHEN m.cost_txt = '' THEN NULL
     WHEN m.cost_txt GLOB '*[^0-9.]*' THEN NULL
     ELSE CAST(ROUND(CAST(m.cost_txt AS REAL) * 100) AS INTEGER) END AS cost_cents
```

- `cost_txt` already had `$` and `,` removed (`REPLACE`), so `"$1,035.00"` is `"1035.00"`.
- Blank → `NULL` (missing, flagged in step 4).
- `GLOB '*[^0-9.]*'` means "contains anything that isn't a digit or a dot": `"two
  hundred"` matches, so it becomes `NULL` and step 4 flags "isn't a number".
- Otherwise: text → number → × 100 → rounded → whole cents.

### Step 4 up close: duplicates with a window function

```sql
SELECT row_no, item,
       ROW_NUMBER() OVER (PARTITION BY item ORDER BY row_no) AS copy_no
FROM vendor_normalized
```

`PARTITION BY item` makes a pile per item number; `ROW_NUMBER()` numbers the rows inside
each pile 1, 2, 3 in file order. Anything with `copy_no > 1` is a repeat. Unlike
`GROUP BY`, the rows aren't squashed together, so each repeat can be reported with its
own row number.

### Likely questions

**Why load everything as text instead of converting while reading the file?**
Because the conversion is where things go wrong. If "two hundred" is in the cost column,
converting on the way in either crashes or quietly turns it into 0. Loading as text keeps
the original, and the cleaning step can flag exactly which row and why.

**Why lookup tables for sizes instead of code?**
The rules are data a manager can read: one row says `qn` means Queen. A new spelling from
a new vendor is one new row, not a code change. And anything not in the table is
flagged, not guessed.

**What stops a bad import from breaking the catalog?**
Three things: rows with a blocking problem never reach the compare step; the compare step
only *describes* changes; and the apply step only runs after a person approves the list.

**What would you add next?**
A margin check on changed costs (warn when a new cost would drop an item's margin below
the floor), and keeping a history of every import (who approved what, when).
