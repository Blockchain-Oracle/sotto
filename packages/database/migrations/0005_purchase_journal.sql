-- Up Migration
CREATE TABLE sotto.purchase_attempts (
  attempt_id text COLLATE "C" PRIMARY KEY,
  operation_id text COLLATE "C" NOT NULL UNIQUE,
  request_hash text COLLATE "C" NOT NULL UNIQUE,
  owner_id uuid NOT NULL,
  resource_revision_id uuid NOT NULL,
  authorization_mode text COLLATE "C" NOT NULL,
  commitment_version text COLLATE "C" NOT NULL,
  request_commitment text COLLATE "C" NOT NULL,
  challenge_id text COLLATE "C" NOT NULL UNIQUE,
  purchase_commitment text COLLATE "C" NOT NULL UNIQUE,
  command_id text COLLATE "C" GENERATED ALWAYS AS (
    'sotto-human-purchase-v1-' || substr(purchase_commitment, 8)
  ) STORED UNIQUE,
  begin_exclusive bigint NOT NULL,
  execute_before timestamp with time zone NOT NULL,
  source_commit text COLLATE "C" NOT NULL,
  state text COLLATE "C" NOT NULL DEFAULT 'intent-created',
  created_at timestamp with time zone NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT purchase_attempts_owner_fk FOREIGN KEY (owner_id)
    REFERENCES sotto.owners (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT purchase_attempts_revision_fk FOREIGN KEY (resource_revision_id)
    REFERENCES sotto.resource_revisions (revision_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT purchase_attempts_attempt_id CHECK (
    attempt_id ~ '^sha256:[0-9a-f]{64}$'
  ),
  CONSTRAINT purchase_attempts_operation_id CHECK (
    operation_id ~ '^sha256:[0-9a-f]{64}$'
  ),
  CONSTRAINT purchase_attempts_request_hash CHECK (
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT purchase_attempts_authorization_mode CHECK (
    authorization_mode = 'human-wallet'
  ),
  CONSTRAINT purchase_attempts_commitment_version CHECK (
    commitment_version = 'sotto-human-purchase-v1'
  ),
  CONSTRAINT purchase_attempts_request_commitment CHECK (
    request_commitment ~ '^sha256:[0-9a-f]{64}$'
  ),
  CONSTRAINT purchase_attempts_challenge_id CHECK (
    challenge_id ~ '^sha256:[0-9a-f]{64}$'
  ),
  CONSTRAINT purchase_attempts_purchase_commitment CHECK (
    purchase_commitment ~ '^sha256:[0-9a-f]{64}$'
  ),
  CONSTRAINT purchase_attempts_command_id CHECK (
    command_id ~ '^sotto-human-purchase-v1-[0-9a-f]{64}$'
  ),
  CONSTRAINT purchase_attempts_begin_exclusive CHECK (begin_exclusive >= 0),
  CONSTRAINT purchase_attempts_execution_window CHECK (
    execute_before > created_at
  ),
  CONSTRAINT purchase_attempts_source_commit CHECK (
    source_commit ~ '^[0-9a-f]{40}$'
  ),
  CONSTRAINT purchase_attempts_state CHECK (state = 'intent-created')
);

CREATE TABLE sotto.attempt_events (
  attempt_id text COLLATE "C" NOT NULL,
  sequence bigint NOT NULL,
  event_type text COLLATE "C" NOT NULL,
  event_hash text COLLATE "C" NOT NULL UNIQUE,
  previous_event_hash text COLLATE "C",
  recorded_at timestamp with time zone NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT attempt_events_pk PRIMARY KEY (attempt_id, sequence),
  CONSTRAINT attempt_events_attempt_fk FOREIGN KEY (attempt_id)
    REFERENCES sotto.purchase_attempts (attempt_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT attempt_events_initial_sequence CHECK (sequence = 1),
  CONSTRAINT attempt_events_initial_type CHECK (event_type = 'intent-created'),
  CONSTRAINT attempt_events_event_hash CHECK (
    event_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  CONSTRAINT attempt_events_initial_previous CHECK (
    previous_event_hash IS NULL
  )
);

CREATE FUNCTION sotto.reject_attempt_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'attempt events are append-only' USING ERRCODE = '55000';
END
$$;

CREATE TRIGGER attempt_events_append_only
BEFORE UPDATE OR DELETE ON sotto.attempt_events
FOR EACH ROW EXECUTE FUNCTION sotto.reject_attempt_event_mutation();

CREATE TABLE sotto.outbox_jobs (
  job_id uuid PRIMARY KEY,
  dedupe_key text COLLATE "C" NOT NULL UNIQUE,
  attempt_id text COLLATE "C" NOT NULL,
  event_sequence bigint NOT NULL,
  kind text COLLATE "C" NOT NULL,
  state text COLLATE "C" NOT NULL DEFAULT 'ready',
  available_at timestamp with time zone NOT NULL DEFAULT transaction_timestamp(),
  created_at timestamp with time zone NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT outbox_jobs_event_fk FOREIGN KEY (attempt_id, event_sequence)
    REFERENCES sotto.attempt_events (attempt_id, sequence)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT outbox_jobs_dedupe_key CHECK (
    dedupe_key ~ '^sha256:[0-9a-f]{64}$'
  ),
  CONSTRAINT outbox_jobs_kind CHECK (kind = 'purchase-prepare'),
  CONSTRAINT outbox_jobs_state CHECK (state = 'ready'),
  CONSTRAINT outbox_jobs_availability CHECK (available_at >= created_at),
  CONSTRAINT outbox_jobs_event_kind_unique UNIQUE (
    attempt_id,
    event_sequence,
    kind
  )
);

CREATE INDEX outbox_jobs_ready_idx ON sotto.outbox_jobs (
  available_at,
  created_at,
  job_id
) WHERE state = 'ready';

-- Down Migration
DROP TABLE sotto.outbox_jobs;
DROP TRIGGER attempt_events_append_only ON sotto.attempt_events;
DROP FUNCTION sotto.reject_attempt_event_mutation();
DROP TABLE sotto.attempt_events;
DROP TABLE sotto.purchase_attempts;
