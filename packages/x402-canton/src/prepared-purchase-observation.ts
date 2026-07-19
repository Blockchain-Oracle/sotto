import { randomBytes } from "node:crypto";
import { claimBoundedPurchasePrepareRequest } from "./bounded-purchase-command.js";
import type { BoundedPurchasePrepareRequest } from "./bounded-purchase-command-types.js";
import { canonicalTime } from "./purchase-commitment-primitives.js";
import { inspectPreparedPurchaseStructure } from "./prepared-purchase-validation.js";
import { requirePreparedPurchaseFresh } from "./prepared-purchase-freshness.js";
import { registerPreparedPurchaseObservation } from "./prepared-purchase-observation-state.js";
import {
  MAX_PREPARE_RESPONSE_BYTES,
  MAX_PREPARED_TRANSACTION_BYTES,
} from "./prepared-purchase-resource-envelope.js";
import { parsePreparedTransactionResponse } from "./prepared-transaction-response.js";

export const PREPARE_SUBMISSION_PATH = "/v2/interactive-submission/prepare";
export const PREPARE_SUBMISSION_TIMEOUT_MS = 10_000;
export { MAX_PREPARE_RESPONSE_BYTES, MAX_PREPARED_TRANSACTION_BYTES };
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

export function createPreparedPurchaseObserver(
  reader: PreparedPurchaseReader,
): (
  prepareRequest: BoundedPurchasePrepareRequest,
) => Promise<PreparedPurchaseObservation> {
  return async (candidateRequest) => {
    const authenticated = claimBoundedPurchasePrepareRequest(candidateRequest);
    const capturedAt = Date.now();
    const parsed = parsePreparedTransactionResponse(
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
    const shape = inspectPreparedPurchaseStructure(
      parsed.preparedTransaction,
      authenticated.intent,
      authenticated.request,
    );
    const completedAt = requirePreparedPurchaseFresh(
      capturedAt,
      authenticated.intent.challenge.executeBefore,
      "prepared Purchase acquisition",
    );
    const observedAt = new Date(completedAt).toISOString();
    canonicalTime(observedAt, "prepared Purchase observedAt");
    const observation = Object.freeze({
      observationId: `sha256:${randomBytes(32).toString("hex")}`,
      observedAt,
      preparedTransactionHash: parsed.preparedTransactionHash,
    }) as PreparedPurchaseObservation;
    registerPreparedPurchaseObservation(observation, {
      capturedAt,
      claimed: false,
      intent: authenticated.intent,
      prepareRequest: authenticated.request,
      preparedTransaction: new Uint8Array(parsed.preparedTransaction),
      preparedTransactionHash: parsed.preparedTransactionHash,
      shape,
    });
    return observation;
  };
}
