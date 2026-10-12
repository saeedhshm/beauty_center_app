-- Explicit launch decision; preserve existing history and administrator-edited settings.
UPDATE "cities" SET "code" = 'EG-CAI' WHERE "name" = 'القاهرة' AND "code" IS NULL;
--> statement-breakpoint
INSERT INTO "cities" ("name", "code", "is_active") VALUES ('القاهرة', 'EG-CAI', true)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "settings" ("key", "value")
VALUES ('booking_policy', '{"acceptanceTimeoutMinutes":10,"paymentTimeoutMinutes":10,"commissionRate":"20.0000"}'::jsonb)
ON CONFLICT ("key") DO NOTHING;
