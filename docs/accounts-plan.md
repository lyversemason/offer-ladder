# Plan: real sign-in, accounts and live mode

Status: **Phase 4 done (v0.23.0, 2026-11-01).** Phase 5 (Accounts screen and audit log) is next.

Today OfferLadder has no sign-in: the top of the screen switches between Rep and Manager,
the database lives in each visitor's browser, and anyone can be anyone. That's right for
the public demo. This plan adds what a real company would need, **without taking the
demo away**, the same way SoccerSessions did (its plan and code are the model; a copy is
kept locally, outside the repo).

## Goals

1. People sign in as themselves, by **invitation only**, with no passwords.
2. **The database enforces who sees what**: a rep sees only their own tickets and deals;
   a store manager sees their store; an admin sees everything. A tampered browser still
   can't read another rep's commission.
3. **The browser is never trusted with money.** A rep's browser sends the ticket (items,
   discounts, delivery, financing), not the totals. The server prices it again with the
   same engine (`src/engine/`) and the rules in the database, and saves what the engine
   says. A rep can't raise their own commission by editing the page.
4. People who leave are **turned off, never deleted**: locked out at once, history kept.
5. Every account change, rule change and catalog change goes into an **audit log** that
   nobody can edit.
6. The public demo keeps working as it does now: no account, browser database.

## The approach in one paragraph

The local Postgres from v0.17.0 (Supabase in Docker) becomes the live database. Supabase
adds sign-in by email and **row-level security** (access rules the database applies to
every query). The site stays a static site. In **live mode** it talks to Supabase; in
**demo mode** (the default, and what the public link serves) it keeps using the browser's
SQLite. A server function runs the things a browser can't be trusted with: saving a sale
(priced again by the engine), changing the rules, applying a catalog import, and
managing accounts.

## Two modes, one codebase

| | Demo mode (today) | Live mode (new) |
|---|---|---|
| Who you are | Picked at the top of the screen | Signed in; read from the sign-in session |
| Where data lives | This browser (SQLite) | One shared Postgres database |
| Who sees what | Everything (the demo shows the manager's view of both stores) | Enforced by the database, per role |
| Reports | Run on SQLite in the browser | Run on Postgres **as the signed-in person**, so the access rules filter them |
| Saving a sale | Written straight to the browser database | Sent to the server, priced again by the engine, written in one step |
| Turned on by | Default | A build setting with the database's address |

The screens don't care which mode they're in: they call the same functions (record the
outcome, log an event, run a report, save the rules). Underneath, a **data source** does
the work: the demo source is today's SQLite code, the live source talks to Supabase.

## Roles

| Role | Sees | Can do |
|---|---|---|
| **Rep** | Their own tickets, offers, deals and usage events; the catalog and the rules (they need them to price) | Build tickets, record offers and outcomes |
| **Store manager** | Everything at their store: deals, the Reports, Usage and Deal patterns tabs (filtered to their store by the database); the rules, read-only | Invite reps to their store, turn their access off and on |
| **Admin** | Every store | Everything, plus accounts for everyone, the rules, the catalog import and the audit log |

New fictional people for live mode: an admin (the owner) and a Hillcrest store manager,
next to Lena Hart (Riverside). The seven reps keep their names.

## What changes in the database

- **`profiles`**: one row per person: name, email, role, store, their rep id (for reps),
  status (invited / active / turned off), who invited them and when. Linked to Supabase's
  sign-in account. Never deleted (a trigger refuses).
- **Access rules on every table**, mirroring a new `src/data/access.ts` (plain rules
  with tests, used by the screens too): reps read rows with their rep id; managers read
  rows for their store; admins read everything. Browsers can read, never write directly,
  with one exception: a rep may **add** their own usage events (add-only already).
- **Reports become database functions**, one per report, generated from the Postgres
  `.sql` files (so they can't drift; a test checks). Each runs as the person asking, so a
  store manager's scorecard only contains their store without any change to the SQL.
- **`audit_log`**: who, what, to whom, when, before and after. Add-only; only admins read it.
- **`traffic`** (the stores' own customer counts) has no live source yet: coverage only
  appears where counts exist. A manager uploading a daily count, or a feed from the sales
  system, comes later.

## Signing in and invitations

Copied from SoccerSessions, including what it learned:

- **Email link or 6-digit code** in the same email (the code is for phones where the link
  opens in a different browser). No passwords. Public sign-up switched off.
- **Invitations**: the server creates the profile as *invited* and sends the normal
  sign-in email, worded as an invitation. First sign-in makes the account *active*.
  Invitations last 7 days; Resend and Cancel are on the Accounts screen.
- **Who may invite whom**: admins invite anyone anywhere; store managers invite reps to
  their own store; reps invite no one.
- **Turning someone off** signs them out of every device and keeps all their history.
  You can't turn yourself off, and the last active admin can't be turned off or demoted,
  so the company can never lock itself out.
- Locally, sign-in emails land in Supabase's email catcher (Mailpit). A hosted copy would
  need a real email service.
- **Sign-ins feed the Usage tab**: a sign-in starts a sitting, so "active reps" becomes
  real instead of the demo's "picked a rep."

## Saving: what runs on the server

| Action | Who | What the server does |
|---|---|---|
| Record an outcome (sold or walked) | The rep | Loads the current rules and catalog, prices every offer again with `src/engine/`, refuses anything the rules refuse, writes the visit, offers, lines and sale in one transaction. The commission saved is the server's, not the browser's |
| Usage events | The rep | Written directly by the browser (the database checks the rep id is theirs) |
| Save the rules | Admins | Validates them with the engine's rule checks, keeps the full rule set in `settings_history`, writes the audit entry |
| Apply a catalog import | Admins | The cleaning steps still run in the browser's SQLite (it's scratch work); only the approved list of changes goes to the server, which applies it and writes the audit entry |
| Accounts (invite, turn off, ...) | Managers and admins | Checks `access.ts`, writes the profile and the audit entry, sends the email |

The browser keeps its own checks for instant feedback; the server's are the ones that
count. The server's secret key lives only in the server function; the browser only ever
has the public key, which the access rules make safe to publish.

## The new screens

- **Sign-in** (live mode only): email, then the link or code.
- **Accounts** (managers and admins, both modes): one list per store; status chips
  (Invited, Active, Turned off); Invite, Resend, Cancel invite, Turn off, Turn back on,
  Change role or store, shown only when allowed. In the demo the invitation email appears
  on screen instead of being sent, so reviewers can try it.
- **Audit log** (admins, both modes): filter by person, kind of change and date.
- In live mode a rep never sees the Rep / Manager switch: their role decides the screens.

## Testing

- **App tests** (`npm run check`, no database needed): the access rules, invite and
  turn-off guard rails, the demo data source, and that the report functions match the
  report files.
- **Database tests** (`npm run test:db`): sign in as every fictional person and check each
  sees exactly what the role table says (a rep can't read another rep's deals, a manager
  can't read the other store, a turned-off person reads nothing), every report run as a
  manager only contains their store, and **a sale sent with a tampered commission is saved
  with the engine's number**.
- **Browser run** for each phase: sign in with a real code from the email catcher, record a
  sale, check the manager sees it and the other store's manager doesn't.

## Phases

Each phase ends with passing checks, a browser click-through and its own version.

| Phase | What | Visible change | Version |
|---|---|---|---|
| 0 | Mason's decisions (below) | None | – |
| 1 | One data source layer for everything the screens read and write; the demo source is today's SQLite, behaving exactly as now | None | v0.20.0 |
| 2 | Accounts and access rules in Postgres: profiles, the new people, access rules on every table, reports as database functions, `access.ts`; database tests per person | None (developer side) | v0.21.0 |
| 3 | Sign-in screen and live mode (`npm run dev:live`), read-only: sign in, see what your role allows, reports filtered by the database | Live mode only | v0.22.0 |
| 4 | Saving on the server: outcomes priced again by the engine, usage events, rules and catalog import | Live mode can save | v0.23.0 |
| 5 | Accounts screen (invite, turn off, guard rails) and audit log, both modes | Accounts and Audit log in the demo | v0.24.0 |
| 6 | README section, screenshots (demo and live), SQL guide section on access rules and report functions | Docs | v0.25.0 |

## Decisions (Mason, 2026-11-01)

| # | Decision | Answer |
|---|---|---|
| 1 | Provider | **Supabase**, the same as SoccerSessions (already running locally) |
| 2 | Sign-in | **Email link plus 6-digit code**, no passwords, invitation only |
| 3 | Who changes the rules and runs the catalog import | **Admins only.** The rules and catalog stay company-wide; store managers see the rules read-only |
| 4 | Query lab in live mode | **Demo only.** Live use goes through the reports |
| 5 | A hosted online copy | **Not yet.** Live mode ships as code, tests and screenshots; the public link stays the demo |

So in the role table: store managers invite reps to their store and turn their access off
and on; rules and the catalog import are admin actions (the Rules tab is read-only for a
store manager in live mode). The demo is unchanged: its Manager view can still change the
rules and run the import, so reviewers can try them.

## Where we left off

- 2026-11-01: plan written (v0.19.1). Mason's decisions recorded (v0.19.2): all five as
  recommended.
- **Phase 1 done (v0.20.0).** `src/source/types.ts` is the `DataSource`: everything the
  screens read and write (catalog, rules, reports, query lab, record an outcome, usage
  events, save the rules, the catalog import's workspace and apply, reset, and a
  subscribe for "something changed"). `src/source/demo.ts` is the demo source (the
  browser's SQLite); `src/source/browser-storage.ts` keeps it in IndexedDB and the rules
  in localStorage (same keys as before, so nobody's saved demo or rules are lost). No
  screen imports a database function any more (only types). What changed underneath:
  - **A sale is priced again by the source** before it's saved: the screen sends the
    ticket and its offers, the source runs the engine and saves the engine's totals for
    the accepted offer (a test sends ten times the real commission and gets the real
    one saved). Live mode's server will do the same.
  - **Saving an outcome is all or nothing** (a savepoint): a refused sale leaves no
    visit behind.
  - **The catalog import cleans in a scratch copy** of the catalog
    (`importWorkspace()`); only the approved changes reach the real catalog
    (`applyImport()`, which runs step 6 unchanged against a temporary table). Before,
    the cleaning tables were left in the saved demo database.
  - The rules come from the source (they used to be read by the screen itself).
  - Reports run asynchronously (`src/ui/reports.ts`), with "Running the report…" and an
    error message if one fails; Record outcome shows "Saving…" and can't be pressed twice.
  319 tests (10 new in `tests/source-demo.test.ts`); browser run passed 15 checks (sale
  and walk-out with their messages, reports, usage, patterns, events, query lab refusing a
  write, rules saved, import applied, everything kept after a reload, reset) and the
  storage-not-answering check.
- Notes for Phase 2: the live source will implement the same interface. `runQuery`
  throws in live mode (decision 4). Usage events are sent one at a time today; the live
  source should batch them. The screen still sends offer totals it worked out; the live
  server prices every offer again, not only the accepted one.
- **Phase 2 done (v0.21.0).** Accounts and access rules in the local Postgres:
  - `src/data/access.ts`: `canSee` (admin everything, store manager their store, rep
    their own, nobody whose access isn't on), `canSeeShared`, `canSeePerson`; 6 tests.
  - `PEOPLE` in `src/data/org.ts`: Dana Whitfield (owner, admin), Lena Hart (Riverside
    manager), Marisol Vega (Hillcrest manager), Owen Price (former Hillcrest manager,
    access turned off) and the seven reps; emails on the reserved `.test` domain.
  - Migration `20261102010000_accounts.sql`: `profiles` (never deleted, a trigger
    refuses), "who is asking" functions in a `private` schema the API doesn't expose,
    access rules on every table (rep / store / all; child rows follow their parent: an
    offer is visible when its customer is), read-only grants, and one write: a rep adds
    their own usage events. The public key alone reads nothing.
  - Every report is a database function (`report_<id>`, generated into
    `*_report_functions.sql` by `npm run db:report-functions`; a regular test fails if
    it's out of date). They run as the person asking, so the access rules filter them.
  - `npm run db:reset` now also creates one sign-in per person (local password
    `local-only-password`, this computer only) and their profile.
  - `tests/db/access.test.ts` (63 tests): signs in as all 11 people through the real
    API; every table's visible rows match `canSee` for every person, rep by rep too;
    the owner's reports equal the browser's; each manager's reports contain only their
    store; a rep's only themselves; Owen and the public key get nothing; browsers can't
    save a sale, change the catalog, rules or profiles, or change usage events; a rep
    can add only their own events; nobody can delete a person. Loosening one rule on
    purpose (managers reading every store's sales) made the tests fail, so they catch
    real mistakes. 102 database tests in all, 327 app tests.
  Found and fixed: the first version of the rules looked up "who is asking" once per
  row, so a store manager's count of the 30,000 usage events hit Postgres's 8-second
  limit. Looking it up once per query (`(SELECT private.my_role())`, Supabase's own
  advice) brought the whole database test run to 14 seconds.
- Notes for Phase 3: "What changed after a no" takes about 2.4 seconds under the
  access rules (90 ms without); fine for now, worth a look if reports feel slow. The
  live source turns each report function's rows (JSON objects, columns in order) into
  the same `QueryResult` the screens use; an empty result has no column names.
  Invitations and first sign-in (status invited → active) come in Phase 5; today every
  seeded person is already active or off.
- **Phase 3 done (v0.22.0).** Live mode, read-only:
  - `npm run dev:live` runs the app against the local database at
    http://127.0.0.1:10014 (keys handed to Vite for that run only). Sign-in emails land
    in the local email catcher, Mailpit, at http://127.0.0.1:55324.
  - `src/source/live.ts`: sign-in by email link or 6-digit code (PKCE, no sign-up:
    `shouldCreateUser: false`, sign-up off in `supabase/config.toml`), errors in plain
    words, who you are from your profile (`ready`, or `no-access` because access is
    off, not set up, or no account), and a `DataSource` that reads the catalog, the rules
    and the reports (through the report functions) as the signed-in person. Reps' usage
    events are saved, so a sign-in starts a real sitting in the Usage tab. Everything
    else that saves says "Live mode can't save this yet"; the query lab is demo-only.
  - `src/ui/live/`: the sign-in and "No access" screens, and `LiveApp`, loaded only in a
    live build (the demo's bundle doesn't include the database client).
  - `App` takes an optional identity: in live mode the sign-in decides the screens (a rep
    gets only the rep view as themselves; managers and admins the manager view), the
    Rep / Manager switch, demo guide and "Reset demo data" are gone, the query lab is
    hidden, the catalog import is admin-only, and the Rules tab is read-only for a store
    manager (they can try changes to see their effect, not save them).
  - Migration `20261102043000_own_profile.sql`: everyone signed in can read their own
    profile even with access off, so Owen is told "Your access has been turned off"
    rather than "no account" (`canSeePerson` too).
  - The sign-in email (`supabase/templates/magic_link.html`, subject "Your OfferLadder
    sign-in").
  Tests: 329 app tests (2 new) and 110 database tests (8 new in `tests/db/live.test.ts`:
  a real emailed code read from Mailpit, wrong code and unknown email refused in plain
  words, Owen gets no access, signing out, a manager's reports only their store, the
  owner's every store, saving and the query lab refused plainly, all ten active people
  land as themselves). Browser run: 15 checks passed (sign-in screen, unknown email,
  Lena signed in with an emailed code seeing only Riverside in Reports, Usage and Deal
  patterns, no query lab or import, read-only rules, sign out; Tasha in the rep view
  only, adding an item from the database's catalog, saving refused plainly; Owen "No
  access"), and her sign-in and ticket landed in the usage log.
- Found along the way: the changelog and plans for v0.16.0 to v0.21.0 had dates and
  times ahead of the real clock; corrected from the git commit times in v0.22.0.
- Notes for Phase 4: the rep's screen still sends offer totals it worked out; the
  server function must price every offer again from its lines (SKUs, discounts,
  delivery, financing), not only the sale. Admins see the Rules and Catalog import
  tabs but saving there is refused until Phase 4. Data loads when you sign in and after
  your own changes; other people's changes show after a reload.
- **Phase 4 done (v0.23.0).** Saving in live mode:
  - `src/data/outcome.ts`: `priceOutcome` checks an outcome and prices **every offer**
    again with the engine from its items (SKUs, quantities, discounts, delivery,
    financing); the saved totals and lines are always the engine's. How each discount
    was typed and the reasons are kept as sent, if sensible. Refusals are plain
    (`OutcomeError`). `outcomeRows` gives the rows to save. The demo source now uses it
    too, so the demo and the server can't disagree; a test checks the rows match the
    demo database's column for column.
  - `server/save.ts`, bundled by `scripts/build-functions.ts` (run by `npm run
    db:start`) into `supabase/functions/save/index.js` (not kept in git): works out who's
    asking from their sign-in token, then `recordOutcome` (reps, their own customers
    only; the server's date, US Eastern), `saveSettings` (admins; the engine's
    `validateSettings`), `applyImport` (admins; every change checked, then step 6).
  - Migration `20261102045000_saving.sql`: `save_outcome`, `save_settings` and
    `apply_catalog_changes`, each one transaction, callable only with the server's key.
    `apply_catalog_changes` runs step 6 exactly as written (a test checks it matches
    `6-apply.sql` line for line).
  - The live source sends changes to the server and shows its refusals in plain words
    ("Couldn't reach the server. Nothing was saved; try again." when it can't be
    reached). The catalog import cleans in a scratch copy in the browser (sql.js) and
    only the approved list goes to the server.
  Tests: 334 app tests (5 new: pricing, refusals, row parity, step 6 parity) and 120
  database tests (10 new in `tests/db/saving.test.ts`, which put the database back
  afterwards: a tampered sale saved with the engine's numbers, a walk-out, refusals with
  nothing written, Owen refused, the new sale in Lena's reports and not Marisol's, a
  browser calling the saving functions directly refused, rules saved only by an admin,
  broken rules refused, the import only by an admin and ending with the same catalog as
  the demo, a doctored change list refused). Browser run: 9 checks (Tasha's sale and
  walk-out saved with the server's commission, Lena sees them, Lena can't save rules,
  Dana saves a rule and runs the import, both kept after a reload); the demo
  click-through still passes 15 of 15.
- Notes for Phase 5: changes aren't in an audit log yet (Phase 5 adds it, written in the
  same transaction as each change). Rule changes and imports reach other signed-in
  people when their screen next loads (a reload, or their own save).
