import type { ProbeObservationInput } from "./publication-types.js";
import {
  exactKeys,
  integer,
  objectValue,
  requestHash,
  sha256,
  text,
  time,
  uuid,
} from "./publication-validation-primitives.js";

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const NON_X402_REASONS = new Set([
  "HTTP_200",
  "MISSING_PAYMENT_REQUIRED",
  "UNSUPPORTED_REQUIREMENT",
]);

export type ValidatedProbeObservation = Readonly<{
  observationId: string;
  originId: string;
  resourceId: string;
  method: string;
  routeTemplate: string;
  observedAt: string;
  httpStatus: number;
  evidenceHash: string;
  outcome: "verified-x402" | "non-x402";
  failureCode: string | null;
  revisionId: string | null;
  resourceName: string | null;
  description: string | null;
  challengeHash: string | null;
  x402Version: number | null;
  scheme: string | null;
  network: string | null;
  asset: string | null;
  recipient: string | null;
  amountAtomic: string | null;
  transferMethod: string | null;
  requestHash: string;
}>;

function method(value: unknown): string {
  if (typeof value !== "string" || !METHODS.has(value)) {
    throw new Error("probe HTTP method is invalid");
  }
  return value;
}

function route(value: unknown): string {
  const candidate = text(value, "probe route", 2_048);
  if (!candidate.startsWith("/") || /[?#]/u.test(candidate)) {
    throw new Error("probe route is invalid");
  }
  return candidate;
}

function verifiedResult(value: Record<string, unknown>) {
  exactKeys(
    value,
    [
      "kind",
      "revisionId",
      "name",
      "description",
      "challengeHash",
      "x402Version",
      "scheme",
      "network",
      "asset",
      "recipient",
      "amountAtomic",
      "transferMethod",
    ],
    "verified probe result",
  );
  if (
    value.kind !== "verified-x402" ||
    value.x402Version !== 2 ||
    value.scheme !== "exact" ||
    value.transferMethod !== "transfer-factory"
  ) {
    throw new Error("verified probe protocol is unsupported");
  }
  const network = text(value.network, "probe network", 255);
  if (!network.startsWith("canton:") || network.length === 7) {
    throw new Error("probe network is invalid");
  }
  if (
    typeof value.amountAtomic !== "string" ||
    !/^[1-9][0-9]{0,77}$/u.test(value.amountAtomic)
  ) {
    throw new Error("probe atomic amount is invalid");
  }
  return Object.freeze({
    kind: "verified-x402" as const,
    revisionId: uuid(value.revisionId, "probe revision ID"),
    name: text(value.name, "probe resource name", 120, true),
    description: text(value.description, "probe description", 2_000, true),
    challengeHash: sha256(value.challengeHash, "probe challenge hash"),
    x402Version: 2,
    scheme: "exact",
    network,
    asset: text(value.asset, "probe asset", 64),
    recipient: text(value.recipient, "probe recipient", 255),
    amountAtomic: value.amountAtomic,
    transferMethod: "transfer-factory",
  });
}

function nonX402Result(value: Record<string, unknown>, httpStatus: number) {
  exactKeys(value, ["kind", "reason"], "non-x402 probe result");
  if (
    value.kind !== "non-x402" ||
    typeof value.reason !== "string" ||
    !NON_X402_REASONS.has(value.reason) ||
    (value.reason === "HTTP_200" ? httpStatus !== 200 : httpStatus !== 402)
  ) {
    throw new Error("non-x402 probe result is invalid");
  }
  return Object.freeze({
    kind: "non-x402" as const,
    reason: value.reason,
  });
}

export function validateProbeObservation(
  candidate: ProbeObservationInput,
): ValidatedProbeObservation {
  const input = objectValue(candidate, "probe observation");
  exactKeys(
    input,
    [
      "observationId",
      "originId",
      "resourceId",
      "method",
      "routeTemplate",
      "observedAt",
      "httpStatus",
      "evidenceHash",
      "result",
    ],
    "probe observation",
  );
  const httpStatus = integer(input.httpStatus, "probe HTTP status", 100, 599);
  const resultRecord = objectValue(input.result, "probe result");
  const result =
    resultRecord.kind === "verified-x402"
      ? verifiedResult(resultRecord)
      : nonX402Result(resultRecord, httpStatus);
  if (result.kind === "verified-x402" && httpStatus !== 402) {
    throw new Error("verified probe HTTP status is invalid");
  }
  const common = Object.freeze({
    observationId: uuid(input.observationId, "probe observation ID"),
    originId: uuid(input.originId, "probe origin ID"),
    resourceId: uuid(input.resourceId, "probe resource ID"),
    method: method(input.method),
    routeTemplate: route(input.routeTemplate),
    observedAt: time(input.observedAt, "probe observedAt"),
    httpStatus,
    evidenceHash: sha256(input.evidenceHash, "probe evidence hash"),
  });
  const canonical = Object.freeze({ ...common, result });
  return Object.freeze({
    ...common,
    outcome: result.kind,
    failureCode: result.kind === "non-x402" ? result.reason : null,
    revisionId: result.kind === "verified-x402" ? result.revisionId : null,
    resourceName: result.kind === "verified-x402" ? result.name : null,
    description: result.kind === "verified-x402" ? result.description : null,
    challengeHash:
      result.kind === "verified-x402" ? result.challengeHash : null,
    x402Version: result.kind === "verified-x402" ? result.x402Version : null,
    scheme: result.kind === "verified-x402" ? result.scheme : null,
    network: result.kind === "verified-x402" ? result.network : null,
    asset: result.kind === "verified-x402" ? result.asset : null,
    recipient: result.kind === "verified-x402" ? result.recipient : null,
    amountAtomic: result.kind === "verified-x402" ? result.amountAtomic : null,
    transferMethod:
      result.kind === "verified-x402" ? result.transferMethod : null,
    requestHash: requestHash(canonical),
  });
}
