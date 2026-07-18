export const PURCHASE_JOURNAL_COLUMNS = `
  attempt_events.attempt_id attempt_events.event_hash attempt_events.event_type
  attempt_events.prepared_transaction_hash attempt_events.prepared_verified_at
  attempt_events.previous_event_hash attempt_events.recorded_at attempt_events.sequence
  attempt_events.transfer_context_hash
  outbox_jobs.attempt_id outbox_jobs.available_at outbox_jobs.claimed_at
  outbox_jobs.completed_at outbox_jobs.created_at outbox_jobs.dedupe_key outbox_jobs.event_sequence
  outbox_jobs.job_id outbox_jobs.kind outbox_jobs.lease_expires_at
  outbox_jobs.lease_generation outbox_jobs.lease_owner outbox_jobs.result_event_sequence
  outbox_jobs.state
  purchase_attempts.attempt_id
  purchase_attempts.authorization_mode purchase_attempts.begin_exclusive
  purchase_attempts.challenge_id purchase_attempts.command_id purchase_attempts.commitment_version
  purchase_attempts.created_at purchase_attempts.execute_before purchase_attempts.operation_id
  purchase_attempts.owner_id purchase_attempts.prepared_transaction_hash
  purchase_attempts.prepared_verified_at purchase_attempts.purchase_commitment
  purchase_attempts.request_commitment
  purchase_attempts.request_hash purchase_attempts.resource_revision_id purchase_attempts.source_commit
  purchase_attempts.state purchase_attempts.transfer_context_hash`
  .trim()
  .split(/\s+/u)
  .sort();
