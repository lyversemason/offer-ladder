# SQL guide: how OfferLadder's reports work

This is a study guide for OfferLadder's reports: the seven sales reports (Parts 1–2), the
eight usage and seven deal-pattern reports and the Postgres version (Part 5), and the
vendor import (Part 4). Each report is one SQL query in `src/db/queries/`. The goal: be able to read every query out loud, say what each part
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
| `products` | a product in one size | `sku` (item code: model SKU + size code), `model_sku`, `brand`, `category`, `list_cents`, `cost_cents` |
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
  low-tier share): practice making a top-tier offer first instead of skipping it. Check
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

### 7. Exceptions: low-margin sales

**The business question.** Who gives the most margin away? Any sale that makes money is
allowed (the store's rule: make the sale even if it only makes a dollar), but the manager
wants to see the sales under the exceptions margin (20% in the demo rules). The report
counts each rep's low-tier sales and the sales that closed under that margin.

```sql
WITH rules AS (
  SELECT json_extract(settings_json, '$.exceptionMarginBp') AS exception_bp
  FROM settings_history
  ORDER BY id DESC
  LIMIT 1
),
per_rep AS (
  SELECT d.rep_id,
         COUNT(*)                                                     AS orders,
         SUM(CASE WHEN d.tier_id = 'low' THEN 1 ELSE 0 END)           AS low_tier_sales,
         SUM(CASE WHEN d.margin_bp < rules.exception_bp THEN 1 ELSE 0 END) AS under_margin_sales,
         MAX(CASE WHEN d.margin_bp < rules.exception_bp THEN d.closed_on END) AS last_under_margin
  FROM deals d
  CROSS JOIN rules
  GROUP BY d.rep_id
)
SELECT r.name                                                  AS rep,
       COALESCE(p.orders, 0)                                   AS orders,
       COALESCE(p.low_tier_sales, 0)                           AS low_tier_sales,
       ROUND(100.0 * p.low_tier_sales / p.orders, 1)           AS low_tier_pct,
       COALESCE(p.under_margin_sales, 0)                        AS under_margin_sales,
       ROUND(100.0 * p.under_margin_sales / p.orders, 1)        AS under_margin_pct,
       p.last_under_margin
FROM reps r
LEFT JOIN per_rep p ON p.rep_id = r.id
ORDER BY under_margin_sales DESC, low_tier_pct DESC;
```

**Walkthrough**

1. **`rules`**: the manager's rules are saved as one block of JSON text in
   `settings_history`. `json_extract(settings_json, '$.exceptionMarginBp')` pulls out
   one value from it, and `ORDER BY id DESC LIMIT 1` takes the newest saved rule set. So
   if the manager changes the exceptions margin to 25%, the report follows without anyone
   editing the query.
2. **`per_rep`**: `CROSS JOIN rules` puts that one number next to every sale (a cross
   join pairs every row with every row of the other side, and `rules` has one row).
   Then, per rep: the number of sales, how many closed in the low tier, how many closed
   under the exceptions margin (CASE inside SUM counts only those), and the latest date
   of one (`MAX` of a CASE that's empty for the others).
3. The final `SELECT` starts from **all reps** and LEFT JOINs `per_rep`, so a rep with no
   sales still appears, and `COALESCE` shows their counts as 0.

**Likely questions**

- *Why read the 20% from the rules instead of typing 2000 into the query?* A number typed
  into a query goes stale the day the manager changes the rule. Reading it from the saved
  rules keeps the report and the app agreeing.
- *Why `MAX(CASE WHEN ... THEN closed_on END)`?* The CASE gives a date only for the sales
  that count, and nothing (NULL) for the rest. `MAX` skips NULLs, so it returns the latest
  qualifying date.
- *What would you add next?* A detail list of each sale under the exceptions margin (date,
  customer price, margin) so a manager can review them, and a trend by month to see if
  coaching is working.

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
| 3 | `3-normalize.sql` | `Q`, `QN` → Queen; `Dual Cal` → Split Cal King half; `"$1,299.00"` → 129900 cents | `LEFT JOIN` to lookup tables; `REPLACE`; `CASE`; `GLOB` to check it looks like a number |
| 4 | `4-flag-problems.sql` | One `INSERT` per rule: do-not-use, no SKU, not a number, no retail, no cost, cost ≥ retail, unknown size or category, duplicates | Each rule is its own query; `ROW_NUMBER() OVER (PARTITION BY item, size ...)` finds copies |
| 5 | `5-compare.sql` | Usable rows are matched to the catalog by SKU **and** size: new / changed / same. A size the catalog doesn't have gets an item code (SKU + size code). Also warns when a filled-down brand disagrees with the catalog | A join on two columns (`ON ... AND ...`); `LEFT JOIN` keeps new items; `CASE` labels them |
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
sample, two Meridian sheet sets sit under a Futura group, so they inherit "Futura" even
though the catalog says Meridian. The import warns instead of silently trusting either one.

### Step 3 up close: money text into cents

```sql
CASE WHEN m.cost_txt = '' THEN NULL
     WHEN m.cost_txt GLOB '*[^0-9.]*' THEN NULL
     ELSE CAST(ROUND(CAST(m.cost_txt AS REAL) * 100) AS INTEGER) END AS cost_cents
```

- `cost_txt` already had `$` and `,` removed (`REPLACE`), so `"$1,077.11"` is `"1077.11"`.
- Blank → `NULL` (missing, flagged in step 4).
- `GLOB '*[^0-9.]*'` means "contains anything that isn't a digit or a dot": `"two
  hundred"` matches, so it becomes `NULL` and step 4 flags "isn't a number".
- Otherwise: text → number → × 100 → rounded → whole cents.

### Step 4 up close: duplicates with a window function

```sql
SELECT row_no, item,
       ROW_NUMBER() OVER (PARTITION BY item, COALESCE(size, size_as_written) ORDER BY row_no) AS copy_no
FROM vendor_normalized
```

`PARTITION BY item, size` makes a pile per SKU-and-size pair; `ROW_NUMBER()` numbers the
rows inside each pile 1, 2, 3 in file order. Anything with `copy_no > 1` is a repeat.
The size matters: every size of a model shares its SKU, so a Queen and a King with the
same SKU are two different items, not a duplicate. Unlike `GROUP BY`, the rows aren't
squashed together, so each repeat can be reported with its own row number.

### Step 5 up close: matching on two columns

```sql
COALESCE(p.sku, u.item || '-' || z.code) AS sku
...
FROM usable u
LEFT JOIN products p        ON p.model_sku = u.item AND p.size = u.size
LEFT JOIN item_size_codes z ON z.size = u.size
```

The vendor's SKU names a model, not one size of it, so a match needs both the SKU and
the size (`ON ... AND ...`). When nothing matches, the row is a size the catalog doesn't
have yet, and it gets a new item code: the SKU, a dash and our code for the size (`||`
joins text), so `366230` in Split-head King becomes `366230-HK`.

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

---

## Part 5: usage, deal patterns, and the Postgres version

Parts 1 and 2 cover the sales reports. Since then the app gained two manager tabs, each
built the same way (every report a `.sql` file with a plain-English header), and the
same tables now also run in Postgres. This part covers all of it.

### The new tables

| Table | One row is... | Key columns |
|---|---|---|
| `events` | one meaningful thing a rep did in the app (never a keystroke) | `at` (date and time), `rep_id`, `session_id` (one sitting), `ticket_id` (one customer), `type` (`item_added`, `discount_applied`, `offer_recorded`, ...), `how`, `scope`, `value` |
| `traffic` | the customers one rep helped on one day, **from the store's own count**, not the app | `day`, `rep_id`, `ups` |
| `offer_lines` | one item on one offer | `offer_id`, `sku`, `list_cents`, `discount_cents`, `discount_how` (dollars, percent, new price), `discount_scope` (one row or the whole ticket) |
| `offer_reasons` | one reason given for an offer's discount | `offer_id`, `reason` |

`visits` gained `ticket_id` (which events belong to that customer), and `offers` gained
delivery and financing. `events` is **add-only**: a trigger refuses any change or delete,
like an audit log.

Two counts of "customers" now exist, and the difference matters:

- **`traffic.ups`**: everyone the store counted (a door counter or the sales system).
- **`visits`**: the customers a rep recorded in the app (bought or walked).

The gap between them is the story of the Usage tab: customers helped without the app,
and tickets dropped without an outcome.

### New SQL ideas in this part

- **`SUM(CASE WHEN type = 'x' THEN 1 ELSE 0 END)`** counts one kind of event. Several of
  these in one `SELECT` count several kinds in a single pass over the table.
- **`MAX(CASE WHEN type = 'x' THEN 1 ELSE 0 END)`** asks "did this ever happen?" for a
  pile: 1 if any row matched, 0 if none did.
- **`MIN(CASE WHEN type = 'x' THEN at END)`**: the first time something happened (rows
  that don't match give `NULL`, which `MIN` skips).
- **`COUNT(DISTINCT CASE WHEN ... THEN rep_id END)`**: how many different reps did it.
- **`NULLIF(x, 0)`**: `NULL` when x is 0, so dividing by it gives an empty answer instead
  of an error.
- **`ORDER BY MIN(discount_pct)`**: sorts piles by the smallest value inside each pile,
  which puts bands like "Under 10%", "10–15%" in their natural order.
- **`'6' || ' months'`**: `||` joins text.
- **A view** (`CREATE VIEW`): a saved query that other queries read like a table. Below.
- **The same table twice** (`offer_facts f ... JOIN offer_facts l`): two copies with two
  short names, one for each customer's first offer and one for their last.

### Usage reports (Manager → Usage)

**What they answer:** are reps using the app, and how? These come from `events` and
`traffic` only. No money, and nothing here judges a rep's selling.

#### U1. The company by month

**The business question.** How often do reps use the app with a customer (coverage), how
many reps use it at all, and how many tickets end with an outcome recorded?

```sql
WITH store_count AS (
  SELECT substr(day, 1, 7)       AS month,          -- '2026-04-17' → '2026-04'
         SUM(ups)                AS customers,
         COUNT(DISTINCT rep_id)  AS reps_on_floor
  FROM traffic
  WHERE ups > 0
  GROUP BY month
),
app_log AS (
  SELECT substr(at, 1, 7) AS month,
         SUM(CASE WHEN type = 'ticket_started'   THEN 1 ELSE 0 END)  AS tickets,
         COUNT(DISTINCT CASE WHEN type = 'ticket_started' THEN rep_id END) AS reps_using,
         SUM(CASE WHEN type = 'outcome_recorded' THEN 1 ELSE 0 END)  AS outcomes,
         SUM(CASE WHEN type = 'ticket_abandoned' THEN 1 ELSE 0 END)  AS dropped
  FROM events
  GROUP BY month
)
SELECT s.month,
       s.customers,
       COALESCE(a.tickets, 0)                         AS tickets,
       ROUND(100.0 * COALESCE(a.tickets, 0) / s.customers, 1) AS coverage_pct,
       s.reps_on_floor,
       COALESCE(a.reps_using, 0)                      AS reps_using,
       ROUND(100.0 * a.outcomes / a.tickets, 1)       AS outcome_pct,
       ROUND(100.0 * a.dropped / a.tickets, 1)        AS dropped_pct
FROM store_count s
LEFT JOIN app_log a ON a.month = s.month
ORDER BY s.month;
```

**Walkthrough**

1. **`store_count`** groups `traffic` by month: total customers counted, and how many
   different reps helped someone (`COUNT(DISTINCT rep_id)`).
2. **`app_log`** groups `events` by month, counting ticket starts, outcomes and dropped
   tickets with `SUM(CASE ...)`, and the reps who started a ticket with
   `COUNT(DISTINCT CASE ...)`.
3. The final `SELECT` starts from the store's count and LEFT JOINs the app's numbers on
   the month. **Coverage = tickets ÷ customers.**

**Likely questions**

- *Why compare against the store's count instead of counting sign-ins?* Sign-ins say a
  rep opened the app; coverage says they used it with the customers they actually
  helped. "9 of 11 customers" is the number a manager can act on.
- *Why start from `store_count` with a LEFT JOIN?* A month where the store counted
  customers but the app logged nothing is the worst month for adoption. A plain JOIN
  would hide it.

#### U2. Each store by week

**The business question.** Week by week, per store: how many reps use it, how many times
they sit down with it, and coverage.

```sql
WITH store_count AS (
  SELECT store_id,
         date(day, '-6 days', 'weekday 1') AS week,
         SUM(ups)                          AS customers,
         COUNT(DISTINCT rep_id)            AS reps_on_floor
  FROM traffic
  WHERE ups > 0
  GROUP BY store_id, week
),
app_log AS (
  SELECT store_id,
         date(at, '-6 days', 'weekday 1') AS week,
         COUNT(DISTINCT CASE WHEN type = 'ticket_started' THEN rep_id END) AS reps_using,
         SUM(CASE WHEN type = 'session_started' THEN 1 ELSE 0 END)        AS sittings,
         SUM(CASE WHEN type = 'ticket_started'  THEN 1 ELSE 0 END)        AS tickets
  FROM events
  GROUP BY store_id, week
)
SELECT s.week,
       st.name                                 AS store,
       s.reps_on_floor,
       COALESCE(a.reps_using, 0)               AS reps_using,
       COALESCE(a.sittings, 0)                 AS sittings,
       s.customers,
       COALESCE(a.tickets, 0)                  AS tickets,
       ROUND(100.0 * COALESCE(a.tickets, 0) / s.customers, 1) AS coverage_pct
FROM store_count s
JOIN stores st ON st.id = s.store_id
LEFT JOIN app_log a ON a.store_id = s.store_id AND a.week = s.week
ORDER BY s.week, st.name;
```

**Walkthrough.** Same shape as U1, grouped by store and **week** instead of month.
`date(day, '-6 days', 'weekday 1')` finds the Monday a date's week starts on: go back six
days, then forward to the next Monday (a Monday stays itself). A **sitting** is a
`session_started` event: the rep opened the app, or came back after 30 quiet minutes.

**Likely question.** *Why weekly?* Adoption problems show up fast: a store that drops
from 90% to 60% coverage in one week has a new hire, a broken tablet, or a manager who
stopped asking. Monthly numbers hide that for weeks.

#### U3. Coverage by rep and month

```sql
WITH store_count AS (
  SELECT rep_id,
         substr(day, 1, 7) AS month,
         SUM(ups)          AS customers
  FROM traffic
  GROUP BY rep_id, month
),
tickets AS (
  SELECT rep_id,
         substr(at, 1, 7) AS month,
         COUNT(*)         AS tickets
  FROM events
  WHERE type = 'ticket_started'
  GROUP BY rep_id, month
)
SELECT r.name                                   AS rep,
       s.month,
       s.customers,
       COALESCE(t.tickets, 0)                   AS tickets,
       ROUND(100.0 * COALESCE(t.tickets, 0) / s.customers, 1) AS coverage_pct,
       s.customers - COALESCE(t.tickets, 0)     AS no_ticket
FROM store_count s
JOIN reps r ON r.id = s.rep_id
LEFT JOIN tickets t ON t.rep_id = s.rep_id AND t.month = s.month
WHERE s.customers > 0
ORDER BY r.name, s.month;
```

**Walkthrough.** Coverage per rep: the store's count per rep and month, the tickets the
rep started, and `no_ticket` = customers helped without the app. Sorted **by rep, then
month**, so one rep's months sit together and a trend is easy to read (Sofia, the new
hire, climbs month by month).

#### U4. What happens to each ticket

**The business question.** Once a ticket is started, does the rep try a price, record an
offer, and record how it ended?

```sql
WITH ticket AS (
  SELECT ticket_id,
         MAX(CASE WHEN type = 'ticket_started'   THEN rep_id END)          AS rep_id,
         MAX(CASE WHEN type = 'discount_applied' THEN 1 ELSE 0 END)        AS tried_price,
         MAX(CASE WHEN type = 'offer_recorded'   THEN 1 ELSE 0 END)        AS recorded_offer,
         MAX(CASE WHEN type = 'outcome_recorded' AND how = 'bought' THEN 1 ELSE 0 END) AS bought,
         MAX(CASE WHEN type = 'outcome_recorded' AND how = 'walked' THEN 1 ELSE 0 END) AS walked,
         MAX(CASE WHEN type = 'ticket_abandoned' THEN 1 ELSE 0 END)        AS dropped
  FROM events
  WHERE ticket_id IS NOT NULL
  GROUP BY ticket_id
)
SELECT r.name                                              AS rep,
       COUNT(*)                                            AS tickets,
       ROUND(100.0 * SUM(t.tried_price) / COUNT(*), 1)     AS tried_price_pct,
       ROUND(100.0 * SUM(t.recorded_offer) / COUNT(*), 1)  AS recorded_offer_pct,
       SUM(t.bought)                                       AS bought,
       SUM(t.walked)                                       AS walked,
       SUM(t.dropped)                                      AS dropped,
       ROUND(100.0 * (SUM(t.bought) + SUM(t.walked)) / COUNT(*), 1) AS outcome_pct
FROM ticket t
JOIN reps r ON r.id = t.rep_id
GROUP BY r.name
ORDER BY r.name;
```

**Walkthrough**

1. **`ticket`** makes **one row per ticket**: `GROUP BY ticket_id`, and each
   `MAX(CASE ...)` asks "did this ever happen on this ticket?" The rep is taken from the
   `ticket_started` row.
2. The final `SELECT` groups those ticket rows by rep and adds them up: a funnel.

**Likely question.** *Why two levels of GROUP BY?* The question is about tickets
("what share of tickets got an offer?"), but the data is events. Rolling events up to
one row per ticket first, then tickets up to reps, keeps a ticket with ten price changes
from counting ten times.

#### U5. How items get on the ticket

```sql
SELECT r.name                                                             AS rep,
       substr(e.at, 1, 7)                                                 AS month,
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
```

**Walkthrough.** Only `item_added` events, grouped by rep and month. Each `_pct` column
counts one way of adding (`how`) and divides by all the items, so the four add up to
100%. A new hire leaning on Look up and Inventory, then moving to typed SKUs, shows up
here as training working.

#### U6. How prices get changed

```sql
WITH counts AS (
  SELECT rep_id,
         SUM(CASE WHEN type = 'discount_applied' THEN 1 ELSE 0 END)                         AS changes,
         SUM(CASE WHEN type = 'discount_applied' AND how = 'new_price' THEN 1 ELSE 0 END)   AS new_price,
         SUM(CASE WHEN type = 'discount_applied' AND how = 'percent' THEN 1 ELSE 0 END)     AS percent,
         SUM(CASE WHEN type = 'discount_applied' AND how = 'dollars' THEN 1 ELSE 0 END)     AS dollars,
         SUM(CASE WHEN type = 'discount_applied' AND scope = 'row' THEN 1 ELSE 0 END)       AS one_row,
         SUM(CASE WHEN type = 'discount_applied' AND scope = 'ticket' THEN 1 ELSE 0 END)    AS whole_ticket,
         SUM(CASE WHEN type = 'discount_applied' AND scope = 'delivery' THEN 1 ELSE 0 END)  AS delivery,
         SUM(CASE WHEN type = 'floor_refused' THEN 1 ELSE 0 END)                            AS refused,
         SUM(CASE WHEN type = 'ticket_started' THEN 1 ELSE 0 END)                           AS tickets
  FROM events
  GROUP BY rep_id
)
SELECT r.name                                                  AS rep,
       c.changes                                               AS price_changes,
       ROUND(100.0 * c.new_price    / NULLIF(c.changes, 0), 1) AS new_price_pct,
       ROUND(100.0 * c.percent      / NULLIF(c.changes, 0), 1) AS percent_pct,
       ROUND(100.0 * c.dollars      / NULLIF(c.changes, 0), 1) AS dollars_pct,
       ROUND(100.0 * c.one_row      / NULLIF(c.changes, 0), 1) AS one_row_pct,
       ROUND(100.0 * c.whole_ticket / NULLIF(c.changes, 0), 1) AS whole_ticket_pct,
       ROUND(100.0 * c.delivery     / NULLIF(c.changes, 0), 1) AS delivery_pct,
       ROUND(100.0 * c.refused      / NULLIF(c.tickets, 0), 1) AS refused_per_100
FROM counts c
JOIN reps r ON r.id = c.rep_id
ORDER BY r.name;
```

**Walkthrough.** **`counts`** counts every kind of price change per rep in one pass;
the final `SELECT` turns the counts into shares. `NULLIF(c.changes, 0)` protects a rep
with no price changes yet from a divide-by-zero. `refused_per_100` counts the times the
store refused a price under the lowest it allows, per 100 tickets.

**Likely question.** *What would many refused prices tell a manager?* Either the rep
opens too low and runs into the floor, or the floor is set wrong for that store's
customers. The report shows the pattern; the manager finds out which.

#### U7. Scratchpad signals

**The business question.** Are reps trying prices without recording them, and how fast
do they get to a first price? Without logging keystrokes.

```sql
WITH ticket AS (
  SELECT ticket_id,
         MAX(CASE WHEN type = 'ticket_started'       THEN rep_id END)  AS rep_id,
         MIN(CASE WHEN type = 'ticket_started'       THEN at END)      AS started_at,
         MIN(CASE WHEN type = 'discount_applied'     THEN at END)      AS first_price_at,
         SUM(CASE WHEN type = 'discount_applied'     THEN 1 ELSE 0 END) AS changes,
         SUM(CASE WHEN type = 'offer_recorded'       THEN 1 ELSE 0 END) AS offers,
         SUM(CASE WHEN type = 'gm_calculator_opened' THEN 1 ELSE 0 END) AS gm_opens
  FROM events
  WHERE ticket_id IS NOT NULL
  GROUP BY ticket_id
)
SELECT r.name                                                 AS rep,
       COUNT(*)                                               AS tickets,
       ROUND(1.0 * SUM(t.changes) / COUNT(*), 1)              AS changes_per_ticket,
       ROUND(1.0 * SUM(t.offers) / COUNT(*), 2)               AS offers_per_ticket,
       ROUND(1.0 * SUM(t.changes) / NULLIF(SUM(t.offers), 0), 1) AS changes_per_offer,
       ROUND(AVG((julianday(t.first_price_at) - julianday(t.started_at)) * 24 * 60), 1) AS minutes_to_first_price,
       ROUND(100.0 * SUM(t.gm_opens) / COUNT(*), 1)           AS gm_opens_per_100
FROM ticket t
JOIN reps r ON r.id = t.rep_id
GROUP BY r.name
ORDER BY r.name;
```

**Walkthrough**

1. **`ticket`**: one row per ticket with when it started, the first price change
   (`MIN(CASE ...)`), and counts of price changes, recorded offers and GM calculator opens.
2. **Minutes to a first price**: `julianday()` turns a date and time into a number of
   days (with a fraction for the time), so the difference × 24 × 60 is minutes. `AVG`
   skips tickets with no price change (their first price time is `NULL`).
3. **`changes_per_offer`**: price changes ÷ offers actually recorded. A high number means
   many tries for each price said out loud: the scratchpad habit.

**Likely question.** *Why not log keystrokes?* It's noisy, heavy, and in a real
company it's employee monitoring that needs HR and legal review. Meaningful actions (a
discount applied, an offer recorded) answer the same question cleanly.

#### U8. Data quality

```sql
WITH store_count AS (
  SELECT rep_id, SUM(ups) AS customers
  FROM traffic
  GROUP BY rep_id
),
app_log AS (
  SELECT rep_id,
         SUM(CASE WHEN type = 'ticket_started' THEN 1 ELSE 0 END)                      AS tickets,
         SUM(CASE WHEN type = 'outcome_recorded' THEN 1 ELSE 0 END)                    AS recorded,
         SUM(CASE WHEN type = 'outcome_recorded' AND how = 'walked' THEN 1 ELSE 0 END) AS walked,
         SUM(CASE WHEN type = 'ticket_abandoned' THEN 1 ELSE 0 END)                    AS dropped
  FROM events
  GROUP BY rep_id
)
SELECT r.name                                                     AS rep,
       s.customers,
       a.recorded,
       ROUND(100.0 * a.recorded / s.customers, 1)                 AS seen_pct,
       s.customers - a.tickets                                    AS no_ticket,
       a.dropped,
       ROUND(100.0 * a.walked / NULLIF(a.walked + a.dropped, 0), 1) AS walkouts_recorded_pct
FROM store_count s
JOIN reps r ON r.id = s.rep_id
JOIN app_log a ON a.rep_id = s.rep_id
ORDER BY r.name;
```

**Walkthrough.** Per rep: customers counted, customers recorded (`seen_pct`), customers
with no ticket, tickets dropped, and **`walkouts_recorded_pct` = walked ÷ (walked +
dropped)**. Sales almost always get recorded (that's how a rep gets paid), so missing
records are mostly walk-outs.

**Likely question.** *Why does this report matter for the others?* Every sales and
pattern report only sees recorded customers. A rep who skips a quarter of their walk-outs
looks like a better closer than they are. This number tells you how much to trust the
rest.

### The offer_facts view

The Deal patterns reports all compare offers: how far below the asking price, what
happened to delivery, how much came off the base, whether the customer said yes. Instead
of repeating those joins in seven queries, they live once in a **view**:

```sql
CREATE VIEW offer_facts AS
WITH base_cut AS (
  -- The share taken off a discountable (not price-locked) adjustable base, per offer.
  SELECT l.offer_id, MAX(100.0 * l.discount_cents / l.list_cents) AS base_cut_pct
  FROM offer_lines l
  JOIN products p ON p.sku = l.sku
  WHERE p.category = 'adjustable-base' AND NOT l.locked AND l.list_cents > 0
  GROUP BY l.offer_id
)
SELECT o.id                                            AS offer_id,
       o.visit_id,
       v.rep_id,
       v.store_id,
       v.visited_on,
       o.step_no,                                      -- 0 = the asking price
       CASE WHEN o.accepted THEN 1 ELSE 0 END          AS accepted,
       CASE WHEN v.sold THEN 1 ELSE 0 END              AS bought,
       a.topline_cents                                 AS asking_cents,
       o.topline_cents,
       100.0 * (a.topline_cents - o.topline_cents) / a.topline_cents AS discount_pct,
       CASE WHEN o.delivery_tier_id IS NULL THEN 'pickup'
            WHEN o.delivery_list_cents = 0  THEN 'basic'    -- a tier that's always free
            WHEN o.delivery_price_cents = 0 THEN 'waived'   -- the rep made it free
            ELSE 'charged' END                         AS delivery,
       o.financing_months,
       b.base_cut_pct,                                 -- NULL = no discountable base
       o.commission_cents
FROM offers o
JOIN visits v ON v.id = o.visit_id
JOIN offers a ON a.visit_id = o.visit_id AND a.step_no = 0
LEFT JOIN base_cut b ON b.offer_id = o.id;
```

**Walkthrough**

1. **`base_cut`** finds, per offer, the share taken off an adjustable base the rep can
   discount (`NOT l.locked` skips price-locked ones).
2. The `SELECT` gives one row per offer, joined to its customer (`visits`) and to that
   customer's **asking-price offer** (`a`, step 0), so every offer knows its own discount
   from the asking price.
3. `CASE WHEN o.accepted THEN 1 ELSE 0 END` turns yes/no into 1 or 0 so reports can add
   them up. It's written that way so the same view works in SQLite and Postgres.

**Likely questions**

- *Why a view instead of a table?* A view stores the question, not the answers: it's
  worked out fresh every time, so it's never out of date with the offers it reads.
- *What does `security_invoker` do in the Postgres version?* The view runs with the
  reader's own access rules. Without it, a view runs as its owner and could let a rep read
  rows the access rules would hide.

### Deal pattern reports (Manager → Deal patterns)

**What they answer:** what happens with customers depending on what's offered. Managers
only. Each one carries the same warning, and it's worth being able to say plainly: **these are patterns, not proof.** Two reasons:

1. **Reverse cause.** Reps give bigger discounts to customers who are already wavering.
   So "bigger discounts" and "walked" can go together without the discount causing it.
2. **Who hears what.** A customer who walks hears every offer on the ladder; a customer
   who buys early hears one or two. So walk-outs see deeper offers.

A real company settles a question like "does free delivery win big tickets?" with a
**controlled test**: free delivery for a random half of big tickets for a month, then
compare. These reports tell you which tests are worth running.

Two choices run through all of them:

- **Offers or customers?** Discount size, the base and delivery change from one offer to
  the next, so those reports count **offers** and ask what share got a yes. Financing is on
  the ticket from the start, so that report counts **customers** and asks what share
  bought.
- **"Too few to trust."** A group with under 30 rows says so. 3 yeses out of 5 is 60%, but
  it means almost nothing.

#### P1. Offers accepted by discount size

```sql
SELECT CASE WHEN discount_pct < 10 THEN 'Under 10%'
            WHEN discount_pct < 15 THEN '10–15%'
            WHEN discount_pct < 20 THEN '15–20%'
            WHEN discount_pct < 30 THEN '20–30%'
            ELSE '30% or more' END                    AS discount,
       COUNT(*)                                       AS offers,
       SUM(accepted)                                  AS accepted,
       ROUND(100.0 * SUM(accepted) / COUNT(*), 1)     AS accepted_pct,
       CASE WHEN COUNT(*) < 30 THEN 'too few to trust' END AS note
FROM offer_facts
WHERE step_no > 0
GROUP BY discount
ORDER BY MIN(discount_pct);
```

**Walkthrough.** Every offer after the asking price (`step_no > 0`), sorted into bands by
`CASE`, then counted per band. `SUM(accepted)` counts the yeses (accepted is 1 or 0).
`ORDER BY MIN(discount_pct)` puts the bands in order.

**Likely question.** *Deeper offers get more yeses here. Does that mean discount
more?* No: deeper offers come later in a negotiation, often as the last one, so depth and
timing are mixed up. It says nothing about whether the customer would have bought at less.

#### P2. Offers accepted by how much came off the base

```sql
SELECT CASE WHEN base_cut_pct < 15 THEN 'Under 15% (or none)'
            WHEN base_cut_pct < 35 THEN '15–35%'
            ELSE '35% or more' END                    AS off_the_base,
       COUNT(*)                                       AS offers,
       SUM(accepted)                                  AS accepted,
       ROUND(100.0 * SUM(accepted) / COUNT(*), 1)     AS accepted_pct,
       CASE WHEN COUNT(*) < 30 THEN 'too few to trust' END AS note
FROM offer_facts
WHERE step_no > 0 AND base_cut_pct IS NOT NULL
GROUP BY off_the_base
ORDER BY MIN(base_cut_pct);
```

**Walkthrough.** Same shape, only offers on tickets with a discountable base
(`base_cut_pct IS NOT NULL`). What to look for: if "15–35%" and "35% or more" get yeses
at about the same rate, the deeper cut gives up commission for no extra sales.

#### P3. Offers accepted by delivery, big tickets vs small

```sql
SELECT CASE WHEN asking_cents >= 250000 THEN 'Big ($2,500+)' ELSE 'Under $2,500' END AS ticket,
       CASE delivery WHEN 'waived'  THEN 'Free (waived)'
                     WHEN 'charged' THEN 'Charged'
                     WHEN 'basic'   THEN 'Basic tier (always free)'
                     ELSE 'Took it home' END          AS delivery_on_offer,
       COUNT(*)                                       AS offers,
       ROUND(100.0 * SUM(accepted) / COUNT(*), 1)     AS accepted_pct,
       CASE WHEN COUNT(*) < 30 THEN 'too few to trust' END AS note
FROM offer_facts
WHERE step_no > 0
GROUP BY ticket, delivery_on_offer
ORDER BY ticket, accepted_pct DESC, delivery_on_offer;
```

**Walkthrough.** `GROUP BY ticket, delivery_on_offer` gives one row per combination of
ticket size and what happened to delivery (waived, charged, the always-free basic tier,
or taken home). `CASE delivery WHEN 'waived' THEN ...` is the short form of CASE: compare
one column against several values.

#### P4. Close rate by financing term

```sql
SELECT CASE WHEN financing_months IS NULL THEN 'None'
            WHEN financing_months < 36 THEN CAST(financing_months AS TEXT) || ' months'
            ELSE '36 months or more' END              AS financing,
       COUNT(*)                                       AS customers,
       SUM(bought)                                    AS bought,
       ROUND(100.0 * SUM(bought) / COUNT(*), 1)       AS close_pct,
       CASE WHEN COUNT(*) < 30 THEN 'too few to trust' END AS note
FROM offer_facts
WHERE step_no = 0
GROUP BY financing
ORDER BY MIN(COALESCE(financing_months, 0));
```

**Walkthrough.** `step_no = 0` keeps one row per customer (their asking-price row), so
each customer counts once. `CAST(financing_months AS TEXT) || ' months'` turns 6 into the
words "6 months". Terms of 36 months and longer are grouped because each has only a few
customers.

#### P5. What changed after a "no"

```sql
WITH last_step AS (
  SELECT visit_id, MAX(step_no) AS step_no
  FROM offer_facts
  GROUP BY visit_id
)
SELECT CASE WHEN l.bought = 1 THEN 'Bought on a later offer' ELSE 'Walked anyway' END AS outcome,
       COUNT(*)                                                      AS customers,
       ROUND(AVG(l.discount_pct - f.discount_pct), 1)                AS extra_discount_pts,
       ROUND(100.0 * SUM(CASE WHEN f.delivery = 'charged' AND l.delivery = 'waived' THEN 1 ELSE 0 END) / COUNT(*), 1)
                                                                     AS delivery_made_free_pct,
       ROUND(100.0 * SUM(CASE WHEN l.base_cut_pct > f.base_cut_pct THEN 1 ELSE 0 END) / COUNT(*), 1)
                                                                     AS more_off_base_pct
FROM offer_facts f
JOIN last_step s   ON s.visit_id = f.visit_id
JOIN offer_facts l ON l.visit_id = f.visit_id AND l.step_no = s.step_no
WHERE f.step_no = 1
  AND f.accepted = 0
  AND l.step_no > 1
GROUP BY outcome
ORDER BY outcome;
```

**Walkthrough**

1. **`last_step`**: each customer's highest offer number.
2. `f` is each customer's **first** offer, `l` their **last**: two copies of the same
   view, joined on the customer.
3. `WHERE` keeps customers who said no to offer 1 (`f.accepted = 0`) and heard at least
   one more (`l.step_no > 1`).
4. Then, for buyers vs walk-outs: how much deeper the last offer was, how often delivery
   went from charged to free, how often more came off the base.

**Likely question.** *Walk-outs got more off the base than buyers. Do base discounts
drive customers away?* No: walk-outs hear the whole ladder before leaving, so their last
offer is the deepest one. It's the clearest example in the app of why a pattern isn't
proof.

#### P6. Commission given up to discounting

```sql
SELECT r.name                                                      AS rep,
       COUNT(*)                                                    AS sales,
       ROUND(SUM(a.commission_cents) / 100.0, 2)                   AS commission_at_asking,
       ROUND(SUM(d.commission_cents) / 100.0, 2)                   AS commission,
       ROUND(SUM(a.commission_cents - d.commission_cents) / 100.0, 2) AS given_up,
       ROUND(100.0 * SUM(a.commission_cents - d.commission_cents) / SUM(a.commission_cents), 1) AS given_up_pct,
       ROUND(SUM(a.commission_cents - d.commission_cents) / 100.0 / COUNT(*), 2) AS given_up_per_sale
FROM deals d
JOIN offers a ON a.visit_id = d.visit_id AND a.step_no = 0
JOIN reps r   ON r.id = d.rep_id
GROUP BY r.name
ORDER BY given_up_pct DESC, rep;
```

**Walkthrough.** Each sale's asking-price row (step 0) already holds the commission the
engine worked out at the asking price. So the query just joins it and subtracts:
**given up = commission at asking − commission earned.** The money math stays in the
engine; the query only adds and subtracts what the engine saved.

**Likely question.** *Is the rep at the top doing something wrong?* Not necessarily:
some discounting wins sales that would otherwise walk. It shows who discounts deepest.
Put it next to their conversion before drawing a conclusion.

#### P7. Offered vs sold, by product type

```sql
WITH offered AS (
  SELECT p.category, COUNT(DISTINCT o.visit_id) AS customers
  FROM offers o
  JOIN offer_lines l ON l.offer_id = o.id
  JOIN products p    ON p.sku = l.sku
  WHERE o.step_no = 0
  GROUP BY p.category
),
sold AS (
  SELECT p.category,
         COUNT(DISTINCT d.visit_id)  AS customers,
         SUM(dl.discount_cents)      AS discount_cents,
         SUM(dl.list_cents)          AS list_cents
  FROM deals d
  JOIN deal_lines dl ON dl.deal_id = d.id
  JOIN products p    ON p.sku = dl.sku
  GROUP BY p.category
)
SELECT o.category,
       o.customers,
       COALESCE(s.customers, 0)                                   AS bought,
       ROUND(100.0 * COALESCE(s.customers, 0) / o.customers, 1)   AS close_pct,
       ROUND(100.0 * s.discount_cents / s.list_cents, 1)          AS discount_pct
FROM offered o
LEFT JOIN sold s ON s.category = o.category
ORDER BY o.customers DESC, o.category;
```

**Walkthrough.** **`offered`** counts, per category, the customers whose asking-price
ticket had one; **`sold`** counts the customers who bought one, and the discount on those
items. `COUNT(DISTINCT ...visit_id)` counts customers, not items (two pillows on one
ticket is still one customer). LEFT JOIN, so a category nobody bought still shows.

### The Postgres version

The same tables also run in **Postgres**, in a local Supabase in Docker
([docs/database.md](database.md)). Postgres is stricter: real dates and true/false
columns, CHECK rules, row-level security. Ten of the twenty-two reports need a
Postgres version (in `src/db/queries/postgres/`); each starts with a note saying what's
different. The differences are small:

| To get | SQLite | Postgres |
|---|---|---|
| The month of a date | `substr(visited_on, 1, 7)` | `to_char(visited_on, 'YYYY-MM')` |
| The Monday of a date's week | `date(day, '-6 days', 'weekday 1')` | `CAST(date_trunc('week', day) AS DATE)` |
| Minutes between two times | `(julianday(b) - julianday(a)) * 24 * 60` | `EXTRACT(EPOCH FROM b - a) / 60` |
| Count yes/no flags | `SUM(attach)` | `SUM(CASE WHEN attach THEN 1 ELSE 0 END)` |
| A true/false test | `dl.locked = 1` | `dl.locked` |
| One value out of JSON | `json_extract(settings_json, '$.exceptionMarginBp')` | `(settings_json ->> 'exceptionMarginBp')::int` |

**Likely questions**

- *Why two databases?* The public demo has to run with no server (GitHub Pages can't run
  a database), so it uses SQLite inside the browser. A real company would use a database
  server; Postgres in Supabase is that, and moving it to a hosted Supabase is a change of
  address, not a rebuild.
- *How do you know the two give the same answers?* A test runs every report on both and
  compares every value. Now and then an average rounds 0.01 apart (Postgres rounds exact
  decimals, SQLite binary fractions); everything else matches exactly.
- *Tell me about a performance problem.* One report took over a minute on Postgres right
  after the data was loaded, and 47 milliseconds a minute later. Postgres plans a query
  from statistics about each table, and freshly loaded tables had none yet. Running
  `ANALYZE` after loading fixed it.
- *Why did loading the data into Postgres matter?* Postgres checks every reference and
  rule as rows go in. All 58,000 rows passed on the first try, which is evidence the
  demo data is consistent, not just plausible.
