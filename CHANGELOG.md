# Changelog

Every version is tagged in git (`vX.Y.Z`). To restore one, check out its tag and commit it
as a new version; history is never rewritten.




## v0.16.1 (2026-11-01 22:05 ET): Never stuck on "Loading the database"

- If the browser's storage doesn't answer within 4 seconds, the app stops waiting: it
  builds the demo fresh for this visit and says so in a notice at the top. Before, it
  waited forever (seen when a second copy of Chromium was still running in the background
  and held the storage lock).
- While storage isn't answering, nothing is saved, so a good saved copy (with the deals
  recorded in this browser) is never overwritten by a fresh demo. Same if reading the
  saved copy fails.
- The app keeps one storage connection for the whole visit instead of opening a new one
  for every save.
- Tests: 3 new for the time limit (262). Browser check: storage that never answers loads
  in about 5 seconds with the notice; normal storage still keeps a recorded customer
  after a reload.
- Restore this if: recorded deals stop being kept between visits; restoring v0.16.0 brings
  back the old loading (which can wait forever).

## v0.16.0 (2026-11-01 21:45 ET): Usage tab for managers

- Usage tracking, phase 3 of docs/usage-plan.md. New **Manager → Usage** tab: is the app
  being used, and how?
- Four tiles for the latest month with a store count: coverage (customers with a ticket ÷
  the store's own count of customers), reps using it, tickets with an outcome recorded,
  and dropped tickets, each with the change from the month before.
- Eight reports, each a plain `.sql` file in `src/db/queries/usage/` with a plain-English
  header, and **Show the SQL** like the sales reports: the company by month, each store by
  week, coverage by rep and month, what happens to each ticket, how items get on the
  ticket, how prices get changed, scratchpad signals (prices tried vs offers recorded,
  minutes to a first price, GM calculator opens), and data quality (how much of each
  rep's floor the reports can see, and how many walk-outs go unrecorded).
- The Reports and Usage tabs share one report browser. Report columns show "SKU" and "GM"
  in capitals.
- 28 new tests: every usage report adds up against the raw tables, and each planted habit
  shows where it should (259 tests).
- Restore this if: the Usage tab shows wrong numbers or breaks the Reports tab; restoring
  v0.15.0 removes the tab and keeps all the data.

## v0.15.0 (2026-11-01 16:30 ET): Six months of usage history

- Usage tracking, phase 2 of docs/usage-plan.md. The demo history now includes what the
  app would have recorded: every offer line by line, the usage events of each ticket
  (about 30,000), and the store's own count of customers per rep per day.
- Each rep has tool habits (src/data/habits.ts): how often they use the app, whether they
  record walk-outs and offers, how they add items and type discounts, how they build an
  offer (free delivery first, base first, or across the ticket), scratchpad price-trying,
  refused prices. Sofia, the new hire, moves from Look up to typed SKUs and uses the app
  more each month.
- Customers react to what's offered (planted on purpose, listed in the plan): free
  delivery on big tickets and 6-month financing make a sale more likely; base discounts
  help from 15% but add nothing past 35%.
- Some customers are now helped without the app and some walk-outs aren't recorded, so the
  existing reports count customers recorded in the app (the scorecard note says so). Every
  rep's story in the reports is unchanged.
- The demo database rebuilds once in each browser (new history).
- Restore this if: the new history breaks the reports; v0.14.0 has the old history.
## v0.14.0 (2026-11-01 15:54 ET): The app records how it's used

- Usage tracking, phase 1 of docs/usage-plan.md. Each meaningful thing a rep does is saved
  in a new `events` table: items added (and whether by SKU, name search, Look up or
  Inventory), discounts (dollars, percent or a new price; on a line, the whole ticket or
  delivery), removals, delivery, financing, reasons, refused prices, offers, outcomes,
  tickets dropped without an outcome, and the GM calculator, Inventory and Look up being
  opened. Never keystrokes. Rows can only be added; the database refuses changes and
  deletes. Each row knows the sitting (a new one after 30 quiet minutes) and the
  customer's ticket.
- Every offer is now saved line by line (`offer_lines`): each item's price, cost and how
  its discount was entered, plus delivery, financing and the discount reasons
  (`offer_reasons`). Before, only the offer's total was kept.
- New `traffic` table (customers helped per rep per day, as the store counts them), to
  measure usage against. Filled with demo data in the next phase.
- Query lab: three new examples (latest actions, what reps do most, offers line by line).
- The demo database rebuilds once in each browser to get the new tables, so deals a
  visitor recorded before this version are cleared.
- Restore this if: tracking causes problems; v0.13.1 is the app without it.
## v0.13.1 (2026-11-01 15:44 ET): Plan for usage tracking and sign-in

- New docs/usage-plan.md: track whether reps use the tool, how they use it, and what
  happens with customers; deal patterns for managers only; outcomes stay bought / walked;
  then real sign-in copied from SoccerSessions. PLAN.md points to it. No app changes.
- Restore this if: the plan should be dropped; the app is identical to v0.13.0.
## v0.13.0 (2026-10-12 16:15 ET): A tool, not an advisor: discounts, tax and iterations

Mason's first scenario recording changed the direction: the app can't know enough about
the customer to suggest good offers, so it no longer tries. The rep builds the ticket,
sees what every price does, and makes their own offers.

- Removed: the Offer ladder and Target a tier tabs, bundle deals, and the lowball warning.
  (The ladder code now only drives the made-up history's reps.)
- Sales tax (6%, set in the manager's rules) on the whole ticket, delivery included. The
  ticket and the readout show the total before and with tax.
- Discounts like a point of sale. On a row: **$ off**, **% off** or type a new total; the
  row shows what it saves in dollars and percent, and **Remove discount** puts it back.
  On the whole ticket: a new total, $ off or % off, split across everything that can move
  (price-locked items stay at list), starting from the prices as they are.
- The lowest price the store allows is shown under the whole-ticket discount, exact to the
  cent. A price that would lose the store money, on the ticket or on one row, is refused
  with the lowest that works. (Fixed: the old bundle-price box still stopped every item at
  its cost and never moved delivery, so $4,259 bounced to $4,455.89.)
- Iterations: each **I offered this price** freezes the whole ticket as Iteration 1, 2, 3,
  folded up above the ticket, opens to show every line, can't be changed. The rep always
  works in the next one.
- Discount reasons (financing, military, police/fire/EMS, government, healthcare, teacher,
  student, Google review, other): they stack, can repeat, and are kept with each iteration.
- Readout: "Financing gross"; the delivery-cost tile is gone (the GM calculator shows it).
- Manager: a Sales section (sales tax, exceptions margin); the exceptions report now flags
  sales under the exceptions margin (20%). Saved sales keep their tax.
- 197 tests.
- Restore this if: the suggested offers (Offer ladder, Target a tier) should come back (v0.12.0).

## v0.12.0 (2026-10-12 13:30 ET): A point-of-sale ticket, a GM calculator and the inventory

- The rep's Deal screen is now a ticket, like a point-of-sale screen. An item box is
  ready to type in: a SKU, an item code or part of a name shows matches as you type
  (arrow keys and Enter work). **Look up** walks category → brand → model → size for
  reps who don't know the SKU. Each row changes size, condition, quantity and total in
  place; delivery is its own line (Pickup, or a tier with its price).
- **GM calculator** tab: every line, delivery included, with its selling price, cost,
  gross dollars and margin, then the ticket totals and the commission. The lines always
  add up to the totals (tested).
- **Inventory** tab: all 239 items with price, cost and margin, new and outlet, filtered
  by search, category, brand or price lock, with an Add button on each row.
- The page is wider so the ticket's columns fit; on narrower screens each row's name
  gets its own line, and on a phone the rows stack.
- 201 tests.
- Restore this if: the ticket layout turns out worse than the old card list (v0.11.0).

## v0.11.0 (2026-10-12 12:15 ET): Outlet pieces start 20% off; only the ticket has to make money

- An outlet (pre-owned) piece is priced 20% off the new price, and can never sell above
  that (the store's rule). The vendor import sets new items' outlet prices the same way.
- One item may now sell below its cost, even free (free pillows, sheets, even a base). The
  rule is on the whole ticket: it has to make money. A price below $0 is still blocked.
- 191 tests.
- Restore this if: the per-item cost rule has to come back.

## v0.10.0 (2026-10-12 11:30 ET): Make-money floor, a 20% final offer, pickup

- The margin floor is the store's rule: any sale that makes money is allowed, even a
  little; break-even or a loss is blocked ("This price doesn't make the store any money").
- New rule: the offer ladder's final offer stops at a final-offer margin (20%), set on the
  Rules page. Reps can still go lower; the ladder just doesn't suggest it.
- The Exceptions report now shows who closes sales under the final-offer margin (read from
  the saved rules with json_extract), instead of offers below the old floor. In the demo
  history, some reps go one step under the final offer to close. SQL guide updated.
- "No delivery" is now "Pickup (no delivery, no cost)".
- Georgia's Extra Firm model is replaced by Optima's Quiet Cove Extra Firm (7 sizes), with
  prices Mason set. Every outlet piece now costs less than new. 239 items.
- 188 tests.
- Restore this if: the break-even floor or the 20% final offer turns out wrong.

## v0.9.0 (2026-10-12 10:05 ET): The catalog and rules follow a real 2025 lineup

- The catalog is now Mason's real 2025 showroom lineup, disguised: 42 models in all their
  real sizes (238 items) from eight made-up brands (Guardian, Bakersville, Century,
  Optima, Georgia, Futura, Meridian, Cambria). Real sizes, real price-locked lines and the
  real price-to-cost relationship; every brand, model name, SKU and dollar amount is
  disguised. Prices are the everyday selling price, not the "regular" price.
- Item codes: every size of a model shares its six-digit SKU, as on a vendor's cost
  sheet; the item code a rep types is SKU + size code (`366239-Q`). Search finds a model
  by its SKU.
- Outlet replaces floor model and clearance: big pieces can be sold as outlet pieces at
  a lower cost. Pillows, sheets and protectors never are. A new Frames category.
- Price locks are per model (Guardian and Bakersville mattresses, three Guardian bases),
  set on the Rules page by brand.
- New rule: a Guardian mattress only goes on a Guardian foundation or base (blocked
  otherwise); any mattress can go on a Guardian one. Add-on suggestions follow it, and
  match sizes like "King / Cal King" sheets or "Twin XL" halves of a split base to the bed.
- Rules follow the real 2025 rules: tiers 47.5% / 43% / below pay 18% / 14% / 10%, +3
  points with an adjustable base; one delivery cost on every tier, free included; Silver,
  Gold, Platinum and Diamond delivery; the real 6–72-month financing chart. Placeholders
  until Mason answers: a 30% margin floor, the $120 minimum step, and delivery that can
  be waived (see PLAN.md, "Open questions").
- Vendor import: matches each row on SKU and size together (a join on two columns), gives
  a new size an item code, reads Outlet Cost and Prime Cost columns, and treats two sizes
  of one SKU as different items, not duplicates. New messy sample sheet from the new
  catalog. SQL guide updated, with a new "Step 5 up close".
- Demo history, sample deal, README and screenshots redone for the new catalog. Saved
  browser data from older versions is ignored (new storage keys), since its products no
  longer exist.
- 188 tests.
- Restore this if: the disguised catalog has to come out (go back to v0.8.0's invented one).

## v0.8.0 (2026-10-12 04:00 ET): README, screenshots, SQL guide for the import

- README: what it is, a two-minute tour, a worked negotiation (the sample deal's ladder,
  checked against the engine by a test so the numbers can't drift), what it does, the
  data, how it's built and how it was built by directing AI agents. Nine screenshots
  (`npm run screenshots`).
- SQL guide: a new Part 4 walks through the six import steps (fill-down, money text to
  cents, duplicates with a window function) with likely questions.
- Report percent columns get a small separate bar instead of a shaded background that
  ran into the numbers. The rules preview says "13% + 2% base bonus" instead of a
  combined rate. Links use the app's color.
- Fix: v0.7.0's changelog said 184 tests; it was 175.
- 178 tests.
- Restore this if: a later polish pass makes things worse.

## v0.7.0 (2026-10-12 03:10 ET): SQL reports, saved deals, vendor import, query lab

- The app now runs a real SQLite database in the browser. The first visit builds the
  demo history; after that it's kept in the browser, so recorded deals are still there
  next time. Manager → **Reset demo data** puts it back.
- Rep view: **Record the outcome…** saves a sale at the current price (with every offer
  made, asking price first) or a customer who walked. Both count as an "up" and show up
  in the reports right away.
- Manager → **Reports**: the seven SQL reports with a faint bar on percent columns and
  **Show the SQL** for the exact query.
- Manager → **Catalog import**: load the messy sample vendor sheet (or upload a CSV).
  Six numbered SQL steps skip junk rows, fill down merged cells, turn abbreviations and
  money text into clean values, flag problems (Fix / Check / Skipped), and compare with
  the catalog. Nothing changes until the manager approves; then reps can sell the new
  items. The sample's planted problems are all caught: a missing retail price, a "do not
  use" row, a repeated header, a duplicate, a brand filled down too far, a missing item
  number, an unknown size, cost above retail, and a cost typed as words.
- Manager → **Query lab**: run your own read-only SELECT, with examples; writes are
  refused with a plain message.
- Saved rules are also recorded in the database (settings history).
- The catalog the rep sees now comes from the database.
- 184 tests.
- Restore this if: a later change breaks saving, reports or the import.

## v0.6.0 (2026-10-12 02:20 ET): the SQL layer (built on a separate branch, then merged)

- `src/db/schema.sql`: stores, reps, products, visits (ups), deals (a snapshot of each
  sale's totals and the rate used), deal lines, offers, settings history.
- Six months of made-up history (2026-04-01 to 2026-09-30): about 3,100 ups and 1,440
  sales, every one priced by the real engine. The reps differ on purpose: Tasha attaches
  bases and holds margin, Kevin discounts early, Renee converts best with small tickets,
  Marcus sells the price-locked premium line with full-price add-ons, Ben has big
  tickets, Sofia is a new hire who improves, Andre is steady.
- Seven reports as plain `.sql` files with plain-English headers: rep scorecard by month
  (the old commission tracker), store comparison, tier mix, where deals close on the
  ladder, attach trend, premium line by rep, exceptions at the floor.
- `docs/SQL-GUIDE.md`: Mason's study guide (how to read a SELECT, then each report line
  by line with likely questions). A test keeps it in sync with the queries.
- 171 tests.
- Restore this if: you want the SQL layer without the screens that use it.

## v0.5.0 (2026-10-12 01:20 ET): the manager's rules

- Manager view → **Rules**: commission tiers (minimum margin and rate), the attach bonus,
  the minimum offer step, offer rounding, delivery cost and options, bundle deals (on/off
  and the discount), the financing chart (green adds to gross, red takes away, empty =
  not offered) and price-locked brands and categories.
- Nothing changes until **Save rules**. Broken rules (tiers out of order, a lower tier
  paying more, a delivery minimum above its price…) are listed in plain words and can't
  be saved. Before saving, it shows what the change does to the sample deal ("the rep
  would earn $280.56 instead of $340.68").
- Saved rules apply to the rep view right away.
- Restore this if: a later change breaks the rules screen.

## v0.4.1 (2026-10-12 00:50 ET): repo cleanup

- v0.4.0 accidentally recorded a local helper folder (`.claude/worktrees/…`) as a
  sub-repository. It's removed from the repo and ignored from now on; nothing in the app
  changed.
- Restore this if: never needed; v0.4.0's app code is identical.

## v0.4.0 (2026-10-12 00:40 ET): the rep view

- **Deal**: search the catalog (brand, model, size) or browse by category; set condition
  (new, floor model, clearance), quantity and the price of each item; pick delivery and
  its price, financing (each term says whether it adds to or takes from gross) and bundle
  deals. Price-locked items can't be edited.
- **Live readout**: what the customer pays and saves, tier, commission (with the base
  bonus shown), margin, gross dollars, costs, how much lower the rep can go and stay in
  the tier, and what it takes to get back up a tier. Type one number to price the whole
  bundle; if it's too low to reach, it says why and what the lowest is.
- "I offered this price" keeps a list of the offers made to this customer and warns
  before a lowball step (under $100 or 5%).
- **Offer ladder**: asking price → top-tier opener → middle-tier offers → final offer,
  with the commission given up at every step and a callout for the cheap step inside
  the wide middle tier. Choose where the discount goes. "Use this price" loads it.
- **Target a tier**: the lowest price that keeps a tier, 2–3 ways to present it (where
  the discount sits), and levers that go lower (floor model, financing, a full-price
  add-on of the right size that isn't already in the deal).
- Works on a phone: one column, with the price, tier and commission pinned to the
  bottom of the screen.
- Fix: v0.3.0's changelog said 59 products; the catalog has 54.
- 99 tests.
- Restore this if: a later screen change makes the rep view worse.

## v0.3.0 (2026-10-11 23:40 ET): demo catalog, rules and the real-names guard

- Lantern Lane Home, the made-up store: 59 products (mattresses in five brands and
  several sizes, foundations, adjustable bases, pillows, protectors, sheets, protection
  plans). Kestrel is the price-locked premium line; it sits in the middle tier at list
  price, so its margin has to come from the rest of the bundle. Some lines have floor
  models and clearance, each with its own price and cost.
- Default rules: three tiers (top 50%+ pays 15% of gross, middle 40–49.99% pays 11%, low
  34–39.99% pays 7%), +2 points with an adjustable base, $45 delivery cost, four delivery
  tiers with minimums, three bundle deals, a made-up financing chart.
- Two stores and seven made-up reps.
- A guard test fails the build if a real retailer, brand, system or person's name
  appears in any file. It stores only fingerprints of the names.
- 91 tests.
- Restore this if: the catalog or default rules get changed in a way you don't like.

## v0.2.0 (2026-10-11 23:10 ET): the engine

- All the money math, with no screens yet (`src/engine/`): topline, gross dollars,
  margin, tier, commission on gross dollars, the adjustable-base attach bonus, delivery
  cost, floor-model and clearance costs, bundle deals, financing (adds or subtracts
  gross), and every rule (price-locked items, below cost, below the floor, delivery
  minimums, financing that isn't offered at that amount, unknown products).
- The discount formula finds the lowest price that holds a margin, rounded up to whole
  $10 and re-checked; the offer ladder (opening top-tier offer, middle-tier offers,
  final offer at the floor, never a lowball step); target mode (2–3 ways to reach a
  tier, plus floor-model, financing and full-price add-on levers).
- A check that rejects broken manager settings (tiers out of order, etc.).
- 82 tests, including 200 random deals checked for "meets the target, passes every rule,
  and $10 lower would not".
- Restore this if: a later engine change breaks the math.

## v0.1.0 (2026-10-11 20:40 ET): plan and repo

- PLAN.md: scope, Mason's decisions (name, SQL, financing, import, launch bar), the money
  math, made-up numbers, architecture, milestones.
- Restore this if: you want to restart from the plan alone.
