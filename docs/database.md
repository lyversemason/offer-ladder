# The database: SQLite in the browser, Postgres in Docker

OfferLadder keeps the same tables in two databases.

| | Browser demo | Local Postgres |
|---|---|---|
| What it is | SQLite, running inside the page (sql.js) | Postgres 17 in Docker, through a local Supabase |
| Where the data lives | Each visitor's browser (IndexedDB) | One shared database on this computer |
| Who uses it | The public link (GitHub Pages can't run a database server) | Development and tests today; the live app after sign-in |
| Tables defined in | `src/db/schema.sql` | `supabase/migrations/` |
| Reports | `src/db/queries/*.sql` | the same files, or their Postgres version in `src/db/queries/postgres/` |

The local Postgres is the same setup a company would use in production: moving to a
hosted Supabase project later is a change of address and keys, not a rebuild.

## Commands

You need Docker running (it is on this computer). Nothing needs an online account.

| Command | What it does |
|---|---|
| `npm run db:start` | Starts the database (a few seconds once the images are downloaded) |
| `npm run db:reset` | Empties it, re-creates the tables, and loads the demo (six months of history) |
| `npm run test:db` | Checks it: same rows as the browser demo, every report gives the same answer as SQLite, the rules refuse what they should |
| `npm run db:report` | Lists the reports; `npm run db:report usage-scratchpad` runs one on Postgres and prints it |
| `npm run db:stop` | Stops it (the data is kept for next time) |

Addresses (set in `supabase/config.toml`; 553xx so it runs alongside other local
Supabase projects on 543xx):

- Database: `postgresql://postgres:postgres@127.0.0.1:55322/postgres` (the Supabase CLI's
  fixed local password; it only works on this computer's database)
- API: `http://127.0.0.1:55321`

**Run it only while working.** Docker opens these ports on every network interface, and
the firewall lets the home network reach them. The data is all made up, but stop the
database when you're done (`npm run db:stop`). To close that for good, set Docker's
default address to this computer only (`"ip": "127.0.0.1"` in `/etc/docker/daemon.json`,
then restart Docker); that's a system setting, so it's Mason's call.

## What Postgres does that SQLite doesn't

Postgres is stricter, and the tables use that:

- **Real types.** Dates are `DATE`, times `TIMESTAMP`, yes/no columns `BOOLEAN`, the rule
  set `JSONB`. SQLite keeps dates as text and yes/no as 1 and 0.
- **Rules on values (CHECK).** A quantity must be above 0, a condition must be new or
  outlet, a discount must have been entered as dollars, percent or a new price, an event
  must be one of the known types. A date like February 30 is refused.
- **One sale per customer** (`deals.visit_id` is unique) and **one price per offer
  step** (`offers` is unique on visit and step).
- **The usage log is add-only**, enforced by a trigger: changing, deleting or emptying
  `events` is refused.
- **Row-level security is on for every table, with no rules yet.** So nothing can be read
  through the public API. Sign-in adds the rules: a rep sees their own deals, a store
  manager their store, an admin everything.

Loading the demo proved the data is clean: all 58,000 rows passed every reference, rule
and uniqueness check on the first try.

## Where the two dialects differ

Ten of the twenty-two reports need a Postgres version; the rest run unchanged (the Deal
patterns reports read the `offer_facts` view, which is written to run on both). Each Postgres file
keeps the plain-English header and says what's different. The differences, all small:

| To get | SQLite | Postgres |
|---|---|---|
| The month of a date | `substr(visited_on, 1, 7)` (cut the text) | `to_char(visited_on, 'YYYY-MM')` |
| The Monday of a date's week | `date(day, '-6 days', 'weekday 1')` | `CAST(date_trunc('week', day) AS DATE)` |
| Minutes between two times | `(julianday(b) - julianday(a)) * 24 * 60` | `EXTRACT(EPOCH FROM b - a) / 60` |
| Count yes/no flags | `SUM(attach)` (1s and 0s) | `SUM(CASE WHEN attach THEN 1 ELSE 0 END)` |
| A true/false test | `dl.locked = 1` | `dl.locked` |
| One value out of JSON | `json_extract(settings_json, '$.exceptionMarginBp')` | `(settings_json ->> 'exceptionMarginBp')::int` |

Rounding: Postgres rounds exact decimals and SQLite rounds binary fractions, so a value
sitting exactly on a 5 can round differently. In the whole demo that happens once (an
average 0.01 apart); the test allows 0.01.

## Views

`offer_facts` is a **view**: a saved query that reports read like a table (one row per
offer, with its discount from the asking price, delivery, financing, base cut, and
whether the customer said yes). It's in `src/db/schema.sql` and in its own migration.
In Postgres it's created `WITH (security_invoker = true)`, so it follows the reader's
own access rules and can't become a way around row-level security.

After loading the demo, the seed script runs `ANALYZE` so Postgres has statistics about
the new rows; without them it guessed badly and one report took over a minute instead
of 47 milliseconds.

## Changing the tables

A change to the tables goes in both places: `src/db/schema.sql` (the browser) and a new
file in `supabase/migrations/` (Postgres, named with the date and time so they run in
order; never edit one that has already run). Then `npm run db:reset` and
`npm run test:db`. A new report that SQLite and Postgres write differently gets its
Postgres version in `src/db/queries/postgres/` and a line in `POSTGRES` in
`src/db/reports.ts`.

## What's next

The app itself still reads and writes the browser database. Sign-in (docs/usage-plan.md,
"After that: sign-in") adds a live mode on this Postgres: sign-in by email, the access
rules above, and saving through a server function, following SoccerSessions' plan.
