CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"locale" text DEFAULT 'es-EC' NOT NULL,
	"timezone" text DEFAULT 'America/Guayaquil' NOT NULL,
	"week_starts_on" smallint DEFAULT 1 NOT NULL,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_display_name_length" CHECK (char_length("profiles"."display_name") between 1 and 80),
	CONSTRAINT "profiles_currency_format" CHECK ("profiles"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "profiles_week_starts_on_range" CHECK ("profiles"."week_starts_on" between 1 and 7)
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "profiles_select_own" ON "profiles" AS PERMISSIVE FOR SELECT TO public USING (id = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "profiles_insert_own" ON "profiles" AS PERMISSIVE FOR INSERT TO public WITH CHECK (id = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "profiles_update_own" ON "profiles" AS PERMISSIVE FOR UPDATE TO public USING (id = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK (id = nullif(current_setting('app.user_id', true), '')::uuid);