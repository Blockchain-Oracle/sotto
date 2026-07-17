-- Up Migration
CREATE TABLE public.sotto_migration_upgrade_probe (
  id uuid PRIMARY KEY
);

-- Down Migration
DROP TABLE public.sotto_migration_upgrade_probe;
