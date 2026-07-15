import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  buildBoundedCapabilityBootstrapAt,
  type BoundedCapabilityBootstrapRequest,
} from "./bounded-capability-bootstrap.js";
import {
  boundedCapabilityBootstrapState,
  registerBoundedCapabilityBootstrap,
  validateBoundedCapabilityBootstrapNetwork,
} from "./bounded-capability-bootstrap-state.js";
import { bootstrapIntentSourceCommit } from "./bounded-capability-bootstrap-intent-primitives.js";
import { parseBootstrapIntentRequest } from "./bounded-capability-bootstrap-intent-request.js";
import type { LegacyBootstrapIntentRestoreOptions } from "./bounded-capability-bootstrap-intent-types.js";
import {
  APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID,
  SOTTO_CONTROL_PACKAGE_ID,
} from "./purchase-capability-event.js";
import {
  canonicalTime,
  exactKeys,
  objectValue,
} from "./purchase-commitment-primitives.js";

const PREPARE_MAXIMUM_RECORD_AGE_MS = 5 * 60 * 1_000;

function legacyCommandId(request: BoundedCapabilityBootstrapRequest): string {
  const createArguments = request.commands[0]!.CreateCommand.createArguments;
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        templateId: APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID,
        packageId: SOTTO_CONTROL_PACKAGE_ID,
        synchronizerId: request.synchronizerId,
        createArguments,
      }),
    )
    .digest("hex");
  return `sotto-capability-bootstrap-v1-${hash}`;
}

function legacyPreparedRequest(
  request: BoundedCapabilityBootstrapRequest,
  commandId: string,
  validatedAt: number,
) {
  return {
    actAs: request.actAs,
    commandId,
    commands: request.commands,
    disclosedContracts: [],
    hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
    maxRecordTime: new Date(
      validatedAt + PREPARE_MAXIMUM_RECORD_AGE_MS,
    ).toISOString(),
    packageIdSelectionPreference: request.packageIdSelectionPreference,
    prefetchContractKeys: [],
    readAs: request.readAs,
    synchronizerId: request.synchronizerId,
    userId: request.userId,
    verboseHashing: false,
  };
}

export function restoreLegacyBoundedCapabilityBootstrapIntent(
  value: unknown,
  options: LegacyBootstrapIntentRestoreOptions | undefined,
): BoundedCapabilityBootstrapRequest {
  if (options === undefined) {
    throw new Error("legacy bootstrap intent trusted network is required");
  }
  const intent = objectValue(value, "persisted bootstrap intent");
  exactKeys(
    intent,
    ["request", "schema", "sourceCommit", "validatedAt"],
    "persisted bootstrap intent",
  );
  bootstrapIntentSourceCommit(intent.sourceCommit);
  const validatedAt = canonicalTime(
    intent.validatedAt,
    "persisted bootstrap validatedAt",
  );
  const network = validateBoundedCapabilityBootstrapNetwork(
    options.legacyNetwork,
  );
  const restored = parseBootstrapIntentRequest(intent.request);
  const current = buildBoundedCapabilityBootstrapAt(
    { ...restored.input, network },
    validatedAt,
  );
  const commandId = legacyCommandId(current);
  const normalized = Object.freeze({ ...current, commandId });
  const expected =
    restored.kind === "direct"
      ? normalized
      : legacyPreparedRequest(current, commandId, validatedAt);
  if (!isDeepStrictEqual(restored.raw, expected)) {
    throw new Error("legacy bootstrap command does not match its intent");
  }
  registerBoundedCapabilityBootstrap(normalized, {
    ...boundedCapabilityBootstrapState(current),
    commandId,
  });
  return normalized;
}
