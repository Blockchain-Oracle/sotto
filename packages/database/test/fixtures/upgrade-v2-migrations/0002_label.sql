-- Up Migration
ALTER TABLE public.sotto_migration_upgrade_probe
  ADD COLUMN label text NOT NULL DEFAULT 'legacy';

ALTER TABLE public.sotto_migration_upgrade_probe
  ALTER COLUMN label DROP DEFAULT;

-- Down Migration
ALTER TABLE public.sotto_migration_upgrade_probe DROP COLUMN label;
