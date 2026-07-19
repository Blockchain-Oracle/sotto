-- Up Migration
ALTER TABLE sotto.outbox_jobs
  DROP CONSTRAINT outbox_jobs_state;

ALTER TABLE sotto.outbox_jobs
  ADD COLUMN lease_generation bigint NOT NULL DEFAULT 0,
  ADD COLUMN lease_owner text COLLATE "C",
  ADD COLUMN lease_expires_at timestamp with time zone,
  ADD COLUMN claimed_at timestamp with time zone;

ALTER TABLE sotto.outbox_jobs
  ADD CONSTRAINT outbox_jobs_state CHECK (state IN ('ready', 'leased')),
  ADD CONSTRAINT outbox_jobs_lease_generation CHECK (
    lease_generation >= 0
  ),
  ADD CONSTRAINT outbox_jobs_lease_owner CHECK (
    lease_owner IS NULL
    OR lease_owner ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  ),
  ADD CONSTRAINT outbox_jobs_lease_coherence CHECK (
    (
      state = 'ready'
      AND lease_owner IS NULL
      AND lease_expires_at IS NULL
      AND claimed_at IS NULL
    )
    OR (
      state = 'leased'
      AND lease_generation > 0
      AND lease_owner IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND claimed_at IS NOT NULL
      AND lease_expires_at > claimed_at
    )
  );

CREATE INDEX outbox_jobs_expired_lease_idx ON sotto.outbox_jobs (
  lease_expires_at,
  available_at,
  job_id
) WHERE state = 'leased';

-- Down Migration
DROP INDEX sotto.outbox_jobs_expired_lease_idx;

ALTER TABLE sotto.outbox_jobs
  DROP CONSTRAINT outbox_jobs_lease_coherence,
  DROP CONSTRAINT outbox_jobs_lease_owner,
  DROP CONSTRAINT outbox_jobs_lease_generation,
  DROP CONSTRAINT outbox_jobs_state;

ALTER TABLE sotto.outbox_jobs
  DROP COLUMN claimed_at,
  DROP COLUMN lease_expires_at,
  DROP COLUMN lease_owner,
  DROP COLUMN lease_generation;

ALTER TABLE sotto.outbox_jobs
  ADD CONSTRAINT outbox_jobs_state CHECK (state = 'ready');
