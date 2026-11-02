# Plan: usage tracking and deal patterns, then sign-in

Status: **All five phases done (v0.19.0, 2026-11-02).** (Mason moved the database step
before Phase 4: local Postgres in v0.17.0, docs/database.md.) Sign-in is next.

A company that hands a calculator to its sales floor wants to know three things: are
reps using it, how are they using it, and what happens with customers when they do. This
plan adds all three to OfferLadder, in the browser demo first, with simulated history so
the reports have months of data on day one. Real sign-in comes after, copied from
SoccerSessions' accounts plan.

## Decisions (Mason, 2026-11-01)

| Decision | Answer |
|---|---|
| Launch v1.0.0 first? | No. Keep building; launch when it's worthy |
| Who sees deal patterns and close odds? | **Managers only.** Reps never see odds or suggestions; the app stays a tool, not an advisor (the 2026-10-12 decision stands) |
| Outcomes a rep records | **Bought** or **walked**. A "be-back" (customer coming back) was considered and dropped: following up with customers is the store's CRM's job, not the calculator's |
| Order | Usage tracking first, then sign-in |

## The three questions

**A. Are reps using it? (adoption)**
- **Coverage:** of the customers a rep helped (from the store's traffic count, which comes
  from outside the tool), on how many did they use OfferLadder? "9 of 11 today" means more
  than "signed in 4 times."
- Active reps per store per week, and the trend. Sign-ins per rep (demo: picking a rep;
  after sign-in is built: real sign-ins).

**B. How are they using it? (feature usage)**
- How items get on the ticket: typed SKU, name search, Look up, or Inventory.
- How discounts are entered: $ off, % off or new price; one row or the whole ticket.
- The funnel: ticket started → first offer recorded → outcome recorded. Where reps drop off.
- Iterations per customer. GM calculator, Inventory and Look up opens.
- **Scratchpad use:** price changes between recorded offers, and tickets built but never
  recorded. This answers "are they trying prices and not recording anything?" without
  logging keystrokes.
- **Data quality:** the share of tickets with an outcome recorded. Every pattern report
  below is only as good as this number, so it's shown next to them.

**C. What happens with customers? (deal analytics)**
- Average ticket offered vs. sold; which products are offered vs. sold.
- Close rate by total discount %, by discount on the base, by free delivery, by financing
  term, by offer number.
- **Second offers:** of customers who said no to offer 1, what changed on the offer that
  closed (more off the base, free delivery, financing added)?
- **Commission given up to discounting,** per rep: commission at list price minus
  commission earned.
- Attach rate, offers per sale, time from ticket start to first offer.
- **Floor hits:** how often reps run into the lowest-price refusal or a price-locked item.
  Many hits means the rules are too tight or a rep discounts too fast.
- **Rule changes:** behaviour before and after a manager changes a tier (the app already
  keeps every rule change).

## What we will NOT track

- **No keystroke logging.** It's noisy and heavy, and in a real company it needs HR and
  legal review (some states require written notice of electronic monitoring of
  employees). We record meaningful actions only.
- **No customer identities.** Visits are anonymous; customers belong to the CRM.
- **No close odds on the rep's screen.** Patterns are for managers: coaching and rule
  setting.

## Honest about the odds

"If you offer this, the odds they buy are X%" is real (retailers call it win-rate or
price-response modelling), with three catches the screens must say plainly:

1. **Exact combinations are too rare** to measure (a specific king mattress, king base,
   base at 50% off, free Platinum delivery and 6-month financing might happen a few times
   a year). So deals are grouped by features: price band, total discount %, base discount
   %, free delivery, financing term, offer number.
2. **Correlation, not cause.** Reps give bigger discounts to customers who are already
   wavering, so raw history can show "bigger discounts close less." Real companies settle
   questions like this with controlled tests. Pattern screens carry this warning.
3. **The demo's patterns are planted.** The history is simulated, and the simulator builds
   in the behaviours listed under "Planted patterns" below. The reports find them; the
   README says so.

## How it's stored

Two new tables, plus small changes. Money stays in cents, percents in basis points.

- **`offer_lines`**: every line of every offer, not just its total: item, condition, list,
  discount, how the discount was entered ($ / % / new price, row / whole ticket), net,
  cost, locked. Plus on the offer itself: delivery tier and price, financing term,
  discount reasons. Today `offers` keeps only the total.
- **`events`**: one row per meaningful action: when, rep, store, a session id (one sitting),
  the visit if there is one, the event type and a few details. **Add-only**, like
  SoccerSessions' audit log: rows are never changed or deleted.
- **`traffic`**: customers helped per rep per day, as the store's own count would report
  them. This is what coverage is measured against.

Event types (as built in v0.14.0; `how`, `scope`, `sku` and `value` say more):

| Event | how | scope | value |
|---|---|---|---|
| `session_started` | | | |
| `ticket_started` | | | |
| `sample_loaded` (demo button) | | | |
| `item_added` | sku, search, lookup, inventory | | |
| `item_removed` | | | |
| `discount_applied` | dollars, percent, new_price | row, ticket, delivery | discount in cents (ticket: the ticket's total savings) |
| `discount_removed` | | row, delivery | |
| `delivery_set` | the delivery tier, or pickup | | |
| `financing_set` | financing, none | | months |
| `reason_added` | the reason | | |
| `floor_refused` (price too low, refused) | delivery tier, for delivery | row, ticket, delivery | the price tried |
| `offer_recorded` | | | iteration number |
| `outcome_recorded` | bought, walked | | offers made after the asking price |
| `ticket_abandoned` (New customer without an outcome) | | | offers made |
| `gm_calculator_opened`, `inventory_opened`, `lookup_opened` | | | |

A sitting (`session_id`) starts when a rep opens the app (the demo's version of signing
in), when someone else takes over, or after 30 minutes without activity. A ticket starts
with its first item. "Locked item refused" from the first draft was dropped: a
price-locked item's price box is disabled, so there's nothing to refuse.

Recording events is a data-layer job (UI → database). The engine stays pure: no events,
no I/O.

## Planted patterns (the simulator's script)

The seven reps keep their sales personalities and gain tool habits, so the new reports
tell a story. As built in v0.15.0 (`src/data/habits.ts`; `tests/history-usage.test.ts`
checks each one):

- **Tasha:** uses the app with the most customers (96%) and records everything.
- **Kevin:** cuts the adjustable base first (up to half off), on its own row; skips
  recording a quarter of his walk-outs (most dropped tickets); tries the most prices the
  store refuses.
- **Renee:** quickest to the first offer; often makes delivery free.
- **Marcus:** makes delivery free first (his premium line is price-locked); most free
  delivery of anyone.
- **Andre:** middle of the pack on everything.
- **Sofia (new hire):** Look up and Inventory at first, typed SKUs by September; uses the
  app with 66% of customers in April, about 90% by September; gets faster.
- **Ben:** scratchpad user: about 6 price changes per ticket, records the fewest offers;
  uses the app with the smallest share of his customers.

Customer patterns (the same for every rep). Since v0.18.0 each one works through something
the app records, so the Deal patterns reports can find it:

- **Free delivery on a ticket of $2,500 or more:** the offer that makes delivery free is
  more likely to get a yes, and the customer is more likely to buy. Big-ticket offers with
  delivery waived are accepted 54% of the time vs 37% with delivery charged.
- **Financing helps; 6 months helps most** (financing is on the ticket from the start):
  72% of 6-month customers buy vs 50% with no financing.
- **15% or more off the adjustable base gets more yeses, but past 35% adds nothing:**
  offers with 15–35% off the base are accepted 40% of the time, 35% or more 36%, under 15%
  32%. Kevin's half-off bases give up commission for no extra sales (he gives up 63% of
  the commission his sales would have paid at the asking price, the most of anyone).
  Before v0.18.0 this pattern was decided from the whole ladder, including offers the
  customer never heard, so it only showed up through customers who walked before any
  offer; Phase 4 caught that and moved it onto each offer.

How the history is built: each offer still lands on the ladder's price, so totals,
margins and commissions are the same whichever way the rep builds it; only what's on each
line differs. Whether the customer buys depends on the rep's conversion and on what's
offered. Some customers are helped without the app (only the store's traffic count sees
them), and some walk-outs are never recorded (only a dropped ticket in the usage log).
So the existing reports now count **customers recorded in the app**.

## Phases

Each phase ends with passing checks, a browser click-through and its own version.

| Phase | What | Visible change | Version |
|---|---|---|---|
| 1 | `offer_lines`, `events`, `traffic` tables; the rep screens record events and full offers | None (data only; a count in Query lab) | v0.14.0 |
| 2 | Simulated history v2: six months of events, full offers and traffic with the planted patterns | Existing reports unchanged | v0.15.0 |
| 3 | **Usage** tab (managers): coverage, active reps, funnel, feature mix, scratchpad signals, data quality | New tab | v0.16.0 |
| (added) | **Local Postgres** (Supabase in Docker): the same tables with stricter rules, the demo loaded into it, every report checked against SQLite | None (developer side) | v0.17.0 |
| 4 | **Deal patterns** tab (managers): offers accepted by discount size, base discount and delivery; close rate by financing; what changed after a "no"; commission given up; offered vs sold. Each a `.sql` file on the `offer_facts` view | New tab | v0.18.0 |
| 5 | SQL guide Part 5 (usage and pattern queries, plus the Postgres differences), README section, screenshots | Docs | v0.19.0 |

## After that: sign-in

Copy the approach from SoccerSessions' accounts plan (a snapshot of its code is kept
locally, outside the repo): Supabase, invitation only with an email link or code, no
passwords; the database enforces who sees what; accounts are turned off, never deleted;
an add-only audit log; the public demo stays "pick a user." OfferLadder's roles:

| Role | Sees | Can do |
|---|---|---|
| Rep | Their own tickets and deals | Build tickets, record offers and outcomes |
| Store manager | Their store: deals, reports, Usage, Deal patterns | Change the commission rules, invite reps to their store, turn their access off |
| Admin | Every store | Everything, plus accounts and the audit log |

New in OfferLadder's case: its database runs in the browser (SQLite), so live mode moves
it to Postgres. The report queries mostly carry over. Sign-in events then feed the Usage
tab for real. A detailed phase table is written when this starts.

## Where we left off

- 2026-11-01: plan written with Mason's four decisions.
- **Phase 1 done (v0.14.0).** Tables `offer_lines`, `offer_reasons`, `events` (add-only,
  enforced by triggers) and `traffic`; `visits.ticket_id` joins a visit to its events;
  `offers` gained delivery and financing. `src/ui/usage.ts` is the tracker (sittings,
  tickets); the rep screens call `track()`. Every offer saved at the outcome now carries
  its lines, how each discount was entered, delivery, financing and reasons. Query lab
  has three new examples. 214 tests (17 new); a browser click-through (SKU, search, Look
  up, % off, whole-ticket price, delivery, financing, reason, two offers, a refused price,
  walked; GM calculator, Inventory, abandoned ticket; sample deal sold) logged every
  action in order, and it survived a reload.
- Notes for Phase 2: the demo database key is now `demo-db-v4`, so browsers rebuild the
  demo once. The simulator (`src/data/history.ts`) still writes offers without lines and
  no events or traffic: Phase 2 adds them. Iterations saved before v0.14.0 have no cost
  (saved as 0) or tier id; only a ticket in progress during the upgrade is affected.
- **Phase 2 done (v0.15.0).** `src/data/habits.ts` (tool habits, how offers are built,
  customer patterns) and a new main loop in `src/data/history.ts`: each customer gets a
  time of day (store opens at 10), a ticket with its events, offers built the rep's way,
  and an outcome or a dropped ticket. Six months: about 3,100 customers counted, 2,600
  tickets, 2,500 recorded, 30,000 events, 2,200 sittings; the database is about 6.5 MB.
  231 tests (16 new in `tests/history-usage.test.ts`: data checks plus every planted
  habit and pattern). The existing reports still pass their checks; "ups" now means
  customers recorded in the app. Browser check: the demo builds in about 3 seconds,
  reports read correctly, a new sale lands on top of the history.
- Notes for Phase 3: coverage = tickets started ÷ traffic ups (per rep, per month).
  Ticket ids: `h-N` in the history, `t-...` from the live app. The history's sittings are
  per rep per day, split after 30 quiet minutes, same rule as the app.
- **Phase 3 done (v0.16.0).** Manager → **Usage** tab: four tiles for the latest month
  with a store count (coverage, reps using it, outcome recorded, dropped tickets, each
  with the change from the month before), then eight reports, each a `.sql` file in
  `src/db/queries/usage/` with a Question:/SQL ideas: header, browsed like the sales
  reports (shared `ReportBrowser`): company by month, each store by week, coverage by rep
  and month, what happens to each ticket, how items get on the ticket, how prices get
  changed, scratchpad signals, data quality. 259 tests (28 new: every usage report adds
  up against the raw tables and shows the planted habits). Browser check: tiles, all
  eight reports, Show the SQL, a live walk-out lands in the funnel at once, phone width.
- What the reports show: Riverside's coverage runs about 90% a week, Hillcrest's about
  70% (Andre, Sofia and Ben work there). Sofia's typed SKUs go from 11% to 45%. Kevin types
  % off most (58%) and hits refused prices 19 times per 100 tickets; he records 73% of
  his walk-outs (Tasha 97%). Ben makes 7 price changes per ticket, 25 per recorded offer.
  Renee is quickest to a first price (3.4 minutes).
- Notes for Phase 4: "reps using it" is always 7 of 7 in the demo (every rep uses it
  some each week); that's honest, but it's the least interesting tile. Kevin's
  base-first habit hardly shows in the usage reports (few of his deals have a base);
  it belongs in Deal patterns (base discount depth by rep). Usage reports skip months
  with no store count, so the live app's tickets count in the event-only reports
  (funnel, items, prices, scratchpad) but not in coverage.
- 2026-11-01: Mason asked for a real database like SoccerSessions' (Postgres in Docker)
  before Phase 4. **Done in v0.17.0**: local Supabase (ports 553xx), the tables in
  `supabase/migrations/` with stricter types and rules, `npm run db:reset` loads the demo
  (58,000 rows, all passed every rule first try), ten reports got Postgres versions, and
  `npm run test:db` (32 tests) proves every report matches SQLite. The app itself still
  uses the browser database; live mode on Postgres comes with sign-in.
- Notes for Phase 4: write each new pattern query for SQLite, then run it on Postgres
  (`npm run db:report <id>`) and add a Postgres version if it needs one; `test:db` checks
  every report automatically.
- **Phase 4 done (v0.18.0).** Manager → **Deal patterns**: an always-visible "patterns,
  not proof" warning with the data-quality line (recorded customers ÷ the stores' count,
  tickets dropped), then seven reports in `src/db/queries/patterns/`. They read a new
  view, `offer_facts` (one row per offer: discount from the asking price, delivery
  waived/charged/basic/pickup, financing, base cut, accepted, bought), defined in both
  databases, so none needed a Postgres version. Offer features (discount, base, delivery)
  are measured per offer as "accepted %"; financing, fixed per ticket, as close rate per
  customer. Groups under 30 say "too few to trust". 293 tests (26 new) and 39 database
  tests; browser check at desktop and phone width, the rep view never shows it.
- Found and fixed in Phase 4: the base-discount pattern wasn't findable from recorded data
  (see Planted patterns). The simulator now plants it on each offer's acceptance; every
  sales story still holds. The demo database key is now `demo-db-v6` (browsers rebuild
  once). Seeding Postgres now runs ANALYZE (without fresh statistics one report took over
  a minute instead of 47 ms), and the new reports break ties by name so both databases
  list rows in the same order.
- Left out of Phase 4, on purpose: "floor hits" is already in Usage (How prices get
  changed, refused per 100 tickets); "before and after a rule change" needs a planted rule
  change in the history (there is one rule set in six months), so it waits.
- What "What changed after a no" shows: customers who walked anyway got about the same
  extra discount (20 points) as those who bought, and more often more off the base; walk-
  outs hear the whole ladder. A good example of why the screen says patterns, not proof.
- **Phase 5 done (v0.19.0).** docs/SQL-GUIDE.md Part 5: the new tables, the new SQL
  ideas, all eight usage and seven pattern queries word for word with walkthroughs and
  likely questions, the offer_facts view, and the Postgres differences (with the
  ANALYZE story). A test now checks every query (all 22) and the view appear in the guide
  exactly as in the files. README: Usage and Deal patterns rows, the usage history, the
  planted patterns stated plainly, two new screenshots (12-usage, 13-patterns).
- Next: sign-in (below), copying SoccerSessions' plan onto the local Postgres.
