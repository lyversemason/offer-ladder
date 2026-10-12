# OfferLadder: plan

Written 2026-10-11, before any code. Update this file whenever a decision changes, and
log the change in CHANGELOG.md.

## Where we left off

- 2026-10-11: scope agreed with Mason (see "Decisions"). v0.1.0 = this plan + repo.
- v0.2.0: engine done (82 tests). v0.3.0: demo catalog, default rules, guard (91 tests).
- v0.4.0: rep view (deal, readout, ladder, target), clicked through on desktop and phone
  width. The SQL layer is being built on a separate branch. Next: v0.5.0 manager rules.

## Commander's intent

A public rebuild and expansion of the commission and negotiation calculator Mason built
as a salesperson and assistant manager at a mattress and furniture retailer (7 reps across
2 stores used it).

The sales-ops story in one sentence: **managers set the pricing and commission rules,
reps negotiate inside them with the math done for them, and every deal lands in a SQL
database that the reports read.**

Quality bar: no public launch until it's worth showing. v1.0.0 (public launch)
includes the calculator, the SQL reports and the data-cleaning import. No half-finished
screens in the public version.

## Decisions (Mason, 2026-10-11)

| Decision | Answer |
|---|---|
| Name | **OfferLadder** |
| Who writes the SQL? | Claude writes it; Mason reads and can explain every query (`docs/SQL-GUIDE.md` walks through each one). Described as "built on SQL", never "hand-wrote SQL" |
| Financing | Include it. In the original chart, a green amount was **added** to the sale's gross dollars and a red amount was **subtracted**, depending on the amount financed and the term |
| Vendor data-cleaning import | Include it (v1.0.0) |

## Hard rules

- **Fresh code and made-up data only.** Never the real retailer's name, real brands, real
  costs, prices, margins, commission rates or financing numbers. A test fails the build if
  any real name appears anywhere in the repo (the test stores fingerprints of the names,
  not the names themselves).
- The store is fictional: **Lantern Lane Home**, two stores (Riverside and Hillcrest),
  7 fictional reps, fictional brands.
- Public GitHub repo `lyversemason/offer-ladder` + a live demo on GitHub Pages, no login
  (a role switch: Rep / Manager).
- Spec first (this file), README with a worked example, tests on all money math and every
  rule, CHANGELOG + version tags, deploy only when tests pass, versioning rule below.
- Works on a phone (reps use it next to the customer).
- Click through it in a real browser as a rep and as a manager before calling a version
  done.

## What the original taught us (from Mason's old notes, 2026-10-11)

These are the mechanics of the real job, rebuilt here with invented numbers:

1. **Commission is a percent of gross profit dollars**, not of the sale price. The margin
   tier picks the rate; the rate is paid on (price − cost). So a discount hits the rep
   twice: a lower rate, on fewer dollars.
2. **Attach bonus**: having an adjustable base in the sale raised the rate in every tier.
3. **Delivery cost** comes out of gross dollars.
4. **Condition changes cost**: the same item can be sold new, as a floor model or as
   clearance, each with its own cost. Floor models are a real margin lever.
5. **Services** (delivery tiers, protection plans) are fixed-price items with no size or
   condition.
6. **Financing** adds or subtracts gross dollars by amount financed × term.
7. **The data job**: the original needed a messy vendor cost report (merged cells, blank
   columns, missing retail prices, abbreviations, "do not use" rows) cleaned into one
   table. That becomes the import feature.
8. **The KPIs** from Mason's commission tracker: orders, ups (customers helped),
   conversion %, average order value, adjustable-base attach %, average margin, comp %.
   Those become the SQL reports.
9. The original was a custom GPT with strict rules: exact product matching, never guess,
   ask when unsure. The rebuild keeps that spirit as hard checks in code.

## How Mason negotiates (the logic built in)

- Commission tiers follow margin: **top**, **middle** (a wide band), **low**.
- One offer usually keeps the rep in the top tier. The second offer, a real discount,
  drops into the middle tier. Because the middle band is wide, a third significant
  discount costs only a little more commission; the app shows that difference in dollars.
  Dropping into the low tier is the final offer.
- **Never lowball**: each step must be a meaningful discount (a configurable minimum step).
- Levers: discount the main item; bundle deals (e.g. second pillow half off); add-ons at
  full price; discounted delivery; floor models; financing terms.
- Some premium lines are **price-locked**: the item can't be discounted, so the margin has
  to come from the rest of the bundle.
- "I want to sell all of this and stay in the middle tier": the app prices the bundle and
  shows a few ways to get there.

## The math, defined once

All money is stored as **whole cents** (integers), never as decimals, so $0.10 + $0.20 is
always exactly $0.30. Percents are stored as **basis points** (1 bp = 0.01%, so 50% =
5,000 bp) for the same reason.

For one deal:

- **Line price** = the negotiated unit price × quantity (after any bundle deal).
- **Line cost** = the unit cost for the chosen condition (new / floor / clearance) × qty.
- **Topline** = sum of line prices (pre-tax).
- **Gross $** = topline − line costs − delivery cost + financing adjustment.
- **Margin %** = gross $ ÷ topline.
- **Tier** = the first tier whose minimum margin the deal meets (top, middle, low).
  Below the low tier's minimum is **below the floor**: blocked in the rep view, shown as
  "needs manager approval".
- **Commission $** = gross $ × the tier's rate (+ the attach bonus points if the bundle has
  an item in the attach category).
- **The discount formula**: if every cut comes off the price (costs stay the same), the
  biggest bundle discount that keeps margin at or above a target t is
  **D = (gross − t × topline) ÷ (1 − t)**. Every lever that only moves price (discount the
  mattress, half-off pillows, cheaper delivery) lands on the **same lowest bundle price**;
  what changes is how the customer hears it. Only levers that change cost or gross
  (floor models, financing, adding full-price add-ons) move that price. The app says so.
- **Nice prices**: offers are rounded to whole $10 for the bundle, rounded **up** so
  rounding never pushes a deal below its target. Then the engine re-checks the result.
- **Spreading a bundle discount** across lines: only items that aren't price-locked, in
  proportion to each one's room above its own cost; never below cost.

## Made-up numbers (manager can change all of them)

| Setting | Demo value |
|---|---|
| Top tier | margin ≥ 50% → 15% of gross $ |
| Middle tier (wide) | 40% to 49.99% → 11% |
| Low tier | 34% to 39.99% → 7% |
| Margin floor | 34% (below = needs manager approval) |
| Attach bonus | +2 points in every tier when the sale has an adjustable base |
| Minimum offer step | $100 or 5% of the current price, whichever is larger |
| Delivery cost to the store | $45 per delivery |
| Delivery tiers (customer price / lowest a rep may go) | Curbside $0 / $0; Room of choice $99 / $49; White glove $149 / $79; White glove + base setup $199 / $99 |
| Bundle deals | Pillows: second one 50% off. Protector 25% off with any mattress. |
| Financing | A made-up chart: bands of amount financed × terms (6–60 months); short terms add a little gross, long terms subtract; some terms need a minimum amount |
| Price-locked | The "Kestrel" premium line |

## What it does

### Rep view (phone first)
- **Build a deal**: search the catalog (brand, model, size), pick the condition, add
  services, choose a delivery tier and a financing term.
- **Live readout**: customer price, discount, gross $, margin %, tier, commission $, and
  how far to the next tier up or down.
- **Offer ladder**: opening top-tier offer → middle-tier offers → final low-tier offer.
  Each step shows the customer's price, what they save, the rep's commission, and the
  commission given up since the last step ("$300 more off costs you only $28").
- **Target**: "stay in the middle tier": the lowest bundle price that holds it and 2–3
  ways to present it, plus the levers that would go lower (floor model, financing,
  full-price add-on).
- **Rule checks**: a price-locked item can't be discounted; a step smaller than the
  minimum gets a plain warning; below the floor is blocked; below cost is blocked.
- **Record the outcome**: sold at offer N / walked. Saved deals go into the database.

### Manager view
- **Rules**: tiers, rates, attach bonus, floor, minimum step, delivery tiers, bundle deals,
  financing chart, price-locked lines. The rep view uses them at once.
- **Reports** (SQL): each report is a `.sql` file with a plain-English header, and the
  screen has a "Show the SQL" button.
- **Catalog import**: upload a messy vendor cost sheet (a sample is included); SQL cleans
  it step by step and flags rows it can't trust; the manager approves before the catalog
  changes.
- **Query lab**: run read-only `SELECT` queries on the demo data, with example queries.

### Reports (built on SQL)
1. Rep scorecard by month (Mason's tracker): ups, orders, conversion %, topline, average
   order value, average margin, attach %, commission, comp %.
2. Store comparison.
3. Tier mix: share of sales in each tier, by rep.
4. Offers per sale: at which ladder step deals close.
5. Attach rate trend.
6. Premium (price-locked) line share by rep, and the margin of those bundles.
7. Exceptions: deals that hit the floor or needed approval.

### Demo data
- About 60 catalog rows: mattresses (several brands and sizes), foundations, adjustable
  bases, pillows, protectors, sheets, delivery tiers, protection plans.
- Six months of history for 7 reps across 2 stores, generated with a fixed random seed (the
  same every load, so tests can check exact numbers). Reps differ on purpose (one attaches
  bases well, one discounts too early) so the reports tell a story.

## What it does NOT do (on purpose)

No logins, server, sync between devices, AI chat or taxes. Nice later: a manager approval
inbox, a printable quote, share-a-deal-by-link.

## Stack (same as SoccerSessions)

| Piece | Choice | Why, in plain terms |
|---|---|---|
| Language | TypeScript | Types catch mistakes like mixing up cents and dollars before the app runs |
| Screens | React + Vite | The standard way to build interactive pages; Vite builds it |
| Database | SQLite in the browser (sql.js) | A real SQL database compiled to run inside the web page. No server, and the same queries run in the tests |
| Tests | Vitest | Hundreds of "given this deal, the commission must be exactly X" checks, plus every report checked against known numbers |
| Lint | oxlint | Catches sloppy code |
| Deploy | GitHub Actions → GitHub Pages | Every push runs all checks; it only deploys when they pass |
| Screenshots / click-through | Playwright | A robot browser for README screenshots and smoke checks |

## Architecture: three layers

```
src/engine/     the money math only: no screens, no database.
                pricing, tiers, commission, rules, ladder, target solver
                → the most heavily tested part; bugs here would cost real money
src/db/         schema.sql, the SQLite setup, queries/*.sql (one file per report),
                import/*.sql (the cleaning steps)
src/ui/         the screens. They call the engine and never do money math themselves
src/data/       the fake catalog, default rules, the deal-history generator,
                the messy sample vendor file
```

Like a fire team: each layer has one job. The engine can be tested fully on its own, the
screens can be redesigned without risking a wrong commission, and the reports only read
saved deals. A saved deal keeps a **snapshot** of its totals and the rates used (the way
real payroll does), so changing a rate later doesn't rewrite last month's commissions.

### Database tables (draft)
`stores`, `reps`, `products`, `visits` (every customer helped: an "up"), `deals`,
`deal_lines`, `offers` (every rung offered, and which one closed), `settings_history`,
plus `vendor_raw` / `vendor_clean` / `vendor_issues` for the import.

## Milestones

| Version | What | Done when |
|---|---|---|
| v0.1.0 | This plan, repo | ✓ |
| v0.2.0 | Engine + tests: pricing, tiers, commission, attach, delivery, financing, rules, discount formula, ladder, target | ✓ 82 tests |
| v0.3.0 | Fake catalog + default rules + the real-names guard test | ✓ |
| v0.4.0 | Rep view: build a deal, readout, ladder, target, rule checks; phone layout | ✓ |
| v0.5.0 | Manager rules view | Changing a rule changes the rep view |
| v0.6.0 | SQLite: schema, saving deals, demo history, the 7 reports, "Show the SQL" | Each report tested against known numbers |
| v0.7.0 | Vendor import + query lab | Sample file cleans with the expected flags |
| v0.8.0 | Polish, demo guide, README, screenshots, SQL-GUIDE.md | Mason's review rounds |
| **v1.0.0** | Public repo + live Pages link | Mason says it's worthy |

## Edge cases the tests must cover

Empty deal; a deal of only price-locked items; a target already met at list price; a
target that can't be reached even at cost; $0 items (free curbside delivery); rounding
right at a tier line; financing band edges; a financing term not offered at that amount;
an offer step smaller than the minimum; floor-model cost; quantity > 1 with a bundle deal;
attach bonus present/absent; settings with tiers out of order (rejected).
