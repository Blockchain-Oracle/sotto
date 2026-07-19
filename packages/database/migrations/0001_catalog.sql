-- Up Migration
CREATE SCHEMA sotto;

CREATE TABLE sotto.owners (
  id uuid PRIMARY KEY,
  party_id text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT transaction_timestamp()
);

-- Down Migration
DROP TABLE sotto.owners;
DROP SCHEMA sotto;
