import { randomBytes } from "node:crypto";
import { claimBoundedPurchasePrepareRequest } from "./bounded-purchase-command.js";
import type { BoundedPurchasePrepareRequest } from "./bounded-purchase-command-types.js";
import {
  canonicalTime,
  objectValue,
} from "./purchase-commitment-primitives.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";
import { canonicalDisclosureBlob } from "./purchase-disclosure-validation.js";
import { assertStrictJson } from "./strict-json.js";
import {
  snapshotStrictJsonObject,
  type StrictJsonObject,
} from "./strict-json-value.js";

export const PREPARE_SUBMISSION_PATH =
  "/v2/interactive-submission/prepare" as const;
export const PREPARE_SUBMISSION_TIMEOUT_MS = 10_000;
export const MAX_PREPARE_RESPONSE_BYTES = 8_388_608;

export type PreparedPurchaseTransportRequest = Readonly<{
  path: typeof PREPARE_SUBMISSION_PATH;
  method: "POST";
  contentType: "application/json";
  redirect: "error";
  timeoutMilliseconds: typeof PREPARE_SUBMISSION_TIMEOUT_MS;
  maximumResponseBytes: typeof MAX_PREPARE_RESPONSE_BYTES;
  body: BoundedPurchasePrepareRequest;
}>;

export type PreparedPurchaseReader = (
  request: PreparedPurchaseTransportRequest,
) => Promise<Uint8Array>;

declare const preparedPurchaseObservationBrand: unique symbol;
export type PreparedPurchaseObservation = Readonly<{
  observationId: `sha256:${string}`;
  observedAt: string;
  preparedTransactionHash: string;
  readonly [preparedPurchaseObservationBrand]: true;
}>;

type PreparedPurchaseState = Readonly<{
  capturedAt: number;
  intent: BoundedPurchaseLedgerIntent;
  prepareRequest: BoundedPurchasePrepareRequest;
  preparedTransaction: StrictJsonObject;
  preparedTransactionHash: string;
}> & { claimed: boolean };

const states = new WeakMap<object, PreparedPurchaseState>();

function parseResponse(bytes: Uint8Array): Readonly<{
  preparedTransaction: StrictJsonObject;
  preparedTransactionHash: string;
}> {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength > MAX_PREPARE_RESPONSE_BYTES
  ) {
    throw new Error("prepare response exceeds byte limit");
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Error("prepare response must not contain a BOM");
  }
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("prepare response is not valid UTF-8");
  }
  assertStrictJson(source, 64, 65_536);
  const root = objectValue(JSON.parse(source), "prepare response");
  const keys = Object.keys(root);
  const allowed = new Set([
    "preparedTransaction",
    "preparedTransactionHash",
    "hashingSchemeVersion",
    "costEstimation",
  ]);
  if (
    keys.some((key) => !allowed.has(key)) ||
    !("preparedTransaction" in root) ||
    !("preparedTransactionHash" in root) ||
    !("hashingSchemeVersion" in root)
  ) {
    throw new Error("prepare response keys must match the approved contract");
  }
  if (root.hashingSchemeVersion !== "HASHING_SCHEME_VERSION_V2") {
    throw new Error("prepare response must use hashing scheme V2");
  }
  const hash = canonicalDisclosureBlob(
    root.preparedTransactionHash,
    "prepared transaction hash",
    32,
  );
  if (hash.bytes !== 32) {
    throw new Error("prepared transaction hash must contain 32 bytes");
  }
  if ("costEstimation" in root) {
    objectValue(root.costEstimation, "prepare cost estimation");
  }
  return Object.freeze({
    preparedTransaction: snapshotStrictJsonObject(
      root.preparedTransaction,
      "prepared transaction",
      {
        maximumBytes: MAX_PREPARE_RESPONSE_BYTES,
        maximumDepth: 64,
        maximumNodes: 65_536,
      },
    ),
    preparedTransactionHash: hash.value,
  });
}

export function createPreparedPurchaseObserver(
  reader: PreparedPurchaseReader,
): (
  prepareRequest: BoundedPurchasePrepareRequest,
) => Promise<PreparedPurchaseObservation> {
  return async (candidateRequest) => {
    const authenticated = claimBoundedPurchasePrepareRequest(candidateRequest);
    const capturedAt = Date.now();
    const parsed = parseResponse(
      await reader(
        Object.freeze({
          path: PREPARE_SUBMISSION_PATH,
          method: "POST",
          contentType: "application/json",
          redirect: "error",
          timeoutMilliseconds: PREPARE_SUBMISSION_TIMEOUT_MS,
          maximumResponseBytes: MAX_PREPARE_RESPONSE_BYTES,
          body: authenticated.request,
        }),
      ),
    );
    const observedAt = new Date(capturedAt).toISOString();
    canonicalTime(observedAt, "prepared Purchase observedAt");
    const observation = Object.freeze({
      observationId: `sha256:${randomBytes(32).toString("hex")}`,
      observedAt,
      preparedTransactionHash: parsed.preparedTransactionHash,
    }) as PreparedPurchaseObservation;
    states.set(observation, {
      capturedAt,
      claimed: false,
      intent: authenticated.intent,
      prepareRequest: authenticated.request,
      preparedTransaction: parsed.preparedTransaction,
      preparedTransactionHash: parsed.preparedTransactionHash,
    });
    return observation;
  };
}
