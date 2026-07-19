import {
  assertBoundedCapabilityBootstrapFresh,
  type BoundedCapabilityBootstrapRequest,
} from "./bounded-capability-bootstrap.js";
import { boundedCapabilityBootstrapState } from "./bounded-capability-bootstrap-state.js";
import { canonicalTime } from "./purchase-commitment-primitives.js";

const PREPARE_MAXIMUM_RECORD_AGE_MS = 5 * 60 * 1_000;

export function buildBoundedCapabilityBootstrapPrepareRequest(
  request: BoundedCapabilityBootstrapRequest,
) {
  assertBoundedCapabilityBootstrapFresh(request);
  const state = boundedCapabilityBootstrapState(request);
  return Object.freeze({
    actAs: request.actAs,
    commandId: request.commandId,
    commands: request.commands,
    disclosedContracts: Object.freeze([]) as readonly [],
    hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2" as const,
    maxRecordTime: new Date(
      canonicalTime(state.validatedAt, "bootstrap validatedAt") +
        PREPARE_MAXIMUM_RECORD_AGE_MS,
    ).toISOString(),
    packageIdSelectionPreference: request.packageIdSelectionPreference,
    prefetchContractKeys: Object.freeze([]) as readonly [],
    readAs: request.readAs,
    synchronizerId: request.synchronizerId,
    userId: request.userId,
    verboseHashing: false as const,
  });
}

export type BoundedCapabilityBootstrapPrepareRequest = ReturnType<
  typeof buildBoundedCapabilityBootstrapPrepareRequest
>;
