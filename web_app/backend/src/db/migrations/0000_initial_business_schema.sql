CREATE TABLE "booking_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"status" text NOT NULL,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_status_history_status_valid" CHECK ("booking_status_history"."status" in ('pending', 'accepted', 'confirmed', 'completed', 'rejected', 'cancelled', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"expert_id" uuid NOT NULL,
	"service_id" smallint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"address_text" text NOT NULL,
	"city_id" smallint NOT NULL,
	"lat" numeric(9, 6),
	"lng" numeric(9, 6),
	"price" numeric(10, 2) NOT NULL,
	"commission_rate" numeric(7, 4) NOT NULL,
	"commission_amount" numeric(10, 2) NOT NULL,
	"expert_earning" numeric(10, 2) NOT NULL,
	"vat_rate" numeric(7, 4) NOT NULL,
	"vat_amount" numeric(10, 2) NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"notes" text,
	"cancelled_by" uuid,
	"cancellation_reason" text,
	"cancelled_at" timestamp with time zone,
	"payout_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_status_valid" CHECK ("bookings"."status" in ('pending', 'accepted', 'confirmed', 'completed', 'rejected', 'cancelled', 'expired')),
	CONSTRAINT "bookings_time_order" CHECK ("bookings"."ends_at" > "bookings"."starts_at"),
	CONSTRAINT "bookings_parties_distinct" CHECK ("bookings"."customer_id" <> "bookings"."expert_id"),
	CONSTRAINT "bookings_coordinates_valid" CHECK (("bookings"."lat" is null and "bookings"."lng" is null) or ("bookings"."lat" is not null and "bookings"."lng" is not null and "bookings"."lat" between -90 and 90 and "bookings"."lng" between -180 and 180)),
	CONSTRAINT "bookings_amounts_nonnegative" CHECK ("bookings"."price" >= 0 and "bookings"."commission_amount" >= 0 and "bookings"."expert_earning" >= 0 and "bookings"."vat_amount" >= 0 and "bookings"."total_amount" >= 0),
	CONSTRAINT "bookings_rates_valid" CHECK ("bookings"."commission_rate" between 0 and 100 and "bookings"."vat_rate" between 0 and 100),
	CONSTRAINT "bookings_currency_valid" CHECK ("bookings"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"card_last4" text,
	"failure_reason" text,
	"refunded_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"paid_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_status_valid" CHECK ("payments"."status" in ('pending', 'paid', 'failed', 'refunded')),
	CONSTRAINT "payments_amounts_valid" CHECK ("payments"."amount" >= 0 and "payments"."refunded_amount" >= 0 and "payments"."refunded_amount" <= "payments"."amount"),
	CONSTRAINT "payments_currency_valid" CHECK ("payments"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "payments_card_last4_valid" CHECK ("payments"."card_last4" is null or "payments"."card_last4" ~ '^[0-9]{4}$')
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expert_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"transfer_ref" text,
	"transferred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_id_expert_unique" UNIQUE("id","expert_id"),
	CONSTRAINT "payouts_amount_nonnegative" CHECK ("payouts"."amount" >= 0),
	CONSTRAINT "payouts_currency_valid" CHECK ("payouts"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" smallint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 32767 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"label" text NOT NULL,
	"address_text" text NOT NULL,
	"city_id" smallint NOT NULL,
	"lat" numeric(9, 6),
	"lng" numeric(9, 6),
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_addresses_coordinates_valid" CHECK (("customer_addresses"."lat" is null and "customer_addresses"."lng" is null) or ("customer_addresses"."lat" is not null and "customer_addresses"."lng" is not null and "customer_addresses"."lat" between -90 and 90 and "customer_addresses"."lng" between -180 and 180))
);
--> statement-breakpoint
CREATE TABLE "expert_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expert_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expert_availability_day_valid" CHECK ("expert_availability"."day_of_week" between 1 and 7)
);
--> statement-breakpoint
CREATE TABLE "expert_availability_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expert_id" uuid NOT NULL,
	"date" date NOT NULL,
	"start_time" time,
	"end_time" time,
	"type" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expert_availability_exceptions_type_valid" CHECK ("expert_availability_exceptions"."type" in ('available', 'unavailable')),
	CONSTRAINT "expert_availability_exceptions_times_paired" CHECK (("expert_availability_exceptions"."start_time" is null) = ("expert_availability_exceptions"."end_time" is null))
);
--> statement-breakpoint
CREATE TABLE "expert_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"bio" text,
	"approval_status" text DEFAULT 'pending' NOT NULL,
	"is_accepting_bookings" boolean DEFAULT false NOT NULL,
	"identity_document_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expert_profiles_approval_valid" CHECK ("expert_profiles"."approval_status" in ('pending', 'approved', 'suspended'))
);
--> statement-breakpoint
CREATE TABLE "expert_services" (
	"expert_id" uuid NOT NULL,
	"service_id" smallint NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expert_services_expert_id_service_id_pk" PRIMARY KEY("expert_id","service_id"),
	CONSTRAINT "expert_services_price_nonnegative" CHECK ("expert_services"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "portfolio_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expert_id" uuid NOT NULL,
	"service_id" smallint,
	"storage_key" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" smallint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "services_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 32767 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text,
	"duration_min" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_duration_positive" CHECK ("services"."duration_min" > 0)
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"password_hash" text,
	"role" text NOT NULL,
	"city_id" smallint,
	"is_active" boolean DEFAULT true NOT NULL,
	"rating_avg" numeric(3, 2) DEFAULT '0' NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_valid" CHECK ("users"."role" in ('customer', 'expert', 'admin')),
	CONSTRAINT "users_rating_valid" CHECK ("users"."rating_avg" between 0 and 5 and "users"."rating_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "device_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"reviewee_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_rating_valid" CHECK ("reviews"."rating" between 1 and 5),
	CONSTRAINT "reviews_parties_distinct" CHECK ("reviews"."reviewer_id" <> "reviews"."reviewee_id")
);
--> statement-breakpoint
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_expert_id_service_id_expert_services_expert_id_service_id_fk" FOREIGN KEY ("expert_id","service_id") REFERENCES "public"."expert_services"("expert_id","service_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_payout_id_expert_id_payouts_id_expert_id_fk" FOREIGN KEY ("payout_id","expert_id") REFERENCES "public"."payouts"("id","expert_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_expert_id_expert_profiles_user_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."expert_profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_availability" ADD CONSTRAINT "expert_availability_expert_id_expert_profiles_user_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."expert_profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_availability_exceptions" ADD CONSTRAINT "expert_availability_exceptions_expert_id_expert_profiles_user_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."expert_profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_profiles" ADD CONSTRAINT "expert_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_services" ADD CONSTRAINT "expert_services_expert_id_expert_profiles_user_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."expert_profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_services" ADD CONSTRAINT "expert_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_images" ADD CONSTRAINT "portfolio_images_expert_id_expert_profiles_user_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."expert_profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_images" ADD CONSTRAINT "portfolio_images_expert_id_service_id_expert_services_expert_id_service_id_fk" FOREIGN KEY ("expert_id","service_id") REFERENCES "public"."expert_services"("expert_id","service_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewee_id_users_id_fk" FOREIGN KEY ("reviewee_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_status_history_booking_created_idx" ON "booking_status_history" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "bookings_expert_starts_idx" ON "bookings" USING btree ("expert_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_customer_starts_idx" ON "bookings" USING btree ("customer_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_status_expires_idx" ON "bookings" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_ref_unique" ON "payments" USING btree ("provider","provider_ref");--> statement-breakpoint
CREATE INDEX "payments_booking_idx" ON "payments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "payouts_expert_idx" ON "payouts" USING btree ("expert_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cities_name_unique" ON "cities" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_addresses_one_default" ON "customer_addresses" USING btree ("customer_id") WHERE "customer_addresses"."is_default";--> statement-breakpoint
CREATE INDEX "customer_addresses_customer_idx" ON "customer_addresses" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "expert_availability_expert_day_idx" ON "expert_availability" USING btree ("expert_id","day_of_week");--> statement-breakpoint
CREATE INDEX "expert_availability_exceptions_expert_date_idx" ON "expert_availability_exceptions" USING btree ("expert_id","date");--> statement-breakpoint
CREATE INDEX "portfolio_images_expert_idx" ON "portfolio_images" USING btree ("expert_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_unique" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "device_tokens_token_unique" ON "device_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "device_tokens_user_idx" ON "device_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_booking_reviewer_unique" ON "reviews" USING btree ("booking_id","reviewer_id");--> statement-breakpoint
CREATE INDEX "reviews_reviewee_idx" ON "reviews" USING btree ("reviewee_id");