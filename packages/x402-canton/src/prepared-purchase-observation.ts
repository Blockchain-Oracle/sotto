import { randomBytes } from "node:crypto";
import { claimBoundedPurchasePrepareRequest } from "./bounded-purchase-command.js";
import type { BoundedPurchasePrepareRequest } from "./bounded-purchase-command-types.js";
import {
  canonicalTime,
  exactKeys,
  objectValue,
} from "./purchase-commitment-primitives.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";
import { canonicalDisclosureBlob } from "./purchase-disclosure-validation.js";
import { assertStrictJson } from "./strict-json.js";

export const PREPARE_SUBMISSION_PATH =
  "/v2/interactive-submission/prepare" as const;
export const PREPARE_SUBMISSION_TIMEOUT_MS = 10_000;
export const MAX_PREPARE_RESPONSE_BYTES = 8_388_608;
export const MAX_PREPARED_TRANSACTION_BYTES = 6_291_456;

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
  preparedTransaction: Uint8Array;
  preparedTransactionHash: string;
}> & { claimed: boolean };

const states = new WeakMap<object, PreparedPurchaseState>();

function parseResponse(bytes: Uint8Array): Readonly<{
  preparedTransaction: Uint8Array;
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
  exactKeys(
    root,
    [
      "preparedTransaction",
      "preparedTransactionHash",
      "hashingSchemeVersion",
      "hashingDetails",
      "costEstimation",
    ],
    "prepare response",
  );
  if (root.hashingDetails !== null) {
    throw new Error("prepare hashing details must be absent");
  }
  if (root.costEstimation !== null) {
    const cost = objectValue(root.costEstimation, "prepare cost estimation");
    exactKeys(
      cost,
      [
        "estimationTimestamp",
        "confirmationRequestTrafficCostEstimation",
        "confirmationResponseTrafficCostEstimation",
        "totalTrafficCostEstimation",
      ],
      "prepare cost estimation",
    );
    if (
      typeof cost.estimationTimestamp !== "string" ||
      Buffer.byteLength(cost.estimationTimestamp, "utf8") > 64 ||
      [
        cost.confirmationRequestTrafficCostEstimation,
        cost.confirmationResponseTrafficCostEstimation,
        cost.totalTrafficCostEstimation,
      ].some((value) => !Number.isSafeInteger(value) || (value as number) < 0)
    ) {
      throw new Error("prepare cost estimation is invalid");
    }
  }
  if (root.hashingSchemeVersion !== "HASHING_SCHEME_VERSION_V2") {
    throw new Error("prepare response must use hashing scheme V2");
  }
  const transaction = canonicalDisclosureBlob(
    root.preparedTransaction,
    "prepared transaction",
    MAX_PREPARED_TRANSACTION_BYTES,
  );
  const hash = canonicalDisclosureBlob(
    root.preparedTransactionHash,
    "prepared transaction hash",
    32,
  );
  if (hash.bytes !== 32) {
    throw new Error("prepared transaction hash must contain 32 bytes");
  }
  return Object.freeze({
    preparedTransaction: new Uint8Array(
      Buffer.from(transaction.value, "base64"),
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
      preparedTransaction: new Uint8Array(parsed.preparedTransaction),
      preparedTransactionHash: parsed.preparedTransactionHash,
    });
    return observation;
  };
}
