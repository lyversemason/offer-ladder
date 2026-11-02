-- Accounts and the audit log (added in v0.24.0). Kept apart from schema.sql and
-- written with IF NOT EXISTS, so a demo database saved in a browser before then
-- gains these tables when it opens, keeping everything recorded in it.

-- Everyone who can sign in to the live version, with their account's history.
-- Never deleted: access is turned off instead (the trigger refuses deletes).
CREATE TABLE IF NOT EXISTS profiles (
  id            TEXT PRIMARY KEY,               -- 'dana', 'lena', 'tasha', ...
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  role          TEXT NOT NULL,                  -- rep, manager, admin
  store_id      TEXT REFERENCES stores(id),     -- NULL for an admin
  rep_id        TEXT REFERENCES reps(id),       -- for a rep: their row in reps
  status        TEXT NOT NULL,                  -- invited, active, off
  invited_by    TEXT,
  invited_at    TEXT,                           -- ISO date and time
  activated_at  TEXT,
  turned_off_at TEXT,
  turned_off_by TEXT
);

CREATE TRIGGER IF NOT EXISTS profiles_no_delete BEFORE DELETE ON profiles
BEGIN SELECT RAISE(ABORT, 'People are never deleted: turn their access off instead.'); END;

-- Who did what to whom, when: account changes, rule changes, catalog imports.
-- Rows are only ever added: the triggers refuse changes and deletes.
CREATE TABLE IF NOT EXISTS audit_log (
  id        INTEGER PRIMARY KEY,
  at        TEXT NOT NULL,                      -- ISO date and time
  actor_id  TEXT NOT NULL,                      -- who did it
  action    TEXT NOT NULL,                      -- invited, turned_off, rules_changed, ...
  target_id TEXT,                               -- who it was done to (NULL for rules and catalog)
  detail    TEXT NOT NULL                       -- JSON: what changed
);

CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'The audit log is add-only: rows can''t be changed.'); END;

CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'The audit log is add-only: rows can''t be deleted.'); END;
