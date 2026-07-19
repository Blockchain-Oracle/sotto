-- Up Migration
CREATE TABLE sotto.sessions (
  session_id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  token_hash text COLLATE "C" NOT NULL UNIQUE,
  party_id text COLLATE "C" NOT NULL,
  issued_at timestamp with time zone NOT NULL DEFAULT transaction_timestamp(),
  expires_at timestamp with time zone NOT NULL,
  revoked_at timestamp with time zone,
  CONSTRAINT sessions_owner_fk FOREIGN KEY (owner_id)
    REFERENCES sotto.owners (id),
  CONSTRAINT sessions_expiry_after_issue CHECK (expires_at > issued_at)
);

CREATE INDEX sessions_owner_expiry_idx
  ON sotto.sessions (owner_id, expires_at);

-- Down Migration
DROP TABLE sotto.sessions;
