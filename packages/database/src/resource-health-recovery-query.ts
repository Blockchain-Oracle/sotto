export type RecoveryRow = Readonly<{
  healthObservationId: string;
  healthRequestHash: string;
  healthProbeOutcome: string | null;
  resourceId: string;
  originId: string;
  method: string;
  routeTemplate: string;
  operationHash: string;
  observedAt: Date;
  latencyMilliseconds: number;
  healthStatus: string;
  healthFailureDomain: string | null;
  healthFailureCode: string | null;
  healthHttpStatus: number | null;
  healthEvidenceHash: string;
  probeObservationId: string | null;
  probeRequestHash: string | null;
  probeObservedAt: Date | null;
  probeHttpStatus: number | null;
  probeEvidenceHash: string | null;
  probeOutcome: string | null;
  probeFailureCode: string | null;
  probeRevisionId: string | null;
  probeResourceName: string | null;
  probeDescription: string | null;
  probeChallengeHash: string | null;
  probeX402Version: number | null;
  probeScheme: string | null;
  probeNetwork: string | null;
  probeAsset: string | null;
  probeRecipient: string | null;
  probeAmountAtomic: string | null;
  probeTransferMethod: string | null;
}>;

export const RECOVERY_SELECT = `
  SELECT
    health.health_observation_id AS "healthObservationId",
    health.request_hash AS "healthRequestHash",
    health.probe_outcome AS "healthProbeOutcome",
    health.resource_id AS "resourceId",
    health.origin_id AS "originId",
    health.http_method AS "method",
    health.route_template AS "routeTemplate",
    health.operation_hash AS "operationHash",
    health.observed_at AS "observedAt",
    health.latency_milliseconds AS "latencyMilliseconds",
    health.status AS "healthStatus",
    health.failure_domain AS "healthFailureDomain",
    health.failure_code AS "healthFailureCode",
    health.http_status AS "healthHttpStatus",
    health.evidence_hash AS "healthEvidenceHash",
    probe.observation_id AS "probeObservationId",
    probe.request_hash AS "probeRequestHash",
    probe.observed_at AS "probeObservedAt",
    probe.http_status AS "probeHttpStatus",
    probe.evidence_hash AS "probeEvidenceHash",
    probe.outcome AS "probeOutcome",
    probe.failure_code AS "probeFailureCode",
    probe.revision_id AS "probeRevisionId",
    probe.resource_name AS "probeResourceName",
    probe.description AS "probeDescription",
    probe.challenge_hash AS "probeChallengeHash",
    probe.x402_version AS "probeX402Version",
    probe.scheme AS "probeScheme",
    probe.network AS "probeNetwork",
    probe.asset AS "probeAsset",
    probe.recipient AS "probeRecipient",
    probe.amount_atomic::text AS "probeAmountAtomic",
    probe.transfer_method AS "probeTransferMethod"
  FROM sotto.health_observations AS health
  LEFT JOIN sotto.probe_observations AS probe
    ON probe.observation_id = health.probe_observation_id
  WHERE health.health_observation_id = $1
`;
