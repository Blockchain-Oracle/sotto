-- Up Migration
SELECT pg_sleep(2);

CREATE TABLE public.sotto_migration_lock_probe (
  id integer PRIMARY KEY
);

-- Down Migration
DROP TABLE public.sotto_migration_lock_probe;
