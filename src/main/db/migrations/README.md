# Database Migrations

This directory contains SQL migration files for the Constellations SQLite database.

## Migration File Format

Migrations follow a strict naming convention:
```
NNN_description.sql
```

- `NNN`: Three-digit version number (e.g., `001`, `002`, `003`)
- `description`: Brief snake_case description of the migration

Examples:
- `001_initial.sql`
- `002_add_model_embeddings.sql`
- `003_add_settings_table.sql`

## How Migrations Work

1. On startup, the migration runner checks the `schema_versions` table
2. It compares applied versions against available migration files
3. Any unapplied migrations are run in version order
4. Each migration is wrapped in a transaction for safety
5. Migration versions are recorded to prevent re-running

## Creating a New Migration

1. Create a new file with the next version number
2. Use `IF NOT EXISTS` for new tables (for idempotency)
3. For schema changes, use standard SQLite ALTER TABLE
4. Test the migration on a copy of your database first

## Important Notes

- **Forward-only**: There is no rollback mechanism. Test thoroughly!
- **Atomic**: Each migration runs in a transaction
- **Idempotent**: Use `IF NOT EXISTS` where possible
- **Order matters**: Migrations run in version number order

## Schema Versions Table

The `schema_versions` table tracks applied migrations:

```sql
CREATE TABLE schema_versions (
  version INTEGER PRIMARY KEY,  -- Migration number (e.g., 1, 2, 3)
  name TEXT NOT NULL,           -- Migration name (e.g., 'initial')
  applied_at INTEGER NOT NULL   -- Unix timestamp when applied
);
```
