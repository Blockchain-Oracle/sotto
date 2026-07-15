import { isDeepStrictEqual } from "node:util";
import {
  buildBoundedCapabilityBootstrapAt,
  type BoundedCapabilityBootstrapInput,
  type BoundedCapabilityBootstrapRequest,
} from "./bounded-capability-bootstrap.js";
import {
  boundedCapabilityBootstrapState,
  validateBoundedCapabilityBootstrapNetwork,
} from "./bounded-capability-bootstrap-state.js";
import {
  parsePurchaseCapabilityCreatedEvent,
  SOTTO_CONTROL_PACKAGE_ID,
} from "./purchase-capability-event.js";
import {
  canonicalTime,
  exactKeys,
  identifier,
  objectValue,
} from "./purchase-commitment-primitives.js";

const SOURCE_COMMIT_PATTERN = /^[0-9a-f]{40}$/u;

export type PersistedBootstrapIntentV1 = Readonly<{
  network: `canton:${string}`;
  request: BoundedCapabilityBootstrapRequest;
  schema: "sotto-capability-bootstrap-intent-v1";
  sourceCommit: string;
  validatedAt: string;
}>;

function sourceCommit(value: unknown): string {
  const commit = identifier(value, "bootstrap source commit", 40);
  if (!SOURCE_COMMIT_PATTERN.test(commit)) {
    throw new Error("bootstrap source commit must be a full Git SHA-1");
  }
  return commit;
}

function restoredInput(
  value: unknown,
  network: `canton:${string}`,
): {
  input: BoundedCapabilityBootstrapInput;
  raw: Record<string, unknown>;
} {
  const raw = objectValue(value, "persisted bootstrap request");
  exactKeys(
    raw,
    [
      "actAs",
      "commandId",
      "commands",
      "packageIdSelectionPreference",
      "readAs",
      "synchronizerId",
      "userId",
      "workflowId",
    ],
    "persisted bootstrap request",
  );
  if (
    !Array.isArray(raw.actAs) ||
    raw.actAs.length !== 1 ||
    !Array.isArray(raw.readAs) ||
    raw.readAs.length !== 0 ||
    !Array.isArray(raw.commands) ||
    raw.commands.length !== 1 ||
    raw.workflowId !== "sotto-capability-bootstrap-v1"
  ) {
    throw new Error("persisted bootstrap request shape does not match");
  }
  if (
    !Array.isArray(raw.packageIdSelectionPreference) ||
    raw.packageIdSelectionPreference.length !== 1 ||
    raw.packageIdSelectionPreference[0] !== SOTTO_CONTROL_PACKAGE_ID
  ) {
    throw new Error("persisted bootstrap package preference does not match");
  }
  const wrapper = objectValue(raw.commands[0], "persisted bootstrap command");
  exactKeys(wrapper, ["CreateCommand"], "persisted bootstrap command");
  const create = objectValue(
    wrapper.CreateCommand,
    "persisted bootstrap create command",
  );
  exactKeys(
    create,
    ["createArguments", "templateId"],
    "persisted bootstrap create command",
  );
  const argument = objectValue(
    create.createArguments,
    "persisted bootstrap create arguments",
  );
  const snapshot = parsePurchaseCapabilityCreatedEvent({
    contractId: "00bootstrap-restore",
    createArgument: argument,
    observers: [argument.agent],
    packageName: "sotto-control",
    signatories: [argument.payer],
    templateId: create.templateId,
  });
  if (raw.actAs[0] !== snapshot.payerParty) {
    throw new Error("persisted bootstrap actAs does not match payer");
  }
  identifier(raw.commandId, "persisted bootstrap command ID");
  return {
    input: {
      agentParty: snapshot.agentParty,
      allowedRecipient: snapshot.recipient,
      allowedResourceHash: snapshot.resourceHash,
      expiresAt: snapshot.expiresAt,
      instrument: snapshot.instrument,
      maximumTotalDebitAtomic: snapshot.maximumTotalDebitAtomic,
      network,
      payerParty: snapshot.payerParty,
      perCallLimitAtomic: snapshot.perCallLimitAtomic,
      remainingAllowanceAtomic: snapshot.remainingAllowanceAtomic,
      synchronizerId: identifier(
        raw.synchronizerId,
        "persisted bootstrap synchronizer ID",
      ),
      transferFactoryContractId: snapshot.transferFactoryContractId,
      userId: identifier(raw.userId, "persisted bootstrap user ID", 256),
    },
    raw,
  };
}

export function exportBoundedCapabilityBootstrapIntent(
  request: BoundedCapabilityBootstrapRequest,
  candidateSourceCommit: string,
): PersistedBootstrapIntentV1 {
  const state = boundedCapabilityBootstrapState(request);
  return Object.freeze({
    network: state.network,
    request,
    schema: "sotto-capability-bootstrap-intent-v1" as const,
    sourceCommit: sourceCommit(candidateSourceCommit),
    validatedAt: state.validatedAt,
  });
}

export function restoreBoundedCapabilityBootstrapIntent(
  value: unknown,
): BoundedCapabilityBootstrapRequest {
  const intent = objectValue(value, "persisted bootstrap intent");
  exactKeys(
    intent,
    ["network", "request", "schema", "sourceCommit", "validatedAt"],
    "persisted bootstrap intent",
  );
  if (intent.schema !== "sotto-capability-bootstrap-intent-v1") {
    throw new Error("persisted bootstrap intent schema is unsupported");
  }
  sourceCommit(intent.sourceCommit);
  const validatedAt = canonicalTime(
    intent.validatedAt,
    "persisted bootstrap validatedAt",
  );
  const network = validateBoundedCapabilityBootstrapNetwork(intent.network);
  const restored = restoredInput(intent.request, network);
  const request = buildBoundedCapabilityBootstrapAt(
    restored.input,
    validatedAt,
  );
  if (!isDeepStrictEqual(request, restored.raw)) {
    throw new Error("persisted bootstrap request does not match its intent");
  }
  return request;
}
