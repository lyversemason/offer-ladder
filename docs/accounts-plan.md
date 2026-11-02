# Plan: real sign-in, accounts and live mode

Status: **Approved (2026-11-02).** Mason made the Phase 0 decisions (below). Phase 1 is next.

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

## Decisions (Mason, 2026-11-02)

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

- 2026-11-02: plan written (v0.19.1). Mason's decisions recorded (v0.19.2): all five as
  recommended. Next: Phase 1, the data source layer.
