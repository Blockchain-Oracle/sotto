import { randomBytes } from "node:crypto";
import {
  requireHumanObservationActive,
  withHumanObservationDeadline,
  type HumanObservationOptions,
  type HumanObservationReadOptions,
} from "./human-observation-deadline.js";
import { claimHumanPurchasePrepareRequest } from "./human-purchase-command-state.js";
import type { HumanPurchasePrepareRequest } from "./human-purchase-command-types.js";
import { registerHumanPreparedPurchaseObservation } from "./human-prepared-purchase-observation-state.js";
import { inspectHumanPreparedPurchaseStructure } from "./human-prepared-purchase-validation.js";
import { canonicalTime } from "./purchase-commitment-primitives.js";
import {
  MAX_PREPARE_RESPONSE_BYTES,
  MAX_PREPARED_TRANSACTION_BYTES,
} from "./prepared-purchase-resource-envelope.js";
import { parsePreparedTransactionResponse } from "./prepared-transaction-response.js";

export const HUMAN_PREPARE_SUBMISSION_PATH =
  "/v2/interactive-submission/prepare" as const;
export const HUMAN_PREPARE_SUBMISSION_TIMEOUT_MS = 10_000;
export const HUMAN_PREPARED_OBSERVATION_VERSION =
  "sotto-human-prepared-observation-v1" as const;
export { MAX_PREPARE_RESPONSE_BYTES, MAX_PREPARED_TRANSACTION_BYTES };

export type HumanPreparedPurchaseTransportRequest = Readonly<{
  path: typeof HUMAN_PREPARE_SUBMISSION_PATH;
  method: "POST";
  contentType: "application/json";
  redirect: "error";
  timeoutMilliseconds: typeof HUMAN_PREPARE_SUBMISSION_TIMEOUT_MS;
  maximumResponseBytes: typeof MAX_PREPARE_RESPONSE_BYTES;
  body: HumanPurchasePrepareRequest;
}>;

export type HumanPreparedPurchaseObservationOptions = HumanObservationOptions;
export type HumanPreparedPurchaseReadOptions = HumanObservationReadOptions;

export type HumanPreparedPurchaseReader = (
  request: HumanPreparedPurchaseTransportRequest,
  options: HumanPreparedPurchaseReadOptions,
) => Promise<Uint8Array>;

declare const humanPreparedPurchaseObservationBrand: unique symbol;
export type HumanPreparedPurchaseObservation = Readonly<{
  version: typeof HUMAN_PREPARED_OBSERVATION_VERSION;
  observationId: `sha256:${string}`;
  observedAt: string;
  readonly [humanPreparedPurchaseObservationBrand]: true;
}>;

function snapshotResponse(candidate: unknown): Uint8Array {
  if (!(candidate instanceof Uint8Array)) {
    throw new Error("human prepared Purchase response is invalid");
  }
  if (candidate.byteLength > MAX_PREPARE_RESPONSE_BYTES) {
    throw new Error("human prepared Purchase response exceeds byte limit");
  }
  if (
    typeof SharedArrayBuffer !== "undefined" &&
    candidate.buffer instanceof SharedArrayBuffer
  ) {
    throw new Error("human prepared Purchase response must be isolated");
  }
  return new Uint8Array(candidate);
}

function transportRequest(
  request: HumanPurchasePrepareRequest,
): HumanPreparedPurchaseTransportRequest {
  return Object.freeze({
    path: HUMAN_PREPARE_SUBMISSION_PATH,
    method: "POST",
    contentType: "application/json",
    redirect: "error",
    timeoutMilliseconds: HUMAN_PREPARE_SUBMISSION_TIMEOUT_MS,
    maximumResponseBytes: MAX_PREPARE_RESPONSE_BYTES,
    body: request,
  });
}

async function readPreparedResponse(
  reader: HumanPreparedPurchaseReader,
  request: HumanPreparedPurchaseTransportRequest,
  signal: AbortSignal,
): Promise<Uint8Array> {
  try {
    const response = await reader(request, Object.freeze({ signal }));
    requireHumanObservationActive(signal, "human prepared Purchase");
    return snapshotResponse(response);
  } catch {
    requireHumanObservationActive(signal, "human prepared Purchase");
    throw new Error("human prepared Purchase read failed");
  }
}

export function createHumanPreparedPurchaseObserver(
  reader: HumanPreparedPurchaseReader,
) {
  if (typeof reader !== "function") {
    throw new Error("human prepared Purchase reader is required");
  }
  return async (
    candidateRequest: HumanPurchasePrepareRequest,
    options: HumanPreparedPurchaseObservationOptions = {},
  ): Promise<HumanPreparedPurchaseObservation> =>
    await withHumanObservationDeadline(
      "human prepared Purchase",
      HUMAN_PREPARE_SUBMISSION_TIMEOUT_MS,
      options,
      async (signal) => {
        requireHumanObservationActive(signal, "human prepared Purchase");
        const acquisitionStartedAt = Date.now();
        const authenticated =
          claimHumanPurchasePrepareRequest(candidateRequest);
        const response = await readPreparedResponse(
          reader,
          transportRequest(authenticated.request),
          signal,
        );
        const parsed = parsePreparedTransactionResponse(response);
        const shape = inspectHumanPreparedPurchaseStructure(
          parsed.preparedTransaction,
          authenticated.intent,
          authenticated.request,
        );
        requireHumanObservationActive(signal, "human prepared Purchase");
        const capturedAt = Date.now();
        const observedAt = new Date(capturedAt).toISOString();
        canonicalTime(observedAt, "human prepared Purchase observedAt");
        const observation = Object.freeze({
          version: HUMAN_PREPARED_OBSERVATION_VERSION,
          observationId: `sha256:${randomBytes(32).toString("hex")}`,
          observedAt,
        }) as HumanPreparedPurchaseObservation;
        registerHumanPreparedPurchaseObservation(observation, {
          acquisitionStartedAt,
          capturedAt,
          claimed: false,
          intent: authenticated.intent,
          prepareRequest: authenticated.request,
          preparedTransaction: parsed.preparedTransaction,
          participantPreparedTransactionHash: Buffer.from(
            parsed.preparedTransactionHash,
            "base64",
          ),
          shape,
        });
        return observation;
      },
    );
}
