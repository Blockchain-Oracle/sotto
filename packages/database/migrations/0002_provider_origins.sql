-- Up Migration
ALTER TABLE sotto.owners
  ADD CONSTRAINT owners_party_id_length
    CHECK (octet_length(party_id) BETWEEN 1 AND 255),
  ADD CONSTRAINT owners_party_id_canonical
    CHECK (party_id = btrim(party_id) AND party_id !~ '[[:space:][:cntrl:]]');

CREATE TABLE sotto.providers (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  display_name text COLLATE "C" NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamp with time zone NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT providers_owner_fk
    FOREIGN KEY (owner_id) REFERENCES sotto.owners (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT providers_display_name_canonical
    CHECK (
      display_name = btrim(display_name)
      AND octet_length(display_name) BETWEEN 1 AND 120
      AND display_name !~ '[[:cntrl:]]'
    ),
  CONSTRAINT providers_timestamp_order CHECK (updated_at >= created_at)
);

CREATE INDEX providers_owner_id_idx ON sotto.providers (owner_id);

CREATE TABLE sotto.origins (
  id uuid PRIMARY KEY,
  provider_id uuid NOT NULL,
  hostname text COLLATE "C" NOT NULL,
  port integer,
  normalized_origin text COLLATE "C" GENERATED ALWAYS AS (
    'https://' || hostname ||
    CASE WHEN port IS NULL THEN '' ELSE ':' || port::text END
  ) STORED,
  created_at timestamp with time zone NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT origins_provider_fk
    FOREIGN KEY (provider_id) REFERENCES sotto.providers (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT origins_hostname_canonical CHECK (
    hostname = lower(hostname)
    AND char_length(hostname) BETWEEN 1 AND 253
    AND hostname ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$'
  ),
  CONSTRAINT origins_port_canonical CHECK (
    port IS NULL OR (port BETWEEN 1 AND 65535 AND port <> 443)
  ),
  CONSTRAINT origins_normalized_origin_unique UNIQUE (normalized_origin)
);

CREATE INDEX origins_provider_id_idx ON sotto.origins (provider_id);

CREATE TABLE sotto.catalog_registrations (
  registration_id uuid PRIMARY KEY,
  request_hash text COLLATE "C" NOT NULL,
  origin_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT catalog_registrations_hash CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT catalog_registrations_request_hash_unique UNIQUE (request_hash),
  CONSTRAINT catalog_registrations_origin_fk
    FOREIGN KEY (origin_id) REFERENCES sotto.origins (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX catalog_registrations_origin_id_idx
  ON sotto.catalog_registrations (origin_id);

-- Down Migration
DROP TABLE sotto.catalog_registrations;
DROP TABLE sotto.origins;
DROP TABLE sotto.providers;
ALTER TABLE sotto.owners
  DROP CONSTRAINT owners_party_id_canonical,
  DROP CONSTRAINT owners_party_id_length;
