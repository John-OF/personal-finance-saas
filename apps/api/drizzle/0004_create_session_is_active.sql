-- Hand-written. Whether the session behind an access token still exists. Supabase deletes the session
-- when the user signs out (here, on every device, or the others after a password change), but the
-- access tokens it already issued stay valid until they expire (up to an hour). withUserDb asks this
-- on every request, so those tokens stop reaching any data at once.
-- SECURITY DEFINER because the API role cannot read auth.sessions; it only answers for sessions of
-- the caller (app.user_id).
-- Stops the migration, and with it the deploy, if this role cannot read auth.sessions: the function
-- would be created anyway and every request would fail.
DO $$
BEGIN
  IF NOT has_table_privilege('auth.sessions', 'SELECT') THEN
    RAISE EXCEPTION '% cannot read auth.sessions', current_user;
  END IF;
END
$$;
--> statement-breakpoint
CREATE FUNCTION session_is_active(token_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.sessions s
    WHERE s.id = token_session_id
      AND s.user_id = nullif(current_setting('app.user_id', true), '')::uuid
      AND (s.not_after IS NULL OR s.not_after > now())
  )
$$;
--> statement-breakpoint
-- Fixed search_path and execution only for the API role, as in 0003.
DO $$
DECLARE
  grantee_name text;
BEGIN
  EXECUTE format(
    'ALTER FUNCTION session_is_active(uuid) SET search_path = %I, pg_temp',
    current_schema()
  );
  REVOKE ALL ON FUNCTION session_is_active(uuid) FROM PUBLIC;
  FOR grantee_name IN
    SELECT DISTINCT grantee FROM information_schema.role_table_grants
    WHERE table_schema = current_schema() AND table_name = 'profiles'
      AND privilege_type = 'SELECT' AND grantee <> current_user
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION session_is_active(uuid) TO %I', grantee_name);
  END LOOP;
END
$$;
