-- Up Migration
ALTER TABLE sotto.purchase_attempts
  DROP CONSTRAINT purchase_attempts_state;

ALTER TABLE sotto.purchase_attempts
  ADD COLUMN prepared_transaction_hash text COLLATE "C",
  ADD COLUMN transfer_context_hash text COLLATE "C",
  ADD COLUMN prepared_verified_at timestamp with time zone,
  ADD CONSTRAINT purchase_attempts_state CHECK (
    state IN ('intent-created', 'prepared-hash-verified')
  ),
  ADD CONSTRAINT purchase_attempts_prepared_coherence CHECK (
    (
      state = 'intent-created'
      AND prepared_transaction_hash IS NULL
      AND transfer_context_hash IS NULL
      AND prepared_verified_at IS NULL
    )
    OR (
      state = 'prepared-hash-verified'
      AND prepared_transaction_hash ~ '^sha256:[0-9a-f]{64}$'
      AND transfer_context_hash ~ '^sha256:[0-9a-f]{64}$'
      AND prepared_verified_at IS NOT NULL
    )
  );

ALTER TABLE sotto.attempt_events
  DROP CONSTRAINT attempt_events_initial_sequence,
  DROP CONSTRAINT attempt_events_initial_type,
  DROP CONSTRAINT attempt_events_initial_previous;

ALTER TABLE sotto.attempt_events
  ADD COLUMN prepared_transaction_hash text COLLATE "C",
  ADD COLUMN transfer_context_hash text COLLATE "C",
  ADD COLUMN prepared_verified_at timestamp with time zone,
  ADD CONSTRAINT attempt_events_sequence CHECK (sequence IN (1, 2)),
  ADD CONSTRAINT attempt_events_type CHECK (
    event_type IN ('intent-created', 'prepared-hash-verified')
  ),
  ADD CONSTRAINT attempt_events_structure CHECK (
    (
      sequence = 1
      AND event_type = 'intent-created'
      AND previous_event_hash IS NULL
      AND prepared_transaction_hash IS NULL
      AND transfer_context_hash IS NULL
      AND prepared_verified_at IS NULL
    )
    OR (
      sequence = 2
      AND event_type = 'prepared-hash-verified'
      AND previous_event_hash ~ '^sha256:[0-9a-f]{64}$'
      AND prepared_transaction_hash ~ '^sha256:[0-9a-f]{64}$'
      AND transfer_context_hash ~ '^sha256:[0-9a-f]{64}$'
      AND prepared_verified_at IS NOT NULL
    )
  ),
  ADD CONSTRAINT attempt_events_type_unique UNIQUE (attempt_id, event_type);

ALTER TABLE sotto.outbox_jobs
  DROP CONSTRAINT outbox_jobs_state,
  DROP CONSTRAINT outbox_jobs_lease_coherence;

ALTER TABLE sotto.outbox_jobs
  ADD COLUMN result_event_sequence bigint,
  ADD COLUMN completed_at timestamp with time zone,
  ADD CONSTRAINT outbox_jobs_state CHECK (
    state IN ('ready', 'leased', 'completed')
  ),
  ADD CONSTRAINT outbox_jobs_result_event_fk
    FOREIGN KEY (attempt_id, result_event_sequence)
    REFERENCES sotto.attempt_events (attempt_id, sequence)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT outbox_jobs_lease_coherence CHECK (
    (
      state = 'ready'
      AND lease_owner IS NULL
      AND lease_expires_at IS NULL
      AND claimed_at IS NULL
      AND result_event_sequence IS NULL
      AND completed_at IS NULL
    )
    OR (
      state = 'leased'
      AND lease_generation > 0
      AND lease_owner IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND claimed_at IS NOT NULL
      AND lease_expires_at > claimed_at
      AND result_event_sequence IS NULL
      AND completed_at IS NULL
    )
    OR (
      state = 'completed'
      AND lease_generation > 0
      AND lease_owner IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND claimed_at IS NOT NULL
      AND lease_expires_at > claimed_at
      AND result_event_sequence = 2
      AND completed_at IS NOT NULL
      AND completed_at >= claimed_at
    )
  );

ALTER TABLE sotto.private_prepare_authorities
  ADD COLUMN retired_at timestamp with time zone,
  ADD CONSTRAINT private_prepare_authorities_retirement CHECK (
    retired_at IS NULL OR retired_at >= created_at
  );

CREATE INDEX private_prepare_authorities_active_idx
  ON sotto.private_prepare_authorities (attempt_id)
  WHERE retired_at IS NULL;

-- Down Migration
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM sotto.purchase_attempts
    WHERE state <> 'intent-created'
  ) OR EXISTS (
    SELECT 1 FROM sotto.private_prepare_authorities
    WHERE retired_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'prepared hash checkpoints must be archived before migration rollback'
      USING ERRCODE = '55000';
  END IF;
END
$$;

DROP INDEX sotto.private_prepare_authorities_active_idx;

ALTER TABLE sotto.private_prepare_authorities
  DROP CONSTRAINT private_prepare_authorities_retirement,
  DROP COLUMN retired_at;

ALTER TABLE sotto.outbox_jobs
  DROP CONSTRAINT outbox_jobs_lease_coherence,
  DROP CONSTRAINT outbox_jobs_result_event_fk,
  DROP CONSTRAINT outbox_jobs_state,
  DROP COLUMN completed_at,
  DROP COLUMN result_event_sequence,
  ADD CONSTRAINT outbox_jobs_state CHECK (state IN ('ready', 'leased')),
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

ALTER TABLE sotto.attempt_events
  DROP CONSTRAINT attempt_events_type_unique,
  DROP CONSTRAINT attempt_events_structure,
  DROP CONSTRAINT attempt_events_type,
  DROP CONSTRAINT attempt_events_sequence,
  DROP COLUMN prepared_verified_at,
  DROP COLUMN transfer_context_hash,
  DROP COLUMN prepared_transaction_hash,
  ADD CONSTRAINT attempt_events_initial_sequence CHECK (sequence = 1),
  ADD CONSTRAINT attempt_events_initial_type CHECK (
    event_type = 'intent-created'
  ),
  ADD CONSTRAINT attempt_events_initial_previous CHECK (
    previous_event_hash IS NULL
  );

ALTER TABLE sotto.purchase_attempts
  DROP CONSTRAINT purchase_attempts_prepared_coherence,
  DROP CONSTRAINT purchase_attempts_state,
  DROP COLUMN prepared_verified_at,
  DROP COLUMN transfer_context_hash,
  DROP COLUMN prepared_transaction_hash,
  ADD CONSTRAINT purchase_attempts_state CHECK (state = 'intent-created');
