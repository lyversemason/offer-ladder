# OfferLadder: notes for agents

A public web app: a sales rep's commission and offer-ladder calculator with a
manager rules view, SQL reports and a vendor-data import. **Read PLAN.md first**,
starting at "Where we left off". It holds the scope, decisions, the math and milestones.

The owner (Mason) directs the work in plain language and doesn't hand-code. Explain
choices and tradeoffs plainly, in terms of concepts rather than syntax.

## Rules

- **Disguised data only.** Since 2026-10-12 the catalog and rules are modeled on Mason's
  real 2025 lineup, disguised: made-up brands, model names and SKUs, and every dollar
  amount disguised. Never write a real retailer, brand or product name, a real SKU, a
  real dollar amount, or HOW the numbers or SKUs were disguised anywhere in the repo
  (code, comments, docs, commits). The disguise method and the source files live only in
  Mason's private folder. `tests/guard.test.ts` fails if a real name appears. Never
  weaken it.
- The catalog source is a private, already-disguised export kept outside the repo. Never read the real cost
  report to change the catalog; ask Mason.
- **Money math lives in `src/engine/` only.** Engine code is pure (no UI, no database,
  no I/O); money is integer cents, percents are basis points. Every engine change comes
  with tests. UI code calls the engine and never calculates margin or commission itself.
- Reports are `.sql` files in `src/db/queries/`, each with a plain-English header comment.
  Every query must be explainable by Mason (see docs/SQL-GUIDE.md); keep them readable.
- **Two databases, one set of tables** (docs/database.md): SQLite in the browser
  (`src/db/schema.sql`) and Postgres in a local Supabase (`supabase/migrations/`). A table
  change goes in both (a new migration file; never edit one that already ran). A report
  that the two write differently has a Postgres version in `src/db/queries/postgres/`.
  When either changes: `npm run db:start`, `npm run db:reset`, `npm run test:db` must
  pass, then `npm run db:stop` (the ports are reachable from the home network). Agent
  shells started before Mason joined the docker group need `newgrp docker`.
- **Access rules** live in `src/data/access.ts` and, the same, in the database
  (`supabase/migrations/*_accounts.sql`); change both together. After changing any
  report, run `npm run db:report-functions` (a test fails until you do).
- Private review notes live outside the repo.
- Click through the app in a real browser (rep and manager) before calling a version done.
- Local preview port: 10004 (`npx vite preview --port 10004`). Live mode (`npm run dev:live`):
  10014; sign-in emails in Mailpit at 127.0.0.1:55324.

## Versioning (every change is a new version)

1. Next version: new feature → MINOR (0.3.0 → 0.4.0); fix or tweak → PATCH.
2. Set `version` in `package.json`.
3. Add a CHANGELOG.md section at the top: `## vX.Y.Z (YYYY-MM-DD HH:MM ET): Short title`,
   what changed in plain language, and a "Restore this if:" line.
4. `npm run check` must pass. Then `git add -A && git commit -m "vX.Y.Z: Short title"`,
   `git tag -a vX.Y.Z -m "Short title"`, and `git push && git push --tags` once a remote exists.
5. Never rewrite history. To go back, commit the old version as a new version.
