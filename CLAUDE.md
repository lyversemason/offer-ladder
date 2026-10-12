# OfferLadder: notes for agents

A public web app: a sales rep's commission and offer-ladder calculator with a
manager rules view, SQL reports and a vendor-data import. **Read PLAN.md first**,
starting at "Where we left off". It holds the scope, decisions, the math and milestones.

The owner (Mason) directs the work in plain language and doesn't hand-code. Explain
choices and tradeoffs plainly, in terms of concepts rather than syntax.

## Rules

- **Made-up data only.** No real retailer, brand, cost, price, rate or financing number.
  `tests/guard.test.ts` fails if a real name appears. Never weaken it.
- **Money math lives in `src/engine/` only.** Engine code is pure (no UI, no database,
  no I/O); money is integer cents, percents are basis points. Every engine change comes
  with tests. UI code calls the engine and never calculates margin or commission itself.
- Reports are `.sql` files in `src/db/queries/`, each with a plain-English header comment.
  Every query must be explainable by Mason (see docs/SQL-GUIDE.md); keep them readable.
- Private review notes live outside the repo.
- Click through the app in a real browser (rep and manager) before calling a version done.
- Local preview port: 10004 (`npx vite preview --port 10004`).

## Versioning (every change is a new version)

1. Next version: new feature → MINOR (0.3.0 → 0.4.0); fix or tweak → PATCH.
2. Set `version` in `package.json`.
3. Add a CHANGELOG.md section at the top: `## vX.Y.Z (YYYY-MM-DD HH:MM ET): Short title`,
   what changed in plain language, and a "Restore this if:" line.
4. `npm run check` must pass. Then `git add -A && git commit -m "vX.Y.Z: Short title"`,
   `git tag -a vX.Y.Z -m "Short title"`, and `git push && git push --tags` once a remote exists.
5. Never rewrite history. To go back, commit the old version as a new version.
