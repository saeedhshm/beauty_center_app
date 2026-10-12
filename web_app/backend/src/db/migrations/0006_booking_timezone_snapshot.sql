-- The project's pre-Cairo market was Asia/Riyadh. Retain that display context
-- for historical rows; EGP rows from the Cairo rollout use Africa/Cairo.
ALTER TABLE "bookings" ADD COLUMN "time_zone" text;
--> statement-breakpoint
UPDATE "bookings" SET "time_zone" = CASE WHEN "currency" = 'EGP' THEN 'Africa/Cairo' ELSE 'Asia/Riyadh' END;
--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "time_zone" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "time_zone" SET DEFAULT 'Africa/Cairo';
