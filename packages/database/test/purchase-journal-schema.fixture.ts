export const PURCHASE_JOURNAL_COLUMNS = `
  attempt_events.attempt_id attempt_events.event_hash attempt_events.event_type
  attempt_events.execution_started_at attempt_events.execution_user_id
  attempt_events.prepared_transaction_hash attempt_events.prepared_verified_at
  attempt_events.previous_event_hash attempt_events.recorded_at attempt_events.sequence
  attempt_events.signature_verified_at attempt_events.submission_id
  attempt_events.transfer_context_hash
  attempt_events.wallet_connector_id attempt_events.wallet_connector_kind
  attempt_events.wallet_decision_reason attempt_events.wallet_session_id
  outbox_jobs.attempt_id outbox_jobs.available_at outbox_jobs.claimed_at
  outbox_jobs.completed_at outbox_jobs.created_at outbox_jobs.dedupe_key outbox_jobs.event_sequence
  outbox_jobs.job_id outbox_jobs.kind outbox_jobs.lease_expires_at
  outbox_jobs.lease_generation outbox_jobs.lease_owner outbox_jobs.result_event_sequence
  outbox_jobs.state
  purchase_attempts.approval_requested_at purchase_attempts.attempt_id
  purchase_attempts.authorization_mode purchase_attempts.begin_exclusive
  purchase_attempts.challenge_id purchase_attempts.command_id purchase_attempts.commitment_version
  purchase_attempts.created_at purchase_attempts.execute_before
  purchase_attempts.execution_started_at purchase_attempts.execution_user_id
  purchase_attempts.operation_id
  purchase_attempts.owner_id purchase_attempts.prepared_transaction_hash
  purchase_attempts.prepared_verified_at purchase_attempts.purchase_commitment
  purchase_attempts.request_commitment
  purchase_attempts.request_hash purchase_attempts.resource_revision_id
  purchase_attempts.signature_verified_at purchase_attempts.source_commit
  purchase_attempts.state purchase_attempts.submission_id purchase_attempts.transfer_context_hash
  purchase_attempts.wallet_connector_id purchase_attempts.wallet_connector_kind
  purchase_attempts.wallet_decided_at purchase_attempts.wallet_decision_reason
  purchase_attempts.wallet_session_id`
  .trim()
  .split(/\s+/u)
  .sort();
