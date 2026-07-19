import { createHash } from "node:crypto";
import { SOTTO_CONTROL_PACKAGE_ID } from "@sotto/x402-canton";
import type { VerifiedSottoControlDar } from "./five-north-dar-artifact.js";
import type { FiveNorthPackageDeploymentAuthority } from "./five-north-package-deployment.js";

export const PACKAGE_JOURNAL_DIRECTORY = "devnet-sotto-control-package";
export const PACKAGE_JOURNAL_SCHEMA = "sotto-package-deployment-journal-v1";
export const PACKAGE_LEASE_SCHEMA = "sotto-package-deployment-lease-v1";
const INTENT_SCHEMA = "sotto-package-deployment-intent-v1";
const ENDPOINT_CONTRACT = "canton-json-ledger-api-v2:/v2/dars";
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const SYNCHRONIZER_PATTERN = /^[^\s:]+::1220[0-9a-f]{64}$/u;

export type FiveNorthPackageDeploymentIntent = Readonly<{
  authenticatedUserSha256: `sha256:${string}`;
  darByteLength: number;
  darSha256: `sha256:${string}`;
  endpointContract: typeof ENDPOINT_CONTRACT;
  packageId: typeof SOTTO_CONTROL_PACKAGE_ID;
  schema: typeof INTENT_SCHEMA;
  sourceCommit: string;
  synchronizerId: string;
  vetAllPackages: false;
}>;

export type PackageIntentRecord = Readonly<{
  kind: "intent";
  operationId: `sha256:${string}`;
  payload: FiveNorthPackageDeploymentIntent;
  payloadSha256: `sha256:${string}`;
  schema: typeof PACKAGE_JOURNAL_SCHEMA;
}>;

export type PackageUploadRecord = Readonly<{
  kind: "upload-started";
  operationId: string;
  previousRecordSha256: string;
  recordedAt: string;
  schema: typeof PACKAGE_JOURNAL_SCHEMA;
}>;

export type FiveNorthPackageDeploymentTerminal = Readonly<{
  kind: "present";
  operationId: string;
  outcome: "already-present" | "present-after-dispatch";
  packageId: typeof SOTTO_CONTROL_PACKAGE_ID;
  previousRecordSha256: string;
  recordedAt: string;
  schema: typeof PACKAGE_JOURNAL_SCHEMA;
}>;

export function packageJournalSha256(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function exactObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  if (
    JSON.stringify(Object.keys(record).sort()) !==
    JSON.stringify([...keys].sort())
  ) {
    throw new Error(`${label} keys are invalid`);
  }
  return record;
}

function timestamp(value: unknown, label: string): void {
  if (typeof value !== "string") throw new Error(`${label} is invalid`);
  const milliseconds = Date.parse(value);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    throw new Error(`${label} is invalid`);
  }
}

function parseIntent(value: unknown): FiveNorthPackageDeploymentIntent {
  const intent = exactObject(
    value,
    [
      "authenticatedUserSha256",
      "darByteLength",
      "darSha256",
      "endpointContract",
      "packageId",
      "schema",
      "sourceCommit",
      "synchronizerId",
      "vetAllPackages",
    ],
    "package deployment intent",
  );
  if (
    intent.schema !== INTENT_SCHEMA ||
    intent.endpointContract !== ENDPOINT_CONTRACT ||
    intent.packageId !== SOTTO_CONTROL_PACKAGE_ID ||
    intent.vetAllPackages !== false ||
    typeof intent.sourceCommit !== "string" ||
    !COMMIT_PATTERN.test(intent.sourceCommit) ||
    typeof intent.darSha256 !== "string" ||
    !SHA256_PATTERN.test(intent.darSha256) ||
    typeof intent.authenticatedUserSha256 !== "string" ||
    !SHA256_PATTERN.test(intent.authenticatedUserSha256) ||
    typeof intent.synchronizerId !== "string" ||
    !SYNCHRONIZER_PATTERN.test(intent.synchronizerId) ||
    !Number.isSafeInteger(intent.darByteLength) ||
    (intent.darByteLength as number) < 1 ||
    (intent.darByteLength as number) > 16_777_216
  ) {
    throw new Error("package deployment intent is invalid");
  }
  return intent as FiveNorthPackageDeploymentIntent;
}

export function fiveNorthPackageDeploymentIntent(
  input: Readonly<{
    artifact: VerifiedSottoControlDar;
    authority: FiveNorthPackageDeploymentAuthority;
  }>,
): FiveNorthPackageDeploymentIntent {
  return Object.freeze(
    parseIntent({
      authenticatedUserSha256: input.authority.authenticatedUserSha256,
      darByteLength: input.artifact.darByteLength,
      darSha256: input.artifact.darSha256,
      endpointContract: ENDPOINT_CONTRACT,
      packageId: input.artifact.packageId,
      schema: INTENT_SCHEMA,
      sourceCommit: input.artifact.sourceCommit,
      synchronizerId: input.authority.synchronizerId,
      vetAllPackages: false,
    }),
  );
}

export function packageIntentRecord(
  payload: FiveNorthPackageDeploymentIntent,
): PackageIntentRecord {
  const source = JSON.stringify(payload);
  return Object.freeze({
    kind: "intent" as const,
    operationId: packageJournalSha256(`sotto-package-deployment-v1\0${source}`),
    payload,
    payloadSha256: packageJournalSha256(source),
    schema: PACKAGE_JOURNAL_SCHEMA,
  });
}

export function parsePackageIntentRecord(value: unknown): PackageIntentRecord {
  const record = exactObject(
    value,
    ["kind", "operationId", "payload", "payloadSha256", "schema"],
    "package deployment intent record",
  );
  const parsed = packageIntentRecord(parseIntent(record.payload));
  if (
    record.kind !== "intent" ||
    record.schema !== PACKAGE_JOURNAL_SCHEMA ||
    record.operationId !== parsed.operationId ||
    record.payloadSha256 !== parsed.payloadSha256
  ) {
    throw new Error("package deployment intent record integrity failed");
  }
  return parsed;
}

export function parsePackageUploadRecord(
  value: unknown,
  operationId: string,
  previousRecordSha256: string,
): PackageUploadRecord {
  const record = exactObject(
    value,
    ["kind", "operationId", "previousRecordSha256", "recordedAt", "schema"],
    "package upload record",
  );
  if (
    record.kind !== "upload-started" ||
    record.schema !== PACKAGE_JOURNAL_SCHEMA ||
    record.operationId !== operationId ||
    record.previousRecordSha256 !== previousRecordSha256
  ) {
    throw new Error("package upload record chain is invalid");
  }
  timestamp(record.recordedAt, "package upload timestamp");
  return record as PackageUploadRecord;
}

export function parsePackageTerminalRecord(
  value: unknown,
  operationId: string,
  intentSha256: string,
  upload: PackageUploadRecord | undefined,
): FiveNorthPackageDeploymentTerminal {
  const record = exactObject(
    value,
    [
      "kind",
      "operationId",
      "outcome",
      "packageId",
      "previousRecordSha256",
      "recordedAt",
      "schema",
    ],
    "package terminal record",
  );
  const expectedPrevious =
    upload === undefined
      ? intentSha256
      : packageJournalSha256(JSON.stringify(upload));
  if (
    record.kind !== "present" ||
    record.schema !== PACKAGE_JOURNAL_SCHEMA ||
    record.operationId !== operationId ||
    record.packageId !== SOTTO_CONTROL_PACKAGE_ID ||
    record.previousRecordSha256 !== expectedPrevious ||
    (record.outcome !== "already-present" &&
      record.outcome !== "present-after-dispatch") ||
    (upload === undefined) !== (record.outcome === "already-present")
  ) {
    throw new Error("package terminal record chain is invalid");
  }
  timestamp(record.recordedAt, "package terminal timestamp");
  return record as FiveNorthPackageDeploymentTerminal;
}

export function isMissingPackageJournalRecord(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
