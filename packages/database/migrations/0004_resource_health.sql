-- Up Migration
ALTER TABLE sotto.probe_observations
  ADD CONSTRAINT probe_observations_health_identity_unique UNIQUE (
    observation_id,
    resource_id,
    origin_id,
    http_method,
    route_template,
    outcome
  ),
  ADD CONSTRAINT probe_observations_health_failure_unique UNIQUE (
    observation_id,
    failure_code
  );

CREATE TABLE sotto.health_observations (
  health_observation_id uuid PRIMARY KEY,
  request_hash text COLLATE "C" NOT NULL UNIQUE,
  probe_observation_id uuid,
  probe_outcome text COLLATE "C",
  resource_id uuid NOT NULL,
  origin_id uuid NOT NULL,
  http_method text COLLATE "C" NOT NULL,
  route_template text COLLATE "C" NOT NULL,
  operation_hash text COLLATE "C" NOT NULL,
  observed_at timestamp with time zone NOT NULL,
  latency_milliseconds integer NOT NULL,
  status text COLLATE "C" NOT NULL,
  failure_domain text COLLATE "C",
  failure_code text COLLATE "C",
  http_status integer,
  evidence_hash text COLLATE "C" NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT health_observations_resource_fk FOREIGN KEY (
    resource_id,
    origin_id,
    http_method,
    route_template
  ) REFERENCES sotto.resources (
    id,
    origin_id,
    http_method,
    route_template
  ) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT health_observations_probe_fk FOREIGN KEY (
    probe_observation_id,
    resource_id,
    origin_id,
    http_method,
    route_template,
    probe_outcome
  ) REFERENCES sotto.probe_observations (
    observation_id,
    resource_id,
    origin_id,
    http_method,
    route_template,
    outcome
  ) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT health_observations_probe_failure_fk FOREIGN KEY (
    probe_observation_id,
    failure_code
  ) REFERENCES sotto.probe_observations (
    observation_id,
    failure_code
  ) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT health_observations_request_hash CHECK (
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT health_observations_evidence_hash CHECK (
    evidence_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  CONSTRAINT health_observations_operation_hash CHECK (
    operation_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  CONSTRAINT health_observations_latency CHECK (
    latency_milliseconds BETWEEN 0 AND 30000
  ),
  CONSTRAINT health_observations_http_status CHECK (
    http_status IS NULL OR http_status BETWEEN 100 AND 599
  ),
  CONSTRAINT health_observations_probe_presence CHECK (
    (probe_observation_id IS NULL) = (probe_outcome IS NULL)
  ),
  CONSTRAINT health_observations_result CHECK (
    (
      status IN ('healthy', 'degraded')
      AND failure_domain IS NULL
      AND failure_code IS NULL
      AND http_status IS NULL
      AND probe_observation_id IS NOT NULL
      AND probe_outcome = 'verified-x402'
    )
    OR
    (
      status = 'failing'
      AND failure_domain = 'payment-contract'
      AND failure_code IN (
        'HTTP_200',
        'MISSING_PAYMENT_REQUIRED',
        'UNSUPPORTED_REQUIREMENT'
      )
      AND http_status IS NULL
      AND probe_observation_id IS NOT NULL
      AND probe_outcome = 'non-x402'
    )
    OR
    (
      status = 'failing'
      AND failure_domain = 'transport'
      AND failure_code IN ('DNS_OR_NETWORK', 'TIMEOUT')
      AND http_status IS NULL
      AND probe_observation_id IS NULL
      AND probe_outcome IS NULL
    )
    OR
    (
      status = 'failing'
      AND failure_domain = 'provider-handler'
      AND failure_code = 'HTTP_STATUS'
      AND http_status IS NOT NULL
      AND probe_observation_id IS NULL
      AND probe_outcome IS NULL
    )
  )
);

CREATE INDEX health_observations_resource_time_idx
  ON sotto.health_observations (
    resource_id,
    observed_at DESC,
    health_observation_id DESC
  );

-- Down Migration
DROP TABLE sotto.health_observations;
ALTER TABLE sotto.probe_observations
  DROP CONSTRAINT probe_observations_health_identity_unique,
  DROP CONSTRAINT probe_observations_health_failure_unique;
