-- Up Migration
ALTER TABLE sotto.purchase_attempts
  DROP CONSTRAINT purchase_attempts_state,
  DROP CONSTRAINT purchase_attempts_prepared_coherence;

ALTER TABLE sotto.purchase_attempts
  ADD COLUMN wallet_session_id text COLLATE "C",
  ADD COLUMN wallet_connector_kind text COLLATE "C",
  ADD COLUMN wallet_connector_id text COLLATE "C",
  ADD COLUMN wallet_decision_reason text COLLATE "C",
  ADD COLUMN approval_requested_at timestamp with time zone,
  ADD COLUMN wallet_decided_at timestamp with time zone,
  ADD COLUMN signature_verified_at timestamp with time zone,
  ADD COLUMN submission_id uuid,
  ADD COLUMN execution_user_id text COLLATE "C",
  ADD COLUMN execution_started_at timestamp with time zone,
  ADD CONSTRAINT purchase_attempts_state CHECK (
    state IN (
      'intent-created',
      'prepared-hash-verified',
      'approval-requested',
      'wallet-rejected',
      'wallet-unsupported',
      'signature-verified',
      'execution-started'
    )
  ),
  ADD CONSTRAINT purchase_attempts_wallet_session CHECK (
    wallet_session_id IS NULL
    OR wallet_session_id ~ '^sha256:[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT purchase_attempts_wallet_connector_kind CHECK (
    wallet_connector_kind IS NULL
    OR wallet_connector_kind IN ('openrpc', 'wallet-sdk')
  ),
  ADD CONSTRAINT purchase_attempts_wallet_connector_id CHECK (
    wallet_connector_id IS NULL
    OR wallet_connector_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$'
  ),
  ADD CONSTRAINT purchase_attempts_wallet_reason CHECK (
    wallet_decision_reason IS NULL
    OR wallet_decision_reason ~ '^[a-z][a-z0-9-]{0,127}$'
  ),
  ADD CONSTRAINT purchase_attempts_execution_user CHECK (
    execution_user_id IS NULL
    OR (
      char_length(execution_user_id) BETWEEN 1 AND 512
      AND execution_user_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]*$'
    )
  ),
  ADD CONSTRAINT purchase_attempts_lifecycle_coherence CHECK ((
    (
      state = 'intent-created'
      AND prepared_transaction_hash IS NULL
      AND transfer_context_hash IS NULL
      AND prepared_verified_at IS NULL
      AND wallet_session_id IS NULL
      AND wallet_connector_kind IS NULL
      AND wallet_connector_id IS NULL
      AND wallet_decision_reason IS NULL
      AND approval_requested_at IS NULL
      AND wallet_decided_at IS NULL
      AND signature_verified_at IS NULL
      AND submission_id IS NULL
      AND execution_user_id IS NULL
      AND execution_started_at IS NULL
    )
    OR (
      state = 'prepared-hash-verified'
      AND prepared_transaction_hash ~ '^sha256:[0-9a-f]{64}$'
      AND transfer_context_hash ~ '^sha256:[0-9a-f]{64}$'
      AND prepared_verified_at IS NOT NULL
      AND wallet_session_id IS NULL
      AND wallet_connector_kind IS NULL
      AND wallet_connector_id IS NULL
      AND wallet_decision_reason IS NULL
      AND approval_requested_at IS NULL
      AND wallet_decided_at IS NULL
      AND signature_verified_at IS NULL
      AND submission_id IS NULL
      AND execution_user_id IS NULL
      AND execution_started_at IS NULL
    )
    OR (
      state = 'approval-requested'
      AND prepared_transaction_hash ~ '^sha256:[0-9a-f]{64}$'
      AND transfer_context_hash ~ '^sha256:[0-9a-f]{64}$'
      AND prepared_verified_at IS NOT NULL
      AND wallet_session_id ~ '^sha256:[0-9a-f]{64}$'
      AND wallet_connector_kind IN ('openrpc', 'wallet-sdk')
      AND wallet_connector_id IS NOT NULL
      AND wallet_decision_reason IS NULL
      AND approval_requested_at IS NOT NULL
      AND approval_requested_at >= prepared_verified_at
      AND approval_requested_at < execute_before
      AND wallet_decided_at IS NULL
      AND signature_verified_at IS NULL
      AND submission_id IS NULL
      AND execution_user_id IS NULL
      AND execution_started_at IS NULL
    )
    OR (
      state = 'wallet-rejected'
      AND prepared_transaction_hash ~ '^sha256:[0-9a-f]{64}$'
      AND transfer_context_hash ~ '^sha256:[0-9a-f]{64}$'
      AND prepared_verified_at IS NOT NULL
      AND wallet_session_id ~ '^sha256:[0-9a-f]{64}$'
      AND wallet_connector_kind IN ('openrpc', 'wallet-sdk')
      AND wallet_connector_id IS NOT NULL
      AND wallet_decision_reason = 'user-rejected'
      AND approval_requested_at IS NOT NULL
      AND wallet_decided_at >= approval_requested_at
      AND signature_verified_at IS NULL
      AND submission_id IS NULL
      AND execution_user_id IS NULL
      AND execution_started_at IS NULL
    )
    OR (
      state = 'wallet-unsupported'
      AND prepared_transaction_hash ~ '^sha256:[0-9a-f]{64}$'
      AND transfer_context_hash ~ '^sha256:[0-9a-f]{64}$'
      AND prepared_verified_at IS NOT NULL
      AND wallet_session_id IS NULL
      AND wallet_connector_kind IN ('openrpc', 'wallet-sdk')
      AND wallet_connector_id IS NOT NULL
      AND wallet_decision_reason LIKE 'unsupported-%'
      AND approval_requested_at IS NULL
      AND wallet_decided_at >= prepared_verified_at
      AND signature_verified_at IS NULL
      AND submission_id IS NULL
      AND execution_user_id IS NULL
      AND execution_started_at IS NULL
    )
    OR (
      state = 'signature-verified'
      AND prepared_transaction_hash ~ '^sha256:[0-9a-f]{64}$'
      AND transfer_context_hash ~ '^sha256:[0-9a-f]{64}$'
      AND prepared_verified_at IS NOT NULL
      AND wallet_session_id ~ '^sha256:[0-9a-f]{64}$'
      AND wallet_connector_kind IN ('openrpc', 'wallet-sdk')
      AND wallet_connector_id IS NOT NULL
      AND wallet_decision_reason IS NULL
      AND approval_requested_at IS NOT NULL
      AND signature_verified_at >= approval_requested_at
      AND signature_verified_at < execute_before
      AND wallet_decided_at IS NULL
      AND submission_id IS NULL
      AND execution_user_id IS NULL
      AND execution_started_at IS NULL
    )
    OR (
      state = 'execution-started'
      AND prepared_transaction_hash ~ '^sha256:[0-9a-f]{64}$'
      AND transfer_context_hash ~ '^sha256:[0-9a-f]{64}$'
      AND prepared_verified_at IS NOT NULL
      AND wallet_session_id ~ '^sha256:[0-9a-f]{64}$'
      AND wallet_connector_kind IN ('openrpc', 'wallet-sdk')
      AND wallet_connector_id IS NOT NULL
      AND wallet_decision_reason IS NULL
      AND approval_requested_at IS NOT NULL
      AND signature_verified_at >= approval_requested_at
      AND signature_verified_at < execute_before
      AND submission_id IS NOT NULL
      AND execution_user_id IS NOT NULL
      AND execution_started_at >= signature_verified_at
      AND execution_started_at < execute_before
      AND wallet_decided_at IS NULL
    )
  ) IS TRUE),
  ADD CONSTRAINT purchase_attempts_submission_unique UNIQUE (submission_id),
  ADD CONSTRAINT purchase_attempts_wallet_session_unique UNIQUE (
    wallet_session_id
  ),
  ADD CONSTRAINT purchase_attempts_attempt_command_unique UNIQUE (
    attempt_id,
    command_id
  );

ALTER TABLE sotto.attempt_events
  DROP CONSTRAINT attempt_events_sequence,
  DROP CONSTRAINT attempt_events_type,
  DROP CONSTRAINT attempt_events_structure;

ALTER TABLE sotto.attempt_events
  ADD COLUMN wallet_session_id text COLLATE "C",
  ADD COLUMN wallet_connector_kind text COLLATE "C",
  ADD COLUMN wallet_connector_id text COLLATE "C",
  ADD COLUMN wallet_decision_reason text COLLATE "C",
  ADD COLUMN signature_verified_at timestamp with time zone,
  ADD COLUMN submission_id uuid,
  ADD COLUMN execution_user_id text COLLATE "C",
  ADD COLUMN execution_started_at timestamp with time zone,
  ADD CONSTRAINT attempt_events_sequence CHECK (sequence IN (1, 2, 3, 4, 5)),
  ADD CONSTRAINT attempt_events_type CHECK (
    event_type IN (
      'intent-created',
      'prepared-hash-verified',
      'approval-requested',
      'wallet-rejected',
      'wallet-unsupported',
      'signature-verified',
      'execution-started'
    )
  ),
  ADD CONSTRAINT attempt_events_structure CHECK ((
    (
      sequence = 1
      AND event_type = 'intent-created'
      AND previous_event_hash IS NULL
      AND prepared_transaction_hash IS NULL
      AND transfer_context_hash IS NULL
      AND prepared_verified_at IS NULL
      AND wallet_session_id IS NULL
      AND wallet_connector_kind IS NULL
      AND wallet_connector_id IS NULL
      AND wallet_decision_reason IS NULL
      AND signature_verified_at IS NULL
      AND submission_id IS NULL
      AND execution_user_id IS NULL
      AND execution_started_at IS NULL
    )
    OR (
      sequence = 2
      AND event_type = 'prepared-hash-verified'
      AND previous_event_hash ~ '^sha256:[0-9a-f]{64}$'
      AND prepared_transaction_hash ~ '^sha256:[0-9a-f]{64}$'
      AND transfer_context_hash ~ '^sha256:[0-9a-f]{64}$'
      AND prepared_verified_at IS NOT NULL
      AND wallet_session_id IS NULL
      AND wallet_connector_kind IS NULL
      AND wallet_connector_id IS NULL
      AND wallet_decision_reason IS NULL
      AND signature_verified_at IS NULL
      AND submission_id IS NULL
      AND execution_user_id IS NULL
      AND execution_started_at IS NULL
    )
    OR (
      sequence = 3
      AND event_type = 'approval-requested'
      AND previous_event_hash ~ '^sha256:[0-9a-f]{64}$'
      AND prepared_transaction_hash IS NULL
      AND transfer_context_hash IS NULL
      AND prepared_verified_at IS NULL
      AND wallet_session_id ~ '^sha256:[0-9a-f]{64}$'
      AND wallet_connector_kind IN ('openrpc', 'wallet-sdk')
      AND wallet_connector_id IS NOT NULL
      AND wallet_decision_reason IS NULL
      AND signature_verified_at IS NULL
      AND submission_id IS NULL
      AND execution_user_id IS NULL
      AND execution_started_at IS NULL
    )
    OR (
      sequence = 3
      AND event_type = 'wallet-unsupported'
      AND previous_event_hash ~ '^sha256:[0-9a-f]{64}$'
      AND prepared_transaction_hash IS NULL
      AND transfer_context_hash IS NULL
      AND prepared_verified_at IS NULL
      AND wallet_session_id IS NULL
      AND wallet_connector_kind IN ('openrpc', 'wallet-sdk')
      AND wallet_connector_id IS NOT NULL
      AND wallet_decision_reason LIKE 'unsupported-%'
      AND signature_verified_at IS NULL
      AND submission_id IS NULL
      AND execution_user_id IS NULL
      AND execution_started_at IS NULL
    )
    OR (
      sequence = 4
      AND event_type = 'wallet-rejected'
      AND previous_event_hash ~ '^sha256:[0-9a-f]{64}$'
      AND prepared_transaction_hash IS NULL
      AND transfer_context_hash IS NULL
      AND prepared_verified_at IS NULL
      AND wallet_session_id ~ '^sha256:[0-9a-f]{64}$'
      AND wallet_connector_kind IN ('openrpc', 'wallet-sdk')
      AND wallet_connector_id IS NOT NULL
      AND wallet_decision_reason = 'user-rejected'
      AND signature_verified_at IS NULL
      AND submission_id IS NULL
      AND execution_user_id IS NULL
      AND execution_started_at IS NULL
    )
    OR (
      sequence = 4
      AND event_type = 'signature-verified'
      AND previous_event_hash ~ '^sha256:[0-9a-f]{64}$'
      AND prepared_transaction_hash IS NULL
      AND transfer_context_hash IS NULL
      AND prepared_verified_at IS NULL
      AND wallet_session_id ~ '^sha256:[0-9a-f]{64}$'
      AND wallet_connector_kind IN ('openrpc', 'wallet-sdk')
      AND wallet_connector_id IS NOT NULL
      AND wallet_decision_reason IS NULL
      AND signature_verified_at IS NOT NULL
      AND submission_id IS NULL
      AND execution_user_id IS NULL
      AND execution_started_at IS NULL
    )
    OR (
      sequence = 5
      AND event_type = 'execution-started'
      AND previous_event_hash ~ '^sha256:[0-9a-f]{64}$'
      AND prepared_transaction_hash IS NULL
      AND transfer_context_hash IS NULL
      AND prepared_verified_at IS NULL
      AND wallet_session_id ~ '^sha256:[0-9a-f]{64}$'
      AND wallet_connector_kind IN ('openrpc', 'wallet-sdk')
      AND wallet_connector_id IS NOT NULL
      AND wallet_decision_reason IS NULL
      AND signature_verified_at IS NULL
      AND submission_id IS NOT NULL
      AND execution_user_id IS NOT NULL
      AND execution_started_at IS NOT NULL
    )
  ) IS TRUE);

ALTER TABLE sotto.outbox_jobs
  DROP CONSTRAINT outbox_jobs_kind,
  ADD CONSTRAINT outbox_jobs_kind CHECK (
    kind IN ('purchase-prepare', 'purchase-reconcile')
  );

CREATE TABLE sotto.settlements (
  attempt_id text COLLATE "C" PRIMARY KEY,
  command_id text COLLATE "C" NOT NULL UNIQUE,
  state text COLLATE "C" NOT NULL DEFAULT 'prepared',
  expectation_schema text COLLATE "C" NOT NULL,
  expectation text COLLATE "C" NOT NULL,
  expectation_digest text COLLATE "C" NOT NULL,
  submission_id uuid UNIQUE,
  execution_user_id text COLLATE "C",
  execution_started_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT settlements_attempt_command_fk FOREIGN KEY (
    attempt_id,
    command_id
  ) REFERENCES sotto.purchase_attempts (attempt_id, command_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT settlements_state CHECK (
    state IN ('prepared', 'execution-started')
  ),
  CONSTRAINT settlements_expectation_schema CHECK (
    expectation_schema = 'sotto-human-settlement-expectation-journal-v1'
  ),
  CONSTRAINT settlements_expectation CHECK (
    octet_length(expectation) BETWEEN 2 AND 65536
  ),
  CONSTRAINT settlements_expectation_digest CHECK (
    expectation_digest ~ '^sha256:[0-9a-f]{64}$'
  ),
  CONSTRAINT settlements_execution_user CHECK (
    execution_user_id IS NULL
    OR (
      char_length(execution_user_id) BETWEEN 1 AND 512
      AND execution_user_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]*$'
    )
  ),
  CONSTRAINT settlements_state_coherence CHECK ((
    (
      state = 'prepared'
      AND submission_id IS NULL
      AND execution_user_id IS NULL
      AND execution_started_at IS NULL
    )
    OR (
      state = 'execution-started'
      AND submission_id IS NOT NULL
      AND execution_user_id IS NOT NULL
      AND execution_started_at IS NOT NULL
      AND execution_started_at >= created_at
    )
  ) IS TRUE)
);

CREATE FUNCTION sotto.reject_settlement_authority_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'settlement authority is immutable'
      USING ERRCODE = '55000';
  END IF;
  IF NEW.attempt_id IS DISTINCT FROM OLD.attempt_id
    OR NEW.command_id IS DISTINCT FROM OLD.command_id
    OR NEW.expectation_schema IS DISTINCT FROM OLD.expectation_schema
    OR NEW.expectation IS DISTINCT FROM OLD.expectation
    OR NEW.expectation_digest IS DISTINCT FROM OLD.expectation_digest
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'settlement authority is immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER settlements_authority_immutable
BEFORE UPDATE OR DELETE ON sotto.settlements
FOR EACH ROW EXECUTE FUNCTION sotto.reject_settlement_authority_mutation();

-- Down Migration
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM sotto.settlements)
    OR EXISTS (
      SELECT 1 FROM sotto.purchase_attempts
      WHERE state NOT IN ('intent-created', 'prepared-hash-verified')
    )
    OR EXISTS (
      SELECT 1 FROM sotto.attempt_events WHERE sequence > 2
    )
    OR EXISTS (
      SELECT 1 FROM sotto.outbox_jobs WHERE kind = 'purchase-reconcile'
    )
  THEN
    RAISE EXCEPTION
      'human execution records must be archived before migration rollback'
      USING ERRCODE = '55000';
  END IF;
END
$$;

DROP TRIGGER settlements_authority_immutable ON sotto.settlements;
DROP FUNCTION sotto.reject_settlement_authority_mutation();
DROP TABLE sotto.settlements;

ALTER TABLE sotto.outbox_jobs
  DROP CONSTRAINT outbox_jobs_kind,
  ADD CONSTRAINT outbox_jobs_kind CHECK (kind = 'purchase-prepare');

ALTER TABLE sotto.attempt_events
  DROP CONSTRAINT attempt_events_structure,
  DROP CONSTRAINT attempt_events_type,
  DROP CONSTRAINT attempt_events_sequence,
  DROP COLUMN execution_started_at,
  DROP COLUMN execution_user_id,
  DROP COLUMN submission_id,
  DROP COLUMN signature_verified_at,
  DROP COLUMN wallet_decision_reason,
  DROP COLUMN wallet_connector_id,
  DROP COLUMN wallet_connector_kind,
  DROP COLUMN wallet_session_id,
  ADD CONSTRAINT attempt_events_sequence CHECK (sequence IN (1, 2)),
  ADD CONSTRAINT attempt_events_type CHECK (
    event_type IN ('intent-created', 'prepared-hash-verified')
  ),
  ADD CONSTRAINT attempt_events_structure CHECK ((
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
  ) IS TRUE);

ALTER TABLE sotto.purchase_attempts
  DROP CONSTRAINT purchase_attempts_attempt_command_unique,
  DROP CONSTRAINT purchase_attempts_wallet_session_unique,
  DROP CONSTRAINT purchase_attempts_submission_unique,
  DROP CONSTRAINT purchase_attempts_lifecycle_coherence,
  DROP CONSTRAINT purchase_attempts_execution_user,
  DROP CONSTRAINT purchase_attempts_wallet_reason,
  DROP CONSTRAINT purchase_attempts_wallet_connector_id,
  DROP CONSTRAINT purchase_attempts_wallet_connector_kind,
  DROP CONSTRAINT purchase_attempts_wallet_session,
  DROP CONSTRAINT purchase_attempts_state,
  DROP COLUMN execution_started_at,
  DROP COLUMN execution_user_id,
  DROP COLUMN submission_id,
  DROP COLUMN signature_verified_at,
  DROP COLUMN wallet_decided_at,
  DROP COLUMN approval_requested_at,
  DROP COLUMN wallet_decision_reason,
  DROP COLUMN wallet_connector_id,
  DROP COLUMN wallet_connector_kind,
  DROP COLUMN wallet_session_id,
  ADD CONSTRAINT purchase_attempts_state CHECK (
    state IN ('intent-created', 'prepared-hash-verified')
  ),
  ADD CONSTRAINT purchase_attempts_prepared_coherence CHECK ((
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
  ) IS TRUE);
