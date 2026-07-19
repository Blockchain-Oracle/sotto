-- Up Migration
CREATE TABLE public.sotto_migration_rollback_probe (
  id integer PRIMARY KEY
);

-- Down Migration
DROP TABLE public.sotto_migration_rollback_probe;
