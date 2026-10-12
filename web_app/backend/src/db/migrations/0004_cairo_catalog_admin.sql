CREATE TABLE "admin_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "currency" SET DEFAULT 'EGP';--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "currency" SET DEFAULT 'EGP';--> statement-breakpoint
ALTER TABLE "payouts" ALTER COLUMN "currency" SET DEFAULT 'EGP';--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "audience" text DEFAULT 'mobile' NOT NULL;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "code" text;--> statement-breakpoint
-- Preserve the denomination of previously stored expert prices; no FX conversion is inferred.
ALTER TABLE "expert_services" ADD COLUMN "currency" text DEFAULT 'SAR' NOT NULL;--> statement-breakpoint
ALTER TABLE "expert_services" ALTER COLUMN "currency" SET DEFAULT 'EGP';--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_resource_created_idx" ON "admin_audit_logs" USING btree ("resource_type","resource_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cities_code_unique" ON "cities" USING btree ("code");--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_audience_valid" CHECK ("auth_sessions"."audience" in ('mobile', 'admin'));--> statement-breakpoint
ALTER TABLE "expert_services" ADD CONSTRAINT "expert_services_currency_valid" CHECK ("expert_services"."currency" ~ '^[A-Z]{3}$');
