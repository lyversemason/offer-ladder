-- Accounts and access rules (docs/accounts-plan.md, phase 2).
--
-- profiles: one row per person who can sign in, linked to Supabase's sign-in
-- account (auth.users). Never deleted: access is turned off instead.
--
-- Access rules (row-level security), the same as src/data/access.ts (canSee):
--   admin          sees every record
--   store manager  sees their store's records
--   rep            sees their own records
--   anyone else    (signed out, invited but not signed in, access turned off) sees nothing
-- The catalog, the rules and the store names are readable by everyone signed in
-- (reps need them to price). Browsers can't change anything, with one exception:
-- a rep may add their own usage events. Everything else will be saved by a server
-- function that checks it first (phase 4).

CREATE TABLE profiles (
  id             TEXT PRIMARY KEY,               -- the app's own id: 'dana', 'lena', 'tasha', ...
  auth_user_id   UUID UNIQUE REFERENCES auth.users (id),  -- empty until they first sign in
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  role           TEXT NOT NULL CHECK (role IN ('rep', 'manager', 'admin')),
  store_id       TEXT REFERENCES stores (id),    -- a rep's or store manager's store; NULL for an admin
  rep_id         TEXT REFERENCES reps (id),      -- for a rep: their row in reps
  status         TEXT NOT NULL CHECK (status IN ('invited', 'active', 'off')),
  invited_by     TEXT REFERENCES profiles (id),
  invited_at     TIMESTAMPTZ,
  activated_at   TIMESTAMPTZ,
  turned_off_at  TIMESTAMPTZ,
  turned_off_by  TEXT REFERENCES profiles (id),
  -- Each role has exactly what it needs: an admin no store, a manager a store, a rep a store and a rep row.
  CHECK (
    (role = 'admin'   AND store_id IS NULL     AND rep_id IS NULL) OR
    (role = 'manager' AND store_id IS NOT NULL AND rep_id IS NULL) OR
    (role = 'rep'     AND store_id IS NOT NULL AND rep_id IS NOT NULL)
  )
);

CREATE FUNCTION profiles_no_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'People are never deleted: turn their access off instead.';
END;
$$;

CREATE TRIGGER profiles_no_delete
BEFORE DELETE OR TRUNCATE ON profiles
FOR EACH STATEMENT EXECUTE FUNCTION profiles_no_delete();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Who is asking. These live in their own schema, which the public API doesn't
-- expose, and run with the owner's rights (SECURITY DEFINER) so they can read
-- profiles without going round in circles through profiles' own rules. Each
-- returns NULL for anyone whose access isn't on.
CREATE SCHEMA private;

CREATE FUNCTION private.my_role() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT role FROM public.profiles WHERE auth_user_id = auth.uid() AND status = 'active'
$$;

CREATE FUNCTION private.my_store() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT store_id FROM public.profiles WHERE auth_user_id = auth.uid() AND status = 'active'
$$;

CREATE FUNCTION private.my_rep() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT rep_id FROM public.profiles WHERE auth_user_id = auth.uid() AND status = 'active'
$$;

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon;

-- In the rules below, "(SELECT private.my_role())" in brackets is worked out once
-- per query instead of once per row (the usage log has 30,000 rows), which is
-- Supabase's own advice for fast access rules.

-- Shared by everyone signed in: what the reps price with.
CREATE POLICY signed_in_reads ON stores           FOR SELECT TO authenticated USING ((SELECT private.my_role()) IS NOT NULL);
CREATE POLICY signed_in_reads ON products         FOR SELECT TO authenticated USING ((SELECT private.my_role()) IS NOT NULL);
CREATE POLICY signed_in_reads ON settings_history FOR SELECT TO authenticated USING ((SELECT private.my_role()) IS NOT NULL);

-- Records that belong to a rep at a store (canSee in access.ts): an admin sees
-- them all, a store manager their store's, a rep their own.
CREATE POLICY owner_reads ON reps FOR SELECT TO authenticated USING (
  (SELECT private.my_role()) = 'admin'
  OR ((SELECT private.my_role()) = 'manager' AND store_id = (SELECT private.my_store()))
  OR ((SELECT private.my_role()) = 'rep' AND id = (SELECT private.my_rep())));
CREATE POLICY owner_reads ON visits FOR SELECT TO authenticated USING (
  (SELECT private.my_role()) = 'admin'
  OR ((SELECT private.my_role()) = 'manager' AND store_id = (SELECT private.my_store()))
  OR ((SELECT private.my_role()) = 'rep' AND rep_id = (SELECT private.my_rep())));
CREATE POLICY owner_reads ON deals FOR SELECT TO authenticated USING (
  (SELECT private.my_role()) = 'admin'
  OR ((SELECT private.my_role()) = 'manager' AND store_id = (SELECT private.my_store()))
  OR ((SELECT private.my_role()) = 'rep' AND rep_id = (SELECT private.my_rep())));
CREATE POLICY owner_reads ON events FOR SELECT TO authenticated USING (
  (SELECT private.my_role()) = 'admin'
  OR ((SELECT private.my_role()) = 'manager' AND store_id = (SELECT private.my_store()))
  OR ((SELECT private.my_role()) = 'rep' AND rep_id = (SELECT private.my_rep())));
CREATE POLICY owner_reads ON traffic FOR SELECT TO authenticated USING (
  (SELECT private.my_role()) = 'admin'
  OR ((SELECT private.my_role()) = 'manager' AND store_id = (SELECT private.my_store()))
  OR ((SELECT private.my_role()) = 'rep' AND rep_id = (SELECT private.my_rep())));

-- Records that belong to one of those follow their parent: an offer is visible
-- when its customer is, a line when its offer (or sale) is. The inner SELECT is
-- itself filtered by the parent's rule.
CREATE POLICY owner_reads ON deal_lines    FOR SELECT TO authenticated USING (deal_id IN (SELECT id FROM deals));
CREATE POLICY owner_reads ON offers        FOR SELECT TO authenticated USING (visit_id IN (SELECT id FROM visits));
CREATE POLICY owner_reads ON offer_lines   FOR SELECT TO authenticated USING (offer_id IN (SELECT id FROM offers));
CREATE POLICY owner_reads ON offer_reasons FOR SELECT TO authenticated USING (offer_id IN (SELECT id FROM offers));

-- People: yourself; a store manager also their store's people; an admin everyone (canSeePerson).
CREATE POLICY people_reads ON profiles FOR SELECT TO authenticated USING (
  ((SELECT private.my_role()) IS NOT NULL AND auth_user_id = (SELECT auth.uid()))
  OR (SELECT private.my_role()) = 'admin'
  OR ((SELECT private.my_role()) = 'manager' AND store_id = (SELECT private.my_store())));

-- The one thing a browser may write: a rep adds their own usage events.
CREATE POLICY rep_adds_own ON events FOR INSERT TO authenticated WITH CHECK (
  (SELECT private.my_role()) = 'rep' AND rep_id = (SELECT private.my_rep()) AND store_id = (SELECT private.my_store()));

-- Signed-in people may read (the rules above decide which rows) and nothing else;
-- the public key alone (signed out) gets nothing at all.
GRANT SELECT ON stores, reps, products, visits, deals, deal_lines, offers, offer_lines,
                offer_reasons, events, traffic, settings_history, profiles, offer_facts TO authenticated;
GRANT INSERT ON events TO authenticated;
GRANT USAGE ON SEQUENCE events_id_seq TO authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
