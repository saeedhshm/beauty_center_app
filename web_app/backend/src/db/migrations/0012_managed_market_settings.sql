-- Persist the current market currency without rewriting any historical money
-- snapshots or expert offers. Existing installations continue in EGP.
INSERT INTO "settings" ("key", "value")
VALUES ('market', '{"currency":"EGP"}'::jsonb)
ON CONFLICT ("key") DO NOTHING;
