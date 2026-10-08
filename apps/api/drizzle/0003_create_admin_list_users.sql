-- Hand-written. The user list of the admin panel (plan §10): every Supabase Auth user with their
-- profile and access in this schema. Only account metadata, nothing financial (plan §9.9).
-- SECURITY DEFINER because the API role cannot read auth.users nor other users' rows; in exchange it
-- first checks that the caller (app.user_id, set by withUserDb from the verified token) is an active
-- admin here, and fails otherwise.
-- The casts keep the declared result types whatever auth.users uses (its email is a varchar).
CREATE FUNCTION admin_list_users(search text, max_rows integer, skip_rows integer)
RETURNS TABLE (
  id uuid,
  email text,
  display_name text,
  role text,
  status text,
  created_at timestamptz,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  has_profile boolean,
  onboarded_at timestamptz,
  enabled_modules text[],
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  caller uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  -- `%` and `_` typed by the admin are searched literally.
  pattern text := '%' || replace(replace(replace(search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
BEGIN
  IF caller IS NULL OR NOT EXISTS (
    SELECT 1 FROM user_access ua
    WHERE ua.user_id = caller AND ua.role = 'admin' AND ua.status = 'active'
  ) THEN
    RAISE EXCEPTION 'admin_list_users: the caller is not an admin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    p.display_name,
    coalesce(ua.role, 'user'),
    coalesce(ua.status, 'active'),
    u.created_at::timestamptz,
    u.email_confirmed_at::timestamptz,
    u.last_sign_in_at::timestamptz,
    p.id IS NOT NULL,
    p.onboarded_at,
    p.enabled_modules,
    count(*) OVER ()
  FROM auth.users u
  LEFT JOIN profiles p ON p.id = u.id
  LEFT JOIN user_access ua ON ua.user_id = u.id
  WHERE u.deleted_at IS NULL
    AND (coalesce(search, '') = '' OR u.email ILIKE pattern OR p.display_name ILIKE pattern)
  ORDER BY u.created_at DESC NULLS LAST, u.id
  LIMIT max_rows OFFSET skip_rows;
END
$$;
--> statement-breakpoint
-- A SECURITY DEFINER function needs a fixed search_path: this schema, and pg_temp last so a temporary
-- table cannot stand in for user_access. Only the API role may call it. Both the schema and the role
-- differ per environment (app, app_dev, the tests), so they are looked up as in 0001.
DO $$
DECLARE
  grantee_name text;
BEGIN
  EXECUTE format(
    'ALTER FUNCTION admin_list_users(text, integer, integer) SET search_path = %I, pg_temp',
    current_schema()
  );
  REVOKE ALL ON FUNCTION admin_list_users(text, integer, integer) FROM PUBLIC;
  FOR grantee_name IN
    SELECT DISTINCT grantee FROM information_schema.role_table_grants
    WHERE table_schema = current_schema() AND table_name = 'profiles'
      AND privilege_type = 'SELECT' AND grantee <> current_user
  LOOP
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION admin_list_users(text, integer, integer) TO %I',
      grantee_name
    );
  END LOOP;
END
$$;
