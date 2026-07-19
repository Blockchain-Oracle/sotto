-- Up Migration
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM sotto.outbox_jobs
    WHERE kind = 'purchase-prepare' AND state = 'ready'
  ) THEN
    RAISE EXCEPTION
      'legacy purchase-prepare jobs require explicit quarantine before private authority migration'
      USING ERRCODE = '55000';
  END IF;
END
$$;

CREATE TABLE sotto.private_prepare_authorities (
  attempt_id text COLLATE "C" PRIMARY KEY,
  authority_schema text COLLATE "C" NOT NULL,
  aead_algorithm text COLLATE "C" NOT NULL,
  key_id text COLLATE "C" NOT NULL,
  encryption_generation integer NOT NULL DEFAULT 1,
  nonce bytea NOT NULL,
  authentication_tag bytea NOT NULL,
  ciphertext bytea NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT private_prepare_authorities_attempt_fk FOREIGN KEY (attempt_id)
    REFERENCES sotto.purchase_attempts (attempt_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT private_prepare_authorities_schema CHECK (
    authority_schema = 'sotto-private-prepare-authority-v1'
  ),
  CONSTRAINT private_prepare_authorities_algorithm CHECK (
    aead_algorithm = 'aes-256-gcm'
  ),
  CONSTRAINT private_prepare_authorities_key_id CHECK (
    key_id ~ '^[a-z0-9][a-z0-9._-]{0,63}$'
  ),
  CONSTRAINT private_prepare_authorities_generation CHECK (
    encryption_generation >= 1
    AND encryption_generation <= 2147483647
  ),
  CONSTRAINT private_prepare_authorities_nonce CHECK (
    octet_length(nonce) = 12
  ),
  CONSTRAINT private_prepare_authorities_authentication_tag CHECK (
    octet_length(authentication_tag) = 16
  ),
  CONSTRAINT private_prepare_authorities_ciphertext CHECK (
    octet_length(ciphertext) >= 1
    AND octet_length(ciphertext) <= 196608
  ),
  CONSTRAINT private_prepare_authorities_key_nonce_unique UNIQUE (
    key_id,
    nonce
  )
);

CREATE INDEX private_prepare_authorities_rotation_idx
  ON sotto.private_prepare_authorities (
    key_id,
    encryption_generation,
    attempt_id
  );

ALTER TABLE sotto.outbox_jobs
  ADD CONSTRAINT outbox_jobs_prepare_authority_fk
  FOREIGN KEY (attempt_id)
  REFERENCES sotto.private_prepare_authorities (attempt_id)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

-- Down Migration
ALTER TABLE sotto.outbox_jobs
  DROP CONSTRAINT outbox_jobs_prepare_authority_fk;
DROP TABLE sotto.private_prepare_authorities;
