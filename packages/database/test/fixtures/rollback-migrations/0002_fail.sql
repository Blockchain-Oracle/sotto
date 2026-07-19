-- Up Migration
INSERT INTO public.sotto_migration_rollback_probe (id) VALUES (1);
SELECT 1 / 0;

-- Down Migration
DELETE FROM public.sotto_migration_rollback_probe WHERE id = 1;
