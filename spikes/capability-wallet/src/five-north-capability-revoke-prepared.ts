import {
  PreparedTransaction,
  type Value,
} from "@canton-network/core-ledger-proto";
import {
  APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID,
  preparedSynchronizerMatches,
} from "@sotto/x402-canton";

const IDENTIFIER = /^[\x21-\x7e]{1,512}$/u;
const MAX_PREPARED_BYTES = 2 * 1024 * 1024;
const MAX_EVENT_BLOB_BYTES = 262_144;
const CAPABILITY_FIELDS = [
  "payer",
  "agent",
  "resourceBindingVersion",
  "allowedResourceHash",
  "allowedRecipient",
  "instrumentId",
  "perCallLimit",
  "remainingAllowance",
  "maximumTotalDebit",
  "expiresAt",
  "revision",
  "paused",
  "transferFactoryCid",
  "expectedAdmin",
];

export type FiveNorthCapabilityRevokeInput = Readonly<{
  agentParty: string;
  capabilityContractId: string;
  payerParty: string;
  preparedTransaction: Uint8Array;
  synchronizerId: string;
}>;

function exactInput(input: FiveNorthCapabilityRevokeInput): void {
  if (
    typeof input !== "object" ||
    input === null ||
    Object.keys(input).sort().join() !==
      "agentParty,capabilityContractId,payerParty,preparedTransaction,synchronizerId" ||
    !IDENTIFIER.test(input.agentParty) ||
    !IDENTIFIER.test(input.capabilityContractId) ||
    !IDENTIFIER.test(input.payerParty) ||
    input.agentParty === input.payerParty ||
    !IDENTIFIER.test(input.synchronizerId) ||
    !(input.preparedTransaction instanceof Uint8Array) ||
    input.preparedTransaction.byteLength === 0 ||
    input.preparedTransaction.byteLength > MAX_PREPARED_BYTES
  ) {
    throw new Error("capability revoke approval input is invalid");
  }
}

function templateMatches(value: unknown, entityName: string): boolean {
  if (typeof value !== "object" || value === null) return false;
  const [packageId, moduleName] =
    APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID.split(":");
  const candidate = value as Record<string, unknown>;
  return (
    candidate.packageId === packageId &&
    candidate.moduleName === moduleName &&
    candidate.entityName === entityName
  );
}

function record(value: Value | undefined, entityName: string) {
  if (
    value?.sum.oneofKind !== "record" ||
    !templateMatches(value.sum.record.recordId, entityName)
  ) {
    throw new Error("capability revoke Daml record does not match");
  }
  return value.sum.record;
}

function partyField(value: Value | undefined, label: string): string {
  const capability = record(value, "BoundedPurchaseCapability");
  if (
    capability.fields.map((field) => field.label).join() !==
    CAPABILITY_FIELDS.join()
  ) {
    throw new Error("capability revoke input fields do not match");
  }
  const found = capability.fields.find((field) => field.label === label)?.value;
  if (found?.sum.oneofKind !== "party") {
    throw new Error("capability revoke input Party does not match");
  }
  return found.sum.party;
}

function exactParties(value: readonly string[], expected: readonly string[]) {
  return JSON.stringify(value) === JSON.stringify(expected);
}

export function verifyFiveNorthCapabilityRevokePrepared(
  input: FiveNorthCapabilityRevokeInput,
) {
  exactInput(input);
  let prepared;
  try {
    prepared = PreparedTransaction.fromBinary(input.preparedTransaction, {
      readUnknownField: "throw",
    });
  } catch (cause) {
    throw new Error("capability revoke prepared transaction is invalid", {
      cause,
    });
  }
  const canonical = PreparedTransaction.toBinary(prepared, {
    writeUnknownFields: false,
  });
  const transaction = prepared.transaction;
  const metadata = prepared.metadata;
  if (
    !Buffer.from(canonical).equals(Buffer.from(input.preparedTransaction)) ||
    transaction?.version !== "2.1" ||
    transaction.roots.join() !== "0" ||
    transaction.nodes.length !== 1 ||
    transaction.nodeSeeds.length !== 1 ||
    transaction.nodeSeeds[0]?.nodeId !== 0 ||
    transaction.nodeSeeds[0].seed.byteLength !== 32 ||
    metadata === undefined ||
    !preparedSynchronizerMatches(
      metadata.synchronizerId,
      input.synchronizerId,
    ) ||
    !exactParties(metadata.submitterInfo?.actAs ?? [], [input.payerParty]) ||
    metadata.globalKeyMapping.length !== 0 ||
    metadata.inputContracts.length !== 1
  ) {
    throw new Error("capability revoke prepared envelope does not match");
  }
  const wrapper = transaction.nodes[0]?.versionedNode;
  const node = wrapper?.oneofKind === "v1" ? wrapper.v1.nodeType : undefined;
  if (node?.oneofKind !== "exercise") {
    throw new Error("capability revoke root is not an exercise");
  }
  const exercise = node.exercise;
  const chosen = record(exercise.chosenValue, "Revoke");
  if (
    exercise.lfVersion !== "2.1" ||
    exercise.contractId !== input.capabilityContractId ||
    exercise.packageName !== "sotto-control" ||
    !templateMatches(exercise.templateId, "BoundedPurchaseCapability") ||
    exercise.interfaceId !== undefined ||
    !exactParties(exercise.signatories, [input.payerParty]) ||
    !exactParties(exercise.stakeholders, [
      input.payerParty,
      input.agentParty,
    ]) ||
    !exactParties(exercise.actingParties, [input.payerParty]) ||
    exercise.choiceId !== "Revoke" ||
    chosen.fields.length !== 0 ||
    !exercise.consuming ||
    exercise.children.length !== 0 ||
    exercise.choiceObservers.length !== 0 ||
    exercise.exerciseResult?.sum.oneofKind !== "unit"
  ) {
    throw new Error("capability revoke root effect does not match");
  }
  const inputContract = metadata.inputContracts[0]!;
  const contract = inputContract.contract;
  if (
    contract.oneofKind !== "v1" ||
    contract.v1.lfVersion !== "2.1" ||
    contract.v1.contractId !== input.capabilityContractId ||
    contract.v1.packageName !== "sotto-control" ||
    !templateMatches(contract.v1.templateId, "BoundedPurchaseCapability") ||
    !exactParties(contract.v1.signatories, [input.payerParty]) ||
    !exactParties(contract.v1.stakeholders, [
      input.payerParty,
      input.agentParty,
    ]) ||
    inputContract.eventBlob.byteLength === 0 ||
    inputContract.eventBlob.byteLength > MAX_EVENT_BLOB_BYTES ||
    partyField(contract.v1.argument, "payer") !== input.payerParty ||
    partyField(contract.v1.argument, "agent") !== input.agentParty
  ) {
    throw new Error("capability revoke input contract does not match");
  }
  return Object.freeze({
    capabilityContractId: input.capabilityContractId,
    payerParty: input.payerParty,
    synchronizerId: input.synchronizerId,
    version: "sotto-five-north-capability-revoke-v1" as const,
  });
}
