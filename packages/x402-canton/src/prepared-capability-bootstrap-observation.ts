import { randomBytes } from "node:crypto";
import {
  assertBoundedCapabilityBootstrapFresh,
  type BoundedCapabilityBootstrapRequest,
} from "./bounded-capability-bootstrap.js";
import { buildBoundedCapabilityBootstrapPrepareRequest } from "./bounded-capability-bootstrap-prepare.js";
import { sha256Hex } from "./purchase-commitment-primitives.js";
import { parsePreparedCapabilityBootstrapResponse } from "./prepared-capability-bootstrap-response.js";
import { validatePreparedCapabilityBootstrapShape } from "./prepared-capability-bootstrap-shape.js";
import {
  MAX_PREPARED_CAPABILITY_RESPONSE_BYTES,
  PREPARED_CAPABILITY_BOOTSTRAP_PATH,
  PREPARED_CAPABILITY_BOOTSTRAP_TIMEOUT_MS,
  type PreparedCapabilityBootstrapObservation,
  type PreparedCapabilityBootstrapReader,
  type PreparedCapabilityBootstrapState,
} from "./prepared-capability-bootstrap-types.js";

const states = new WeakMap<object, PreparedCapabilityBootstrapState>();

export function readPreparedCapabilityBootstrapObservation(
  candidate: unknown,
): PreparedCapabilityBootstrapState {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("prepared capability observation is not authenticated");
  }
  const state = states.get(candidate);
  if (state === undefined) {
    throw new Error("prepared capability observation is not authenticated");
  }
  assertBoundedCapabilityBootstrapFresh(state.request);
  return state;
}

export function claimPreparedCapabilityBootstrapObservation(
  candidate: unknown,
): PreparedCapabilityBootstrapState {
  const state = readPreparedCapabilityBootstrapObservation(candidate);
  if (state.claimed) {
    throw new Error("prepared capability observation is already claimed");
  }
  state.claimed = true;
  return Object.freeze({
    ...state,
    preparedTransaction: new Uint8Array(state.preparedTransaction),
  });
}

export function createPreparedCapabilityBootstrapObserver(
  reader: PreparedCapabilityBootstrapReader,
) {
  if (typeof reader !== "function") {
    throw new Error("prepared capability reader is required");
  }
  return async (
    request: BoundedCapabilityBootstrapRequest,
  ): Promise<PreparedCapabilityBootstrapObservation> => {
    assertBoundedCapabilityBootstrapFresh(request);
    const prepareRequest =
      buildBoundedCapabilityBootstrapPrepareRequest(request);
    const response = await reader(
      Object.freeze({
        body: prepareRequest,
        contentType: "application/json" as const,
        maximumResponseBytes: MAX_PREPARED_CAPABILITY_RESPONSE_BYTES,
        method: "POST" as const,
        path: PREPARED_CAPABILITY_BOOTSTRAP_PATH,
        redirect: "error" as const,
        timeoutMilliseconds: PREPARED_CAPABILITY_BOOTSTRAP_TIMEOUT_MS,
      }),
    );
    assertBoundedCapabilityBootstrapFresh(request);
    const parsed = parsePreparedCapabilityBootstrapResponse(response);
    validatePreparedCapabilityBootstrapShape(
      parsed.preparedTransaction,
      prepareRequest,
    );
    const capturedAt = Date.now();
    const observation = Object.freeze({
      hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2" as const,
      observationId: `sha256:${sha256Hex(
        Buffer.concat([
          Buffer.from(parsed.preparedTransaction),
          Buffer.from(parsed.preparedTransactionHash, "base64"),
          randomBytes(32),
        ]),
      )}` as const,
      observedAt: new Date(capturedAt).toISOString(),
      preparedTransactionHash: parsed.preparedTransactionHash,
    }) as PreparedCapabilityBootstrapObservation;
    states.set(observation, {
      capturedAt,
      claimed: false,
      preparedTransaction: new Uint8Array(parsed.preparedTransaction),
      preparedTransactionHash: parsed.preparedTransactionHash,
      request,
    });
    return observation;
  };
}

export {
  MAX_PREPARED_CAPABILITY_RESPONSE_BYTES,
  MAX_PREPARED_CAPABILITY_TRANSACTION_BYTES,
  PREPARED_CAPABILITY_BOOTSTRAP_PATH,
  PREPARED_CAPABILITY_BOOTSTRAP_TIMEOUT_MS,
  type PreparedCapabilityBootstrapObservation,
  type PreparedCapabilityBootstrapReader,
  type PreparedCapabilityBootstrapTransportRequest,
} from "./prepared-capability-bootstrap-types.js";
