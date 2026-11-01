# Plan: usage tracking and deal patterns, then sign-in

Status: **Planned (2026-11-01).** Nothing built yet. Phase 1 is next.

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

Event types (first draft): `session_started`, `ticket_started`, `item_added` (via SKU,
search, Look up or Inventory), `item_removed`, `discount_applied` (method, row or ticket),
`discount_removed`, `delivery_set`, `financing_set`, `reason_added`, `floor_refused`,
`locked_refused`, `offer_recorded` (iteration number), `outcome_recorded` (bought or
walked), `ticket_abandoned` (cleared without recording), `gm_calculator_opened`,
`inventory_opened`, `lookup_opened`.

Recording events is a data-layer job (UI → database). The engine stays pure: no events,
no I/O.

## Planted patterns (the simulator's script)

The seven reps keep their sales personalities and gain tool habits, so the new reports
tell a story. A first draft, to adjust as it's built:

- **Tasha:** records everything; few iterations; high coverage.
- **Kevin:** many iterations, big early discounts on the base; often skips recording
  walks (low data quality), and hits the floor most.
- **Renee:** high coverage, quick to first offer, small tickets.
- **Marcus:** little discounting (price-locked line); free delivery is his main lever.
- **Andre:** middle of the pack on everything.
- **Sofia (new hire):** heavy Look up and Inventory use at first, moving to typed SKUs
  over the months; coverage climbs.
- **Ben:** scratchpad user: many price changes, few recorded offers, big tickets.

Customer patterns: free delivery and 6-month financing lift second-offer closes on
tickets above a price band; base discounts beyond a point stop adding closes (commission
given up for nothing).

## Phases

Each phase ends with passing checks, a browser click-through and its own version.

| Phase | What | Visible change | Version |
|---|---|---|---|
| 1 | `offer_lines`, `events`, `traffic` tables; the rep screens record events and full offers | None (data only; a count in Query lab) | v0.14.0 |
| 2 | Simulated history v2: six months of events, full offers and traffic with the planted patterns | Existing reports unchanged | v0.15.0 |
| 3 | **Usage** tab (managers): coverage, active reps, funnel, feature mix, scratchpad signals, data quality | New tab | v0.16.0 |
| 4 | **Deal patterns** tab (managers): close rates by feature, second offers, commission given up, offered vs sold, floor hits, rule-change effects; each a `.sql` file | New tab | v0.17.0 |
| 5 | SQL guide Part 5, README section, screenshots | Docs | v0.18.0 |

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

- 2026-11-01: plan written with Mason's four decisions. Next: Phase 1.
