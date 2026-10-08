CREATE TABLE "commission_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"date" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "commission_entries_amount_cents_range" CHECK ("commission_entries"."amount_cents" between 1 and 99999999999),
	CONSTRAINT "commission_entries_note_length" CHECK (char_length("commission_entries"."note") <= 80)
);
--> statement-breakpoint
ALTER TABLE "commission_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "commission_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"payday" date NOT NULL,
	"gross_cents" bigint NOT NULL,
	"percent_bp" integer NOT NULL,
	"expected_cents" bigint NOT NULL,
	"paid_cents" bigint NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_payouts_plan_id_payday_unique" UNIQUE("plan_id","payday"),
	CONSTRAINT "commission_payouts_percent_bp_range" CHECK ("commission_payouts"."percent_bp" between 1 and 10000),
	CONSTRAINT "commission_payouts_gross_cents_range" CHECK ("commission_payouts"."gross_cents" >= 0),
	CONSTRAINT "commission_payouts_expected_cents_range" CHECK ("commission_payouts"."expected_cents" >= 0),
	CONSTRAINT "commission_payouts_paid_cents_range" CHECK ("commission_payouts"."paid_cents" between 0 and 99999999999)
);
--> statement-breakpoint
ALTER TABLE "commission_payouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "commission_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"period_end_weekday" smallint NOT NULL,
	"payday_offset_days" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_plans_user_id_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "commission_plans_name_length" CHECK (char_length("commission_plans"."name") between 1 and 60),
	CONSTRAINT "commission_plans_period_end_weekday_range" CHECK ("commission_plans"."period_end_weekday" between 0 and 6),
	CONSTRAINT "commission_plans_payday_offset_days_range" CHECK ("commission_plans"."payday_offset_days" between 0 and 6)
);
--> statement-breakpoint
ALTER TABLE "commission_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "commission_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"percent_bp" integer NOT NULL,
	"effective_from" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_rates_plan_id_effective_from_unique" UNIQUE("plan_id","effective_from"),
	CONSTRAINT "commission_rates_percent_bp_range" CHECK ("commission_rates"."percent_bp" between 1 and 10000)
);
--> statement-breakpoint
ALTER TABLE "commission_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_plan_fk" FOREIGN KEY ("user_id","plan_id") REFERENCES "public"."commission_plans"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_payouts" ADD CONSTRAINT "commission_payouts_plan_fk" FOREIGN KEY ("user_id","plan_id") REFERENCES "public"."commission_plans"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_plans" ADD CONSTRAINT "commission_plans_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rates" ADD CONSTRAINT "commission_rates_plan_fk" FOREIGN KEY ("user_id","plan_id") REFERENCES "public"."commission_plans"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commission_entries_plan_id_date_idx" ON "commission_entries" USING btree ("plan_id","date");--> statement-breakpoint
CREATE POLICY "commission_entries_select_own" ON "commission_entries" AS PERMISSIVE FOR SELECT TO public USING ("commission_entries"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "commission_entries_insert_own" ON "commission_entries" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("commission_entries"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "commission_entries_update_own" ON "commission_entries" AS PERMISSIVE FOR UPDATE TO public USING ("commission_entries"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK ("commission_entries"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "commission_entries_delete_own" ON "commission_entries" AS PERMISSIVE FOR DELETE TO public USING ("commission_entries"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "commission_payouts_select_own" ON "commission_payouts" AS PERMISSIVE FOR SELECT TO public USING ("commission_payouts"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "commission_payouts_insert_own" ON "commission_payouts" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("commission_payouts"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "commission_payouts_update_own" ON "commission_payouts" AS PERMISSIVE FOR UPDATE TO public USING ("commission_payouts"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK ("commission_payouts"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "commission_payouts_delete_own" ON "commission_payouts" AS PERMISSIVE FOR DELETE TO public USING ("commission_payouts"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "commission_plans_select_own" ON "commission_plans" AS PERMISSIVE FOR SELECT TO public USING ("commission_plans"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "commission_plans_insert_own" ON "commission_plans" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("commission_plans"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "commission_plans_update_own" ON "commission_plans" AS PERMISSIVE FOR UPDATE TO public USING ("commission_plans"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK ("commission_plans"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "commission_plans_delete_own" ON "commission_plans" AS PERMISSIVE FOR DELETE TO public USING ("commission_plans"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "commission_rates_select_own" ON "commission_rates" AS PERMISSIVE FOR SELECT TO public USING ("commission_rates"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "commission_rates_insert_own" ON "commission_rates" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("commission_rates"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "commission_rates_update_own" ON "commission_rates" AS PERMISSIVE FOR UPDATE TO public USING ("commission_rates"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK ("commission_rates"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "commission_rates_delete_own" ON "commission_rates" AS PERMISSIVE FOR DELETE TO public USING ("commission_rates"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);