-- UUID equality in GiST; PostgreSQL enforces this under concurrent accept transactions.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_expert_period_exclusion"
EXCLUDE USING gist (
  "expert_id" WITH =,
  tstzrange("starts_at", "ends_at", '[)') WITH &&
)
WHERE ("status" IN ('accepted', 'confirmed', 'completed'));
