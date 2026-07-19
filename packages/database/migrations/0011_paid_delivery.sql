-- Up Migration
ALTER TABLE sotto.purchase_attempts
  ADD CONSTRAINT purchase_attempts_delivery_identity_unique UNIQUE (
    attempt_id,
    request_commitment
  );

ALTER TABLE sotto.settlements
  ADD CONSTRAINT settlements_delivery_identity_unique UNIQUE (
    attempt_id,
    update_id
  );

CREATE TABLE sotto.private_attempt_payloads (
  attempt_id text COLLATE "C" PRIMARY KEY,
  request_commitment text COLLATE "C" NOT NULL,
  payload_schema text COLLATE "C" NOT NULL,
  aead_algorithm text COLLATE "C" NOT NULL,
  key_id text COLLATE "C" NOT NULL,
  encryption_generation integer NOT NULL,
  nonce bytea NOT NULL,
  authentication_tag bytea NOT NULL,
  ciphertext bytea NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT private_attempt_payloads_attempt_fk FOREIGN KEY (
    attempt_id,
    request_commitment
  ) REFERENCES sotto.purchase_attempts (attempt_id, request_commitment)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT private_attempt_payloads_schema CHECK (
    payload_schema = 'sotto-private-delivery-request-v1'
  ),
  CONSTRAINT private_attempt_payloads_algorithm CHECK (
    aead_algorithm = 'aes-256-gcm'
  ),
  CONSTRAINT private_attempt_payloads_key_id CHECK (
    key_id ~ '^[a-z0-9][a-z0-9._-]{0,63}$'
  ),
  CONSTRAINT private_attempt_payloads_generation CHECK (
    encryption_generation BETWEEN 1 AND 2147483647
  ),
  CONSTRAINT private_attempt_payloads_nonce CHECK (octet_length(nonce) = 12),
  CONSTRAINT private_attempt_payloads_tag CHECK (
    octet_length(authentication_tag) = 16
  ),
  CONSTRAINT private_attempt_payloads_ciphertext CHECK (
    octet_length(ciphertext) BETWEEN 2 AND 1200000
  ),
  CONSTRAINT private_attempt_payloads_key_nonce_unique UNIQUE (key_id, nonce)
);

CREATE FUNCTION sotto.reject_private_attempt_payload_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'private attempt payload is immutable' USING ERRCODE = '55000';
END
$$;

CREATE TRIGGER private_attempt_payloads_immutable
BEFORE UPDATE OR DELETE ON sotto.private_attempt_payloads
FOR EACH ROW EXECUTE FUNCTION sotto.reject_private_attempt_payload_mutation();

CREATE TABLE sotto.delivery_claims (
  delivery_id uuid PRIMARY KEY,
  attempt_id text COLLATE "C" NOT NULL UNIQUE,
  update_id text COLLATE "C" NOT NULL,
  request_commitment text COLLATE "C" NOT NULL,
  state text COLLATE "C" NOT NULL DEFAULT 'ready',
  lease_generation bigint NOT NULL DEFAULT 0,
  lease_owner text COLLATE "C",
  available_at timestamp with time zone NOT NULL DEFAULT transaction_timestamp(),
  claimed_at timestamp with time zone,
  lease_expires_at timestamp with time zone,
  dispatch_started_at timestamp with time zone,
  terminal_at timestamp with time zone,
  failure_code text COLLATE "C",
  created_at timestamp with time zone NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT delivery_claims_attempt_fk FOREIGN KEY (
    attempt_id,
    request_commitment
  ) REFERENCES sotto.purchase_attempts (attempt_id, request_commitment)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT delivery_claims_settlement_fk FOREIGN KEY (
    attempt_id,
    update_id
  ) REFERENCES sotto.settlements (attempt_id, update_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT delivery_claims_payload_fk FOREIGN KEY (attempt_id)
    REFERENCES sotto.private_attempt_payloads (attempt_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT delivery_claims_identity_unique UNIQUE (
    update_id,
    attempt_id,
    request_commitment
  ),
  CONSTRAINT delivery_claims_update_id CHECK (
    update_id ~ '^1220[0-9a-f]{64}$'
  ),
  CONSTRAINT delivery_claims_request_commitment CHECK (
    request_commitment ~ '^sha256:[0-9a-f]{64}$'
  ),
  CONSTRAINT delivery_claims_state CHECK (
    state IN (
      'ready',
      'leased',
      'dispatching',
      'delivered',
      'delivery-failed',
      'delivery-unknown'
    )
  ),
  CONSTRAINT delivery_claims_generation CHECK (lease_generation >= 0),
  CONSTRAINT delivery_claims_owner CHECK (
    lease_owner IS NULL
    OR lease_owner ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  ),
  CONSTRAINT delivery_claims_failure_code CHECK (
    failure_code IS NULL
    OR failure_code ~ '^[a-z][a-z0-9-]{0,127}$'
  ),
  CONSTRAINT delivery_claims_availability CHECK (available_at >= created_at),
  CONSTRAINT delivery_claims_state_coherence CHECK ((
    (
      state = 'ready'
      AND lease_owner IS NULL
      AND claimed_at IS NULL
      AND lease_expires_at IS NULL
      AND dispatch_started_at IS NULL
      AND terminal_at IS NULL
      AND failure_code IS NULL
    )
    OR (
      state = 'leased'
      AND lease_generation > 0
      AND lease_owner IS NOT NULL
      AND claimed_at IS NOT NULL
      AND lease_expires_at > claimed_at
      AND dispatch_started_at IS NULL
      AND terminal_at IS NULL
      AND failure_code IS NULL
    )
    OR (
      state = 'dispatching'
      AND lease_generation > 0
      AND lease_owner IS NOT NULL
      AND claimed_at IS NOT NULL
      AND lease_expires_at > claimed_at
      AND dispatch_started_at >= claimed_at
      AND terminal_at IS NULL
      AND failure_code IS NULL
    )
    OR (
      state = 'delivered'
      AND lease_generation > 0
      AND lease_owner IS NOT NULL
      AND claimed_at IS NOT NULL
      AND lease_expires_at > claimed_at
      AND dispatch_started_at >= claimed_at
      AND terminal_at >= dispatch_started_at
      AND failure_code IS NULL
    )
    OR (
      state = 'delivery-failed'
      AND lease_generation > 0
      AND lease_owner IS NOT NULL
      AND claimed_at IS NOT NULL
      AND lease_expires_at > claimed_at
      AND dispatch_started_at >= claimed_at
      AND terminal_at >= dispatch_started_at
      AND failure_code IS NOT NULL
    )
    OR (
      state = 'delivery-unknown'
      AND lease_generation > 0
      AND lease_owner IS NOT NULL
      AND claimed_at IS NOT NULL
      AND lease_expires_at > claimed_at
      AND dispatch_started_at >= claimed_at
      AND terminal_at >= dispatch_started_at
      AND failure_code = 'delivery-outcome-unknown'
    )
  ) IS TRUE)
);

CREATE INDEX delivery_claims_ready_idx
  ON sotto.delivery_claims (available_at, created_at, delivery_id)
  WHERE state = 'ready';

CREATE INDEX delivery_claims_leased_idx
  ON sotto.delivery_claims (lease_expires_at, available_at, delivery_id)
  WHERE state = 'leased';

CREATE INDEX delivery_claims_dispatching_idx
  ON sotto.delivery_claims (lease_expires_at, dispatch_started_at, delivery_id)
  WHERE state = 'dispatching';

CREATE TABLE sotto.delivery_responses (
  delivery_id uuid PRIMARY KEY,
  response_schema text COLLATE "C" NOT NULL,
  aead_algorithm text COLLATE "C" NOT NULL,
  key_id text COLLATE "C" NOT NULL,
  encryption_generation integer NOT NULL,
  nonce bytea NOT NULL,
  authentication_tag bytea NOT NULL,
  ciphertext bytea NOT NULL,
  status integer NOT NULL,
  body_byte_count integer NOT NULL,
  body_sha256 text COLLATE "C" NOT NULL,
  response_sha256 text COLLATE "C" NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT delivery_responses_claim_fk FOREIGN KEY (delivery_id)
    REFERENCES sotto.delivery_claims (delivery_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT delivery_responses_schema CHECK (
    response_schema = 'sotto-private-delivery-response-v1'
  ),
  CONSTRAINT delivery_responses_algorithm CHECK (
    aead_algorithm = 'aes-256-gcm'
  ),
  CONSTRAINT delivery_responses_key_id CHECK (
    key_id ~ '^[a-z0-9][a-z0-9._-]{0,63}$'
  ),
  CONSTRAINT delivery_responses_generation CHECK (
    encryption_generation BETWEEN 1 AND 2147483647
  ),
  CONSTRAINT delivery_responses_nonce CHECK (octet_length(nonce) = 12),
  CONSTRAINT delivery_responses_tag CHECK (
    octet_length(authentication_tag) = 16
  ),
  CONSTRAINT delivery_responses_ciphertext CHECK (
    octet_length(ciphertext) BETWEEN 2 AND 2100000
  ),
  CONSTRAINT delivery_responses_status CHECK (status = 200),
  CONSTRAINT delivery_responses_body_size CHECK (
    body_byte_count BETWEEN 0 AND 2000000
  ),
  CONSTRAINT delivery_responses_body_sha256 CHECK (
    body_sha256 ~ '^sha256:[0-9a-f]{64}$'
  ),
  CONSTRAINT delivery_responses_response_sha256 CHECK (
    response_sha256 ~ '^sha256:[0-9a-f]{64}$'
  ),
  CONSTRAINT delivery_responses_key_nonce_unique UNIQUE (key_id, nonce)
);

CREATE FUNCTION sotto.reject_delivery_response_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'delivery response is immutable' USING ERRCODE = '55000';
END
$$;

CREATE TRIGGER delivery_responses_immutable
BEFORE UPDATE OR DELETE ON sotto.delivery_responses
FOR EACH ROW EXECUTE FUNCTION sotto.reject_delivery_response_mutation();

-- Down Migration
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM sotto.delivery_responses)
    OR EXISTS (SELECT 1 FROM sotto.delivery_claims)
    OR EXISTS (SELECT 1 FROM sotto.private_attempt_payloads)
  THEN
    RAISE EXCEPTION
      'delivery records must be archived before migration rollback'
      USING ERRCODE = '55000';
  END IF;
END
$$;

DROP TRIGGER delivery_responses_immutable ON sotto.delivery_responses;
DROP FUNCTION sotto.reject_delivery_response_mutation();
DROP TABLE sotto.delivery_responses;

DROP INDEX sotto.delivery_claims_dispatching_idx;
DROP INDEX sotto.delivery_claims_leased_idx;
DROP INDEX sotto.delivery_claims_ready_idx;
DROP TABLE sotto.delivery_claims;

DROP TRIGGER private_attempt_payloads_immutable
  ON sotto.private_attempt_payloads;
DROP FUNCTION sotto.reject_private_attempt_payload_mutation();
DROP TABLE sotto.private_attempt_payloads;

ALTER TABLE sotto.settlements
  DROP CONSTRAINT settlements_delivery_identity_unique;

ALTER TABLE sotto.purchase_attempts
  DROP CONSTRAINT purchase_attempts_delivery_identity_unique;
