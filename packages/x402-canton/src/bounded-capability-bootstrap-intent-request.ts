import type { BoundedCapabilityBootstrapInput } from "./bounded-capability-bootstrap.js";
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

const DIRECT_KEYS = [
  "actAs",
  "commandId",
  "commands",
  "packageIdSelectionPreference",
  "readAs",
  "synchronizerId",
  "userId",
  "workflowId",
] as const;

const PREPARED_KEYS = [
  "actAs",
  "commandId",
  "commands",
  "disclosedContracts",
  "hashingSchemeVersion",
  "maxRecordTime",
  "packageIdSelectionPreference",
  "prefetchContractKeys",
  "readAs",
  "synchronizerId",
  "userId",
  "verboseHashing",
] as const;

export type BootstrapIntentRequestKind = "direct" | "prepared";

export type ParsedBootstrapIntentRequest = Readonly<{
  input: Omit<BoundedCapabilityBootstrapInput, "network">;
  kind: BootstrapIntentRequestKind;
  raw: Record<string, unknown>;
}>;

function requestKind(raw: Record<string, unknown>): BootstrapIntentRequestKind {
  const keys = JSON.stringify(Object.keys(raw).sort());
  if (keys === JSON.stringify([...DIRECT_KEYS].sort())) return "direct";
  if (keys === JSON.stringify([...PREPARED_KEYS].sort())) return "prepared";
  throw new Error("persisted bootstrap request keys do not match");
}

function requireEnvelope(
  raw: Record<string, unknown>,
  kind: BootstrapIntentRequestKind,
): void {
  exactKeys(
    raw,
    kind === "direct" ? DIRECT_KEYS : PREPARED_KEYS,
    "persisted bootstrap request",
  );
  if (
    !Array.isArray(raw.actAs) ||
    raw.actAs.length !== 1 ||
    !Array.isArray(raw.readAs) ||
    raw.readAs.length !== 0 ||
    !Array.isArray(raw.commands) ||
    raw.commands.length !== 1
  ) {
    throw new Error("persisted bootstrap request shape does not match");
  }
  if (kind === "direct" && raw.workflowId !== "sotto-capability-bootstrap-v1") {
    throw new Error("persisted bootstrap workflow does not match");
  }
  if (
    kind === "prepared" &&
    (!Array.isArray(raw.disclosedContracts) ||
      raw.disclosedContracts.length !== 0 ||
      !Array.isArray(raw.prefetchContractKeys) ||
      raw.prefetchContractKeys.length !== 0 ||
      raw.verboseHashing !== false ||
      raw.hashingSchemeVersion !== "HASHING_SCHEME_VERSION_V2")
  ) {
    throw new Error("persisted bootstrap prepare request does not match");
  }
}

export function parseBootstrapIntentRequest(
  value: unknown,
): ParsedBootstrapIntentRequest {
  const raw = objectValue(value, "persisted bootstrap request");
  const kind = requestKind(raw);
  requireEnvelope(raw, kind);
  const actAs = raw.actAs as unknown[];
  const commands = raw.commands as unknown[];
  if (
    !Array.isArray(raw.packageIdSelectionPreference) ||
    raw.packageIdSelectionPreference.length !== 1 ||
    raw.packageIdSelectionPreference[0] !== SOTTO_CONTROL_PACKAGE_ID
  ) {
    throw new Error("persisted bootstrap package preference does not match");
  }
  const wrapper = objectValue(commands[0], "persisted bootstrap command");
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
  if (actAs[0] !== snapshot.payerParty) {
    throw new Error("persisted bootstrap actAs does not match payer");
  }
  identifier(raw.commandId, "persisted bootstrap command ID");
  if (kind === "prepared")
    canonicalTime(raw.maxRecordTime, "persisted bootstrap maxRecordTime");
  return {
    input: {
      agentParty: snapshot.agentParty,
      allowedRecipient: snapshot.recipient,
      allowedResourceHash: snapshot.resourceHash,
      expiresAt: snapshot.expiresAt,
      instrument: snapshot.instrument,
      maximumTotalDebitAtomic: snapshot.maximumTotalDebitAtomic,
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
    kind,
    raw,
  };
}
