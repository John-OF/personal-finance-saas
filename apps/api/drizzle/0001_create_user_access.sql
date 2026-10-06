CREATE TABLE "user_access" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_access_role_valid" CHECK ("user_access"."role" in ('user', 'admin')),
	CONSTRAINT "user_access_status_valid" CHECK ("user_access"."status" in ('active', 'suspended'))
);
--> statement-breakpoint
ALTER TABLE "user_access" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_access" ADD CONSTRAINT "user_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "user_access_select_own" ON "user_access" AS PERMISSIVE FOR SELECT TO public USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
-- Hand-written: the default privileges of bootstrap-db.sql give the API role DML on every table. For
-- user_access it may only read; RLS already has no write policy, this removes the privilege as well.
-- The role differs per schema (pf_api, pf_api_dev, the test role), so it is looked up.
DO $$
DECLARE
  grantee_name text;
BEGIN
  FOR grantee_name IN
    SELECT DISTINCT grantee FROM information_schema.role_table_grants
    WHERE table_schema = current_schema() AND table_name = 'user_access'
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE') AND grantee <> current_user
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON user_access FROM %I', grantee_name);
  END LOOP;
END
$$;
