-- Everyone signed in may read their own profile, even when their access is off,
-- so the sign-in screen can tell them so ("Your access has been turned off")
-- instead of "unknown account". They still read nothing else (phase 3).
DROP POLICY people_reads ON profiles;
CREATE POLICY people_reads ON profiles FOR SELECT TO authenticated USING (
  auth_user_id = (SELECT auth.uid())
  OR (SELECT private.my_role()) = 'admin'
  OR ((SELECT private.my_role()) = 'manager' AND store_id = (SELECT private.my_store())));
