import { isDeepStrictEqual } from "node:util";
import {
  buildBoundedCapabilityBootstrapAt,
  type BoundedCapabilityBootstrapRequest,
} from "./bounded-capability-bootstrap.js";
import {
  boundedCapabilityBootstrapState,
  validateBoundedCapabilityBootstrapNetwork,
} from "./bounded-capability-bootstrap-state.js";
import { restoreLegacyBoundedCapabilityBootstrapIntent } from "./bounded-capability-bootstrap-intent-legacy.js";
import { bootstrapIntentSourceCommit } from "./bounded-capability-bootstrap-intent-primitives.js";
import { parseBootstrapIntentRequest } from "./bounded-capability-bootstrap-intent-request.js";
import type {
  LegacyBootstrapIntentRestoreOptions,
  PersistedBootstrapIntentV2,
} from "./bounded-capability-bootstrap-intent-types.js";
import {
  canonicalTime,
  exactKeys,
  objectValue,
} from "./purchase-commitment-primitives.js";

export type {
  LegacyBootstrapIntentRestoreOptions,
  PersistedBootstrapIntent,
  PersistedBootstrapIntentV1,
  PersistedBootstrapIntentV2,
} from "./bounded-capability-bootstrap-intent-types.js";

export function exportBoundedCapabilityBootstrapIntent(
  request: BoundedCapabilityBootstrapRequest,
  candidateSourceCommit: string,
): PersistedBootstrapIntentV2 {
  const state = boundedCapabilityBootstrapState(request);
  return Object.freeze({
    network: state.network,
    request,
    schema: "sotto-capability-bootstrap-intent-v2" as const,
    sourceCommit: bootstrapIntentSourceCommit(candidateSourceCommit),
    validatedAt: state.validatedAt,
  });
}

export function restoreBoundedCapabilityBootstrapIntent(
  value: unknown,
  legacyOptions?: LegacyBootstrapIntentRestoreOptions,
): BoundedCapabilityBootstrapRequest {
  const intent = objectValue(value, "persisted bootstrap intent");
  if (intent.schema === "sotto-capability-bootstrap-intent-v1") {
    return restoreLegacyBoundedCapabilityBootstrapIntent(value, legacyOptions);
  }
  exactKeys(
    intent,
    ["network", "request", "schema", "sourceCommit", "validatedAt"],
    "persisted bootstrap intent",
  );
  if (intent.schema !== "sotto-capability-bootstrap-intent-v2") {
    throw new Error("persisted bootstrap intent schema is unsupported");
  }
  bootstrapIntentSourceCommit(intent.sourceCommit);
  const validatedAt = canonicalTime(
    intent.validatedAt,
    "persisted bootstrap validatedAt",
  );
  const network = validateBoundedCapabilityBootstrapNetwork(intent.network);
  const restored = parseBootstrapIntentRequest(intent.request);
  if (restored.kind !== "direct") {
    throw new Error("persisted bootstrap v2 request must be direct");
  }
  const request = buildBoundedCapabilityBootstrapAt(
    { ...restored.input, network },
    validatedAt,
  );
  if (!isDeepStrictEqual(request, restored.raw)) {
    throw new Error("persisted bootstrap request does not match its intent");
  }
  return request;
}
