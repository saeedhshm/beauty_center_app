CREATE TABLE "auth_otp_challenges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_otp_attempts_nonnegative" CHECK ("auth_otp_challenges"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "auth_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"hits" integer NOT NULL,
	"resets_at" timestamp with time zone NOT NULL,
	CONSTRAINT "auth_rate_hits_positive" CHECK ("auth_rate_limits"."hits" > 0)
);
--> statement-breakpoint
CREATE TABLE "auth_refresh_tokens" (
	"hash" text PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"access_hash" text NOT NULL,
	"access_expires_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_refresh_tokens" ADD CONSTRAINT "auth_refresh_tokens_session_id_auth_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."auth_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_otp_one_active_phone" ON "auth_otp_challenges" USING btree ("phone") WHERE "auth_otp_challenges"."consumed_at" is null;--> statement-breakpoint
CREATE INDEX "auth_otp_expires_idx" ON "auth_otp_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "auth_rate_resets_idx" ON "auth_rate_limits" USING btree ("resets_at");--> statement-breakpoint
CREATE INDEX "auth_refresh_session_idx" ON "auth_refresh_tokens" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_access_hash_unique" ON "auth_sessions" USING btree ("access_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_idx" ON "auth_sessions" USING btree ("expires_at");