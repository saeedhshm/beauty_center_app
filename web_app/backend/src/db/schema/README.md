# Database schema

The 17 business tables are defined in `core.ts`, `bookings.ts`, and `engagement.ts`. Drizzle Kit generates their versioned migrations in `../migrations/`.

The GiST exclusion constraint is maintained in the custom SQL migration: overlapping pending requests are allowed, but accepted, confirmed, and completed bookings for one expert cannot overlap. Always apply the full migration chain, not `drizzle-kit push`.

See `../../../docs/database.md` for representation choices, remaining business policies, and isolated PostgreSQL integration tests.
