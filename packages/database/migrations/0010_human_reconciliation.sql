-- Up Migration
ALTER TABLE sotto.purchase_attempts
  DROP CONSTRAINT purchase_attempts_state,
  DROP CONSTRAINT purchase_attempts_lifecycle_coherence;

ALTER TABLE sotto.purchase_attempts
  ADD CONSTRAINT purchase_attempts_state CHECK (
    state IN (
      'intent-created',
      'prepared-hash-verified',
      'approval-requested',
      'wallet-rejected',
      'wallet-unsupported',
      'signature-verified',
      'execution-started',
      'settlement-reconciled',
      'settlement-rejected'
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
      state IN (
        'execution-started',
        'settlement-reconciled',
        'settlement-rejected'
      )
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
  ) IS TRUE);

ALTER TABLE sotto.settlements
  ADD COLUMN reconciliation_offset bigint,
  ADD COLUMN completion_offset bigint,
  ADD COLUMN update_id text COLLATE "C",
  ADD COLUMN rejection_status_code integer,
  ADD COLUMN reconciled_at timestamp with time zone;

UPDATE sotto.settlements settlement
SET reconciliation_offset = attempt.begin_exclusive
FROM sotto.purchase_attempts attempt
WHERE attempt.attempt_id = settlement.attempt_id;

ALTER TABLE sotto.settlements
  ALTER COLUMN reconciliation_offset SET NOT NULL,
  DROP CONSTRAINT settlements_state,
  DROP CONSTRAINT settlements_state_coherence,
  ADD CONSTRAINT settlements_state CHECK (
    state IN (
      'prepared',
      'execution-started',
      'settlement-reconciled',
      'settlement-rejected'
    )
  ),
  ADD CONSTRAINT settlements_reconciliation_offset CHECK (
    reconciliation_offset >= 0
  ),
  ADD CONSTRAINT settlements_completion_offset CHECK (
    completion_offset IS NULL OR completion_offset >= 0
  ),
  ADD CONSTRAINT settlements_update_id CHECK (
    update_id IS NULL OR update_id ~ '^1220[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT settlements_rejection_status CHECK (
    rejection_status_code IS NULL OR rejection_status_code BETWEEN 1 AND 16
  ),
  ADD CONSTRAINT settlements_state_coherence CHECK ((
    (
      state = 'prepared'
      AND submission_id IS NULL
      AND execution_user_id IS NULL
      AND execution_started_at IS NULL
      AND completion_offset IS NULL
      AND update_id IS NULL
      AND rejection_status_code IS NULL
      AND reconciled_at IS NULL
    )
    OR (
      state = 'execution-started'
      AND submission_id IS NOT NULL
      AND execution_user_id IS NOT NULL
      AND execution_started_at IS NOT NULL
      AND execution_started_at >= created_at
      AND completion_offset IS NULL
      AND update_id IS NULL
      AND rejection_status_code IS NULL
      AND reconciled_at IS NULL
    )
    OR (
      state = 'settlement-reconciled'
      AND submission_id IS NOT NULL
      AND execution_user_id IS NOT NULL
      AND execution_started_at IS NOT NULL
      AND execution_started_at >= created_at
      AND completion_offset > reconciliation_offset
      AND update_id ~ '^1220[0-9a-f]{64}$'
      AND rejection_status_code IS NULL
      AND reconciled_at >= execution_started_at
    )
    OR (
      state = 'settlement-rejected'
      AND submission_id IS NOT NULL
      AND execution_user_id IS NOT NULL
      AND execution_started_at IS NOT NULL
      AND execution_started_at >= created_at
      AND completion_offset > reconciliation_offset
      AND update_id IS NULL
      AND rejection_status_code BETWEEN 1 AND 16
      AND reconciled_at >= execution_started_at
    )
  ) IS TRUE);

ALTER TABLE sotto.outbox_jobs
  DROP CONSTRAINT outbox_jobs_lease_coherence,
  ADD CONSTRAINT outbox_jobs_lease_coherence CHECK ((
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
      AND (
        (kind = 'purchase-prepare' AND result_event_sequence = 2)
        OR (kind = 'purchase-reconcile' AND result_event_sequence = 6)
      )
      AND completed_at IS NOT NULL
      AND completed_at >= claimed_at
    )
  ) IS TRUE);

CREATE INDEX outbox_jobs_reconcile_ready_idx
  ON sotto.outbox_jobs (available_at, created_at, job_id)
  WHERE kind = 'purchase-reconcile' AND state = 'ready';

CREATE INDEX outbox_jobs_reconcile_expired_idx
  ON sotto.outbox_jobs (lease_expires_at, available_at, job_id)
  WHERE kind = 'purchase-reconcile' AND state = 'leased';

ALTER TABLE sotto.attempt_events
  DROP CONSTRAINT attempt_events_sequence,
  DROP CONSTRAINT attempt_events_type,
  DROP CONSTRAINT attempt_events_structure;

ALTER TABLE sotto.attempt_events
  ADD COLUMN completion_offset bigint,
  ADD COLUMN update_id text COLLATE "C",
  ADD COLUMN rejection_status_code integer,
  ADD COLUMN reconciled_at timestamp with time zone,
  ADD CONSTRAINT attempt_events_completion_offset CHECK (
    completion_offset IS NULL OR completion_offset >= 0
  ),
  ADD CONSTRAINT attempt_events_update_id CHECK (
    update_id IS NULL OR update_id ~ '^1220[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT attempt_events_rejection_status CHECK (
    rejection_status_code IS NULL OR rejection_status_code BETWEEN 1 AND 16
  ),
  ADD CONSTRAINT attempt_events_sequence CHECK (
    sequence IN (1, 2, 3, 4, 5, 6)
  ),
  ADD CONSTRAINT attempt_events_type CHECK (
    event_type IN (
      'intent-created',
      'prepared-hash-verified',
      'approval-requested',
      'wallet-rejected',
      'wallet-unsupported',
      'signature-verified',
      'execution-started',
      'settlement-reconciled',
      'settlement-rejected'
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
      AND completion_offset IS NULL
      AND update_id IS NULL
      AND rejection_status_code IS NULL
      AND reconciled_at IS NULL
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
      AND completion_offset IS NULL
      AND update_id IS NULL
      AND rejection_status_code IS NULL
      AND reconciled_at IS NULL
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
      AND completion_offset IS NULL
      AND update_id IS NULL
      AND rejection_status_code IS NULL
      AND reconciled_at IS NULL
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
      AND completion_offset IS NULL
      AND update_id IS NULL
      AND rejection_status_code IS NULL
      AND reconciled_at IS NULL
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
      AND completion_offset IS NULL
      AND update_id IS NULL
      AND rejection_status_code IS NULL
      AND reconciled_at IS NULL
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
      AND completion_offset IS NULL
      AND update_id IS NULL
      AND rejection_status_code IS NULL
      AND reconciled_at IS NULL
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
      AND completion_offset IS NULL
      AND update_id IS NULL
      AND rejection_status_code IS NULL
      AND reconciled_at IS NULL
    )
    OR (
      sequence = 6
      AND event_type = 'settlement-reconciled'
      AND previous_event_hash ~ '^sha256:[0-9a-f]{64}$'
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
      AND completion_offset >= 0
      AND update_id ~ '^1220[0-9a-f]{64}$'
      AND rejection_status_code IS NULL
      AND reconciled_at IS NOT NULL
      AND reconciled_at = recorded_at
    )
    OR (
      sequence = 6
      AND event_type = 'settlement-rejected'
      AND previous_event_hash ~ '^sha256:[0-9a-f]{64}$'
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
      AND completion_offset >= 0
      AND update_id IS NULL
      AND rejection_status_code BETWEEN 1 AND 16
      AND reconciled_at IS NOT NULL
      AND reconciled_at = recorded_at
    )
  ) IS TRUE);

-- Down Migration
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM sotto.purchase_attempts
    WHERE state IN ('settlement-reconciled', 'settlement-rejected')
  ) OR EXISTS (
    SELECT 1 FROM sotto.attempt_events
    WHERE sequence = 6
      OR completion_offset IS NOT NULL
      OR update_id IS NOT NULL
      OR rejection_status_code IS NOT NULL
      OR reconciled_at IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM sotto.settlements settlement
    WHERE settlement.state IN ('settlement-reconciled', 'settlement-rejected')
      OR settlement.completion_offset IS NOT NULL
      OR settlement.update_id IS NOT NULL
      OR settlement.rejection_status_code IS NOT NULL
      OR settlement.reconciled_at IS NOT NULL
  ) OR EXISTS (
    SELECT 1
    FROM sotto.settlements settlement
    JOIN sotto.purchase_attempts attempt
      ON attempt.attempt_id = settlement.attempt_id
    WHERE settlement.reconciliation_offset IS DISTINCT FROM attempt.begin_exclusive
  ) OR EXISTS (
    SELECT 1 FROM sotto.outbox_jobs
    WHERE kind = 'purchase-reconcile'
      AND (state = 'completed' OR result_event_sequence IS NOT NULL)
  ) THEN
    RAISE EXCEPTION
      'reconciliation records must be archived before migration rollback'
      USING ERRCODE = '55000';
  END IF;
END
$$;

DROP INDEX sotto.outbox_jobs_reconcile_expired_idx;
DROP INDEX sotto.outbox_jobs_reconcile_ready_idx;

ALTER TABLE sotto.outbox_jobs
  DROP CONSTRAINT outbox_jobs_lease_coherence,
  ADD CONSTRAINT outbox_jobs_lease_coherence CHECK ((
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
  ) IS TRUE);

ALTER TABLE sotto.settlements
  DROP CONSTRAINT settlements_state_coherence,
  DROP CONSTRAINT settlements_rejection_status,
  DROP CONSTRAINT settlements_update_id,
  DROP CONSTRAINT settlements_completion_offset,
  DROP CONSTRAINT settlements_reconciliation_offset,
  DROP CONSTRAINT settlements_state,
  DROP COLUMN reconciled_at,
  DROP COLUMN rejection_status_code,
  DROP COLUMN update_id,
  DROP COLUMN completion_offset,
  DROP COLUMN reconciliation_offset,
  ADD CONSTRAINT settlements_state CHECK (
    state IN ('prepared', 'execution-started')
  ),
  ADD CONSTRAINT settlements_state_coherence CHECK ((
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
  ) IS TRUE);

ALTER TABLE sotto.attempt_events
  DROP CONSTRAINT attempt_events_structure,
  DROP CONSTRAINT attempt_events_type,
  DROP CONSTRAINT attempt_events_sequence,
  DROP CONSTRAINT attempt_events_rejection_status,
  DROP CONSTRAINT attempt_events_update_id,
  DROP CONSTRAINT attempt_events_completion_offset,
  DROP COLUMN reconciled_at,
  DROP COLUMN rejection_status_code,
  DROP COLUMN update_id,
  DROP COLUMN completion_offset,
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

ALTER TABLE sotto.purchase_attempts
  DROP CONSTRAINT purchase_attempts_lifecycle_coherence,
  DROP CONSTRAINT purchase_attempts_state,
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
  ) IS TRUE);
