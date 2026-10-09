CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"initial_balance_cents" bigint DEFAULT 0 NOT NULL,
	"include_in_net_worth" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_user_id_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "accounts_name_length" CHECK (char_length("accounts"."name") between 1 and 40),
	CONSTRAINT "accounts_type_valid" CHECK ("accounts"."type" in ('cash', 'bank', 'card', 'wallet', 'savings', 'other')),
	CONSTRAINT "accounts_initial_balance_cents_range" CHECK ("accounts"."initial_balance_cents" between -99999999999 and 99999999999)
);
--> statement-breakpoint
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_user_id_id_kind_unique" UNIQUE("user_id","id","kind"),
	CONSTRAINT "categories_name_length" CHECK (char_length("categories"."name") between 1 and 40),
	CONSTRAINT "categories_kind_valid" CHECK ("categories"."kind" in ('income', 'expense'))
);
--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"date" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"account_id" uuid NOT NULL,
	"to_account_id" uuid,
	"category_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "transactions_kind_valid" CHECK ("transactions"."kind" in ('income', 'expense', 'transfer')),
	CONSTRAINT "transactions_amount_cents_range" CHECK ("transactions"."amount_cents" between 1 and 99999999999),
	CONSTRAINT "transactions_note_length" CHECK (char_length("transactions"."note") <= 120),
	CONSTRAINT "transactions_kind_fields" CHECK (case when "transactions"."kind" = 'transfer'
        then "transactions"."to_account_id" is not null and "transactions"."to_account_id" <> "transactions"."account_id" and "transactions"."category_id" is null
        else "transactions"."to_account_id" is null and "transactions"."category_id" is not null end)
);
--> statement-breakpoint
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_fk" FOREIGN KEY ("user_id","account_id") REFERENCES "public"."accounts"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_account_fk" FOREIGN KEY ("user_id","to_account_id") REFERENCES "public"."accounts"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_fk" FOREIGN KEY ("user_id","category_id","kind") REFERENCES "public"."categories"("user_id","id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_user_id_kind_name_unique" ON "categories" USING btree ("user_id","kind",lower("name"));--> statement-breakpoint
CREATE INDEX "transactions_user_id_date_idx" ON "transactions" USING btree ("user_id","date" DESC NULLS LAST,"created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "transactions_user_id_account_id_date_idx" ON "transactions" USING btree ("user_id","account_id","date");--> statement-breakpoint
CREATE INDEX "transactions_user_id_to_account_id_idx" ON "transactions" USING btree ("user_id","to_account_id") WHERE "transactions"."to_account_id" is not null;--> statement-breakpoint
CREATE INDEX "transactions_user_id_category_id_date_idx" ON "transactions" USING btree ("user_id","category_id","date");--> statement-breakpoint
CREATE POLICY "accounts_select_own" ON "accounts" AS PERMISSIVE FOR SELECT TO public USING ("accounts"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "accounts_insert_own" ON "accounts" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("accounts"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "accounts_update_own" ON "accounts" AS PERMISSIVE FOR UPDATE TO public USING ("accounts"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK ("accounts"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "accounts_delete_own" ON "accounts" AS PERMISSIVE FOR DELETE TO public USING ("accounts"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "categories_select_own" ON "categories" AS PERMISSIVE FOR SELECT TO public USING ("categories"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "categories_insert_own" ON "categories" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("categories"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "categories_update_own" ON "categories" AS PERMISSIVE FOR UPDATE TO public USING ("categories"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK ("categories"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "categories_delete_own" ON "categories" AS PERMISSIVE FOR DELETE TO public USING ("categories"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "transactions_select_own" ON "transactions" AS PERMISSIVE FOR SELECT TO public USING ("transactions"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "transactions_insert_own" ON "transactions" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("transactions"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "transactions_update_own" ON "transactions" AS PERMISSIVE FOR UPDATE TO public USING ("transactions"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK ("transactions"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "transactions_delete_own" ON "transactions" AS PERMISSIVE FOR DELETE TO public USING ("transactions"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);