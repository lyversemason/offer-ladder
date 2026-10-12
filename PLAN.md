# OfferLadder: plan

Written 2026-10-11, before any code. Update this file whenever a decision changes, and
log the change in CHANGELOG.md.

## Where we left off

- 2026-10-11: scope agreed with Mason (see "Decisions"). v0.1.0 = this plan + repo.
- v0.2.0: engine done (82 tests). v0.3.0: demo catalog, default rules, guard (91 tests).
- v0.4.0: rep view (deal, readout, ladder, target), clicked through on desktop and phone
  width. v0.5.0: manager rules. v0.6.0: SQL layer (schema, history, 7 reports, SQL
  guide). v0.7.0: saving deals, Reports, Catalog import, Query lab (184 tests).
- v0.8.0: README + screenshots + SQL guide Part 4 (178 tests). NOT public yet: no GitHub
  repo, no live link. Next: Mason reviews it (screen and voice memo rounds); when he says
  it's ready →
  create public repo lyversemason/offer-ladder, enable Pages, push, v1.0.0.
- 2026-10-12: Mason reviewed v0.8.0 and changed the order: (1) catalog from his real 2025
  lineup, disguised, (2) a quick math check, (3) a point-of-sale-style ticket redesign
  (SKU entry with autocomplete, product lookup, browsable inventory), (4) his
  screen-recording review, (5) his negotiation logic.
- v0.9.0: step 1 done (238 items, real rules, outlet, pairing rule, per-model locks;
  188 tests).
- v0.10.0: Mason's answers: floor = make money; ladder's final offer at 20%; pickup; an
  Optima Extra Firm replaces Georgia's Extra Firm (239 items). Step 2, the math check:
  four deals worked by hand matched the app to the cent; waiting on Mason to confirm
  four method questions (does the delivery charge count in price and gross; financing
  changes gross before the tier; the base bonus on the whole ticket; margin shown rounded
  down). Next: step 3, the point-of-sale ticket redesign.

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

## Decisions (Mason, 2026-10-12): the catalog mirrors a real lineup

| Decision | Answer |
|---|---|
| Catalog | Modeled on Mason's real 2025 showroom lineup (42 models he picked, all their sizes): real sizes, real price-locked lines, real price-to-cost relationship. Brands, model names, SKUs and every dollar amount are disguised (the method is private, never in the repo) |
| Prices | The everyday selling price, never the "regular"/MSRP price ("retail creating value") |
| Conditions | New and outlet (pre-owned). No floor or display models. Pillows, sheets and protectors are never outlet pieces. An outlet piece is priced 20% off new and can never sell for more than that |
| Cost rule | One item may sell below its cost, even free (free pillows, sheets, even a base); only the whole ticket has to make money |
| Price-locked | Guardian and Bakersville mattresses; the Calm, Silent and Grand Orbit bases. Not the Soft Eclipse base, not accessories |
| Pairing rule | A Guardian mattress only goes on a Guardian foundation or base; any mattress can go on a Guardian one; no rule for Bakersville |
| Item code | The model's SKU plus a size code (`365927-Q`): every size shares the SKU, as on the vendor's cost sheet |
| Commission | Top 47.5%+ pays 18%, middle 43–47.49% pays 14%, low pays 10%; +3 points with an adjustable base |
| Delivery | Silver (free), Gold, Platinum, Diamond; the store's delivery cost is the same on every tier, free included |
| Financing | Mason's real 72-hour-sale chart, 6–72 months, disguised like the prices |

## Hard rules

- **Fresh code and disguised data only.** Never the real retailer's name, real brands,
  real product names, real SKUs or real dollar amounts, and never how they were disguised.
  (Until 2026-10-12 everything was invented; see the 2026-10-12 decisions.) A test fails
  the build if any real name appears anywhere in the repo (the test stores fingerprints of
  the names, not the names themselves).
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
4. **Condition changes cost**: the same item can be sold new or as an outlet piece, at a
   lower cost. Outlet pieces are a real margin lever.
5. **Delivery** is a fixed-price service with tiers.
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
  full price; discounted delivery; outlet pieces; financing terms.
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
- **Line cost** = the unit cost for the chosen condition (new / outlet) × qty.
- **Topline** = sum of line prices (pre-tax).
- **Gross $** = topline − line costs − delivery cost + financing adjustment.
- **Margin %** = gross $ ÷ topline.
- **Tier** = the first tier whose minimum margin the deal meets (top, middle, low).
  Below the low tier's minimum is **below the floor**: blocked in the rep view. Since
  2026-10-12 the floor is just above break-even (0.01%): any sale that makes money is
  allowed, break-even or a loss is blocked. Shown as
  "needs manager approval".
- **Commission $** = gross $ × the tier's rate (+ the attach bonus points if the bundle has
  an item in the attach category).
- **The discount formula**: if every cut comes off the price (costs stay the same), the
  biggest bundle discount that keeps margin at or above a target t is
  **D = (gross − t × topline) ÷ (1 − t)**. Every lever that only moves price (discount the
  mattress, half-off pillows, cheaper delivery) lands on the **same lowest bundle price**;
  what changes is how the customer hears it. Only levers that change cost or gross
  (outlet pieces, financing, adding full-price add-ons) move that price. The app says so.
- **Nice prices**: offers are rounded to whole $10 for the bundle, rounded **up** so
  rounding never pushes a deal below its target. Then the engine re-checks the result.
- **Spreading a bundle discount** across lines: only items that aren't price-locked, in
  proportion to each one's room above its own cost. (The suggestions stop each item at its
  cost; the rule only needs the whole ticket to make money. When to give an item away is
  part of Mason's negotiation logic.)

## Demo rules (manager can change all of them)

Since 2026-10-12 these follow Mason's real 2025 rules, with dollar amounts disguised like
the catalog's (`src/data/settings.ts` has the exact values).

| Setting | Demo value |
|---|---|
| Top tier | margin ≥ 47.5% → 18% of gross $ |
| Middle tier | 43% to 47.49% → 14% |
| Low tier | 0.01% to 42.99% → 10% |
| Margin floor | Just above break-even (0.01%): Mason's district rule was "make the sale as long as it makes money, even $1". Break-even or a loss is blocked |
| Final offer | The offer ladder stops suggesting lower prices at 20% margin (Mason: "realistically, 20%") |
| Attach bonus | +3 points in every tier when the sale has an adjustable base |
| Minimum offer step | $120 or 5% of the current price, whichever is larger. Placeholder: it will come from Mason's negotiation recordings |
| Delivery cost to the store | The same on every delivery, free ones included |
| Delivery tiers | Silver (free), Gold, Platinum, Diamond. Reps may make any delivery free; the store's delivery cost still comes out of gross. Pickup costs the store and the customer nothing |
| Bundle deals | Still invented: second pillow half off; protector 25% off with a mattress; foundation half off with a mattress |
| Financing | Mason's chart: 12 amount bands × terms of 6–72 months; short terms add gross, long terms subtract; gray cells aren't offered |
| Price-locked | Guardian and Bakersville mattresses; the Calm, Silent and Grand Orbit bases |
| Pairing | A Guardian mattress only on a Guardian foundation or base |

### Answered 2026-10-12
- Floor: make money, even $1 (district rule). Final offer: 20%.
- Minimum step and the rest of the negotiation logic: Mason will record himself playing
  salesperson and customer through many scenarios, building tickets the way he did at the
  store and talking through his thinking (and the customer's). Infer the rules from those
  recordings; don't build test logic for it.
- Free delivery is allowed (the delivery cost still counts); pickup costs nothing.
- Any mattress, Guardian included, can be sold alone (no base or foundation).
- Georgia's Extra Firm is replaced by an Optima Extra Firm model (Mason's choice; its
  prices were set by Mason).
- The narrow middle tier is fine: in practice, 47.5% → 43% already covers a lot of
  discount.

## What it does

### Rep view (phone first)
- **Build a deal**: search the catalog (brand, model, size, SKU), pick the condition (new
  or outlet), choose a delivery tier and a financing term.
- **Live readout**: customer price, discount, gross $, margin %, tier, commission $, and
  how far to the next tier up or down.
- **Offer ladder**: opening top-tier offer → middle-tier offers → final low-tier offer.
  Each step shows the customer's price, what they save, the rep's commission, and the
  commission given up since the last step ("$300 more off costs you only $28").
- **Target**: "stay in the middle tier": the lowest bundle price that holds it and 2–3
  ways to present it, plus the levers that would go lower (outlet piece, financing,
  full-price add-on).
- **Rule checks**: a price-locked item can't be discounted; a step smaller than the
  minimum gets a plain warning; a ticket that breaks even or loses money is blocked (one
  item alone may go below cost or be free); a
  Guardian mattress on another brand's foundation or base is blocked.
- **Record the outcome**: sold at offer N / walked. Saved deals go into the database.

### Manager view
- **Rules**: tiers, rates, attach bonus, floor, minimum step, delivery tiers, bundle deals,
  financing chart, price-locked models. The rep view uses them at once.
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
- 239 catalog rows (42 models in their real sizes, eight brands): mattresses, foundations,
  adjustable bases, a platform frame, pillows, protectors, sheets.
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
| v0.5.0 | Manager rules view | ✓ |
| v0.6.0 | SQLite: schema, saving deals, demo history, the 7 reports, "Show the SQL" | ✓ |
| v0.7.0 | Vendor import + query lab | ✓ |
| v0.8.0 | Polish, demo guide, README, screenshots, SQL-GUIDE.md | ✓ (review rounds next) |
| **v1.0.0** | Public repo + live Pages link | Mason says it's worthy |

## Edge cases the tests must cover

Empty deal; a deal of only price-locked items; a target already met at list price; a
target that can't be reached even at cost; $0 items (free Silver delivery); rounding
right at a tier line; financing band edges; a financing term not offered at that amount;
an offer step smaller than the minimum; outlet cost; quantity > 1 with a bundle deal;
attach bonus present/absent; settings with tiers out of order (rejected).
