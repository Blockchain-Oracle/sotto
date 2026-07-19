-- Up Migration
CREATE TABLE sotto.origin_proofs (
  proof_id uuid PRIMARY KEY,
  request_hash text COLLATE "C" NOT NULL UNIQUE,
  origin_id uuid NOT NULL,
  proof_revision bigint NOT NULL,
  challenge_hash text COLLATE "C" NOT NULL UNIQUE,
  evidence_hash text COLLATE "C" NOT NULL UNIQUE,
  verified_at timestamp with time zone NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT origin_proofs_origin_fk
    FOREIGN KEY (origin_id) REFERENCES sotto.origins (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT origin_proofs_revision_positive CHECK (proof_revision > 0),
  CONSTRAINT origin_proofs_time_order CHECK (expires_at > verified_at),
  CONSTRAINT origin_proofs_challenge_hash CHECK (
    challenge_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  CONSTRAINT origin_proofs_evidence_hash CHECK (
    evidence_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  CONSTRAINT origin_proofs_request_hash CHECK (
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT origin_proofs_origin_revision_unique
    UNIQUE (origin_id, proof_revision),
  CONSTRAINT origin_proofs_identity_unique UNIQUE (proof_id, origin_id)
);

CREATE INDEX origin_proofs_origin_expiry_idx
  ON sotto.origin_proofs (origin_id, expires_at DESC);

CREATE TABLE sotto.resources (
  id uuid PRIMARY KEY,
  origin_id uuid NOT NULL,
  http_method text COLLATE "C" NOT NULL,
  route_template text COLLATE "C" NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT resources_origin_fk
    FOREIGN KEY (origin_id) REFERENCES sotto.origins (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT resources_method CHECK (
    http_method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')
  ),
  CONSTRAINT resources_route CHECK (
    octet_length(route_template) BETWEEN 1 AND 2048
    AND left(route_template, 1) = '/'
    AND route_template !~ '[?#[:space:][:cntrl:]]'
  ),
  CONSTRAINT resources_route_unique
    UNIQUE (origin_id, http_method, route_template),
  CONSTRAINT resources_identity_unique
    UNIQUE (id, origin_id, http_method, route_template)
);

CREATE TABLE sotto.probe_observations (
  observation_id uuid PRIMARY KEY,
  request_hash text COLLATE "C" NOT NULL UNIQUE,
  resource_id uuid NOT NULL,
  origin_id uuid NOT NULL,
  http_method text COLLATE "C" NOT NULL,
  route_template text COLLATE "C" NOT NULL,
  observed_at timestamp with time zone NOT NULL,
  http_status integer NOT NULL,
  evidence_hash text COLLATE "C" NOT NULL,
  outcome text COLLATE "C" NOT NULL,
  failure_code text COLLATE "C",
  revision_id uuid UNIQUE,
  resource_name text COLLATE "C",
  description text COLLATE "C",
  challenge_hash text COLLATE "C",
  x402_version integer,
  scheme text COLLATE "C",
  network text COLLATE "C",
  asset text COLLATE "C",
  recipient text COLLATE "C",
  amount_atomic numeric(78, 0),
  transfer_method text COLLATE "C",
  created_at timestamp with time zone NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT probe_observations_resource_fk
    FOREIGN KEY (resource_id, origin_id, http_method, route_template)
    REFERENCES sotto.resources (id, origin_id, http_method, route_template)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT probe_observations_status CHECK (http_status BETWEEN 100 AND 599),
  CONSTRAINT probe_observations_evidence_hash CHECK (
    evidence_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  CONSTRAINT probe_observations_request_hash CHECK (
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT probe_observations_outcome CHECK (
    (
      outcome = 'verified-x402'
      AND http_status = 402
      AND failure_code IS NULL
      AND revision_id IS NOT NULL
      AND resource_name IS NOT NULL
      AND description IS NOT NULL
      AND challenge_hash IS NOT NULL
      AND challenge_hash ~ '^sha256:[0-9a-f]{64}$'
      AND x402_version IS NOT NULL
      AND x402_version = 2
      AND scheme IS NOT NULL
      AND scheme = 'exact'
      AND network IS NOT NULL
      AND network ~ '^canton:.+$'
      AND asset IS NOT NULL
      AND recipient IS NOT NULL
      AND amount_atomic IS NOT NULL
      AND amount_atomic > 0
      AND transfer_method IS NOT NULL
      AND transfer_method = 'transfer-factory'
    )
    OR
    (
      outcome = 'non-x402'
      AND failure_code IS NOT NULL
      AND (
        (failure_code = 'HTTP_200' AND http_status = 200)
        OR (
          failure_code IN (
            'MISSING_PAYMENT_REQUIRED',
            'UNSUPPORTED_REQUIREMENT'
          )
          AND http_status = 402
        )
      )
      AND revision_id IS NULL
      AND resource_name IS NULL
      AND description IS NULL
      AND challenge_hash IS NULL
      AND x402_version IS NULL
      AND scheme IS NULL
      AND network IS NULL
      AND asset IS NULL
      AND recipient IS NULL
      AND amount_atomic IS NULL
      AND transfer_method IS NULL
    )
  ),
  CONSTRAINT probe_observations_identity_unique UNIQUE (
    observation_id,
    resource_id,
    origin_id,
    http_method,
    route_template,
    outcome,
    revision_id
  )
);

CREATE INDEX probe_observations_resource_time_idx
  ON sotto.probe_observations (resource_id, observed_at DESC);

CREATE TABLE sotto.resource_revisions (
  revision_id uuid PRIMARY KEY,
  resource_id uuid NOT NULL,
  origin_id uuid NOT NULL,
  http_method text COLLATE "C" NOT NULL,
  route_template text COLLATE "C" NOT NULL,
  observation_id uuid NOT NULL UNIQUE,
  probe_outcome text COLLATE "C" NOT NULL DEFAULT 'verified-x402',
  revision_number bigint NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT resource_revisions_verified CHECK (
    probe_outcome = 'verified-x402'
  ),
  CONSTRAINT resource_revisions_number_positive CHECK (revision_number > 0),
  CONSTRAINT resource_revisions_probe_fk FOREIGN KEY (
    observation_id,
    resource_id,
    origin_id,
    http_method,
    route_template,
    probe_outcome,
    revision_id
  ) REFERENCES sotto.probe_observations (
    observation_id,
    resource_id,
    origin_id,
    http_method,
    route_template,
    outcome,
    revision_id
  ) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT resource_revisions_sequence_unique
    UNIQUE (resource_id, revision_number),
  CONSTRAINT resource_revisions_identity_unique
    UNIQUE (revision_id, resource_id, origin_id)
);

CREATE TABLE sotto.listings (
  listing_id uuid PRIMARY KEY,
  resource_id uuid NOT NULL UNIQUE,
  origin_id uuid NOT NULL,
  published_revision_id uuid NOT NULL,
  proof_id uuid NOT NULL,
  state text COLLATE "C" NOT NULL DEFAULT 'published',
  version bigint NOT NULL,
  published_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  CONSTRAINT listings_state CHECK (
    state IN ('published', 'paused', 'unpublished', 'quarantined')
  ),
  CONSTRAINT listings_version_positive CHECK (version > 0),
  CONSTRAINT listings_time_order CHECK (updated_at >= published_at),
  CONSTRAINT listings_revision_fk
    FOREIGN KEY (published_revision_id, resource_id, origin_id)
    REFERENCES sotto.resource_revisions (revision_id, resource_id, origin_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT listings_proof_fk FOREIGN KEY (proof_id, origin_id)
    REFERENCES sotto.origin_proofs (proof_id, origin_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT listings_identity_unique UNIQUE (
    listing_id,
    resource_id,
    origin_id
  )
);

CREATE INDEX listings_public_idx
  ON sotto.listings (state, updated_at DESC, listing_id);

CREATE TABLE sotto.publication_operations (
  publication_id uuid PRIMARY KEY,
  request_hash text COLLATE "C" NOT NULL UNIQUE,
  listing_id uuid NOT NULL,
  resource_id uuid NOT NULL,
  origin_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  proof_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  listing_version bigint NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT publication_operations_version_positive CHECK (
    listing_version > 0
  ),
  CONSTRAINT publication_operations_request_hash CHECK (
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT publication_operations_listing_fk FOREIGN KEY (
    listing_id,
    resource_id,
    origin_id
  ) REFERENCES sotto.listings (
    listing_id,
    resource_id,
    origin_id
  ) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT publication_operations_revision_fk FOREIGN KEY (
    revision_id,
    resource_id,
    origin_id
  ) REFERENCES sotto.resource_revisions (
    revision_id,
    resource_id,
    origin_id
  ) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT publication_operations_proof_fk FOREIGN KEY (
    proof_id,
    origin_id
  ) REFERENCES sotto.origin_proofs (
    proof_id,
    origin_id
  ) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT publication_operations_owner_fk FOREIGN KEY (owner_id)
    REFERENCES sotto.owners (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

-- Down Migration
DROP TABLE sotto.publication_operations;
DROP TABLE sotto.listings;
DROP TABLE sotto.resource_revisions;
DROP TABLE sotto.probe_observations;
DROP TABLE sotto.resources;
DROP TABLE sotto.origin_proofs;
