import {
  APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID,
  parsePurchaseCapabilityCreatedEvent,
  SOTTO_CONTROL_PACKAGE_ID,
} from "./purchase-capability-event.js";
import {
  boundedCapabilityBootstrapState,
  matchesExpectedBootstrapCapability,
  registerBoundedCapabilityBootstrap,
  type ExpectedBootstrapCapability,
  validateBoundedCapabilityBootstrapNetwork,
} from "./bounded-capability-bootstrap-state.js";
import {
  atomic,
  atomicToDamlDecimal,
  canonicalTime,
  identifier,
  objectValue,
  SHA256_PATTERN,
  sha256Hex,
} from "./purchase-commitment-primitives.js";

const MINIMUM_LIFETIME_MS = 5 * 60 * 1_000;
const MAXIMUM_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const MAXIMUM_AUTHORITY_AGE_MS = 60_000;
const CLOCK_ROLLBACK_TOLERANCE_MS = 5_000;
const MAXIMUM_ALLOWANCE_ATOMIC = 10_000_000_000n;
const UPDATE_ID_PATTERN = /^1220[0-9a-f]{64}$/;
const MAXIMUM_ACS_ENTRIES = 256;
export type BoundedCapabilityBootstrapInput = Readonly<{
  agentParty: string;
  allowedRecipient: string;
  allowedResourceHash: `sha256:${string}`;
  expiresAt: string;
  instrument: Readonly<{ admin: string; id: string }>;
  maximumTotalDebitAtomic: string;
  network: `canton:${string}`;
  payerParty: string;
  perCallLimitAtomic: string;
  remainingAllowanceAtomic: string;
  synchronizerId: string;
  transferFactoryContractId: string;
  userId: string;
}>;
function sottoParty(value: unknown, label: string): string {
  const party = identifier(value, `${label} Party`);
  if (!party.startsWith("sotto-") || !party.includes("::")) {
    throw new Error(`${label} Party must be a bounded sotto- Party`);
  }
  return party;
}
function boundedAmount(value: unknown, label: string): bigint {
  const amount = atomic(value, label);
  if (amount > MAXIMUM_ALLOWANCE_ATOMIC) {
    throw new Error("allowance exceeds the bootstrap cap");
  }
  return amount;
}

export function buildBoundedCapabilityBootstrapAt(
  input: BoundedCapabilityBootstrapInput,
  nowMilliseconds: number,
) {
  if (!Number.isSafeInteger(nowMilliseconds) || nowMilliseconds < 0) {
    throw new Error("bootstrap clock is invalid");
  }
  const payer = sottoParty(input.payerParty, "payer");
  const agent = sottoParty(input.agentParty, "agent");
  if (payer === agent) throw new Error("payer and agent must be distinct");
  const recipient = sottoParty(input.allowedRecipient, "recipient");
  const admin = identifier(input.instrument.admin, "instrument admin");
  if (input.instrument.id !== "Amulet") {
    throw new Error("instrument must be Amulet");
  }
  if (!SHA256_PATTERN.test(input.allowedResourceHash)) {
    throw new Error("allowed resource hash must be SHA-256");
  }
  const perCall = boundedAmount(input.perCallLimitAtomic, "per-call limit");
  const remaining = boundedAmount(
    input.remainingAllowanceAtomic,
    "remaining allowance",
  );
  const maximumDebit = boundedAmount(
    input.maximumTotalDebitAtomic,
    "maximum total debit",
  );
  if (perCall <= 0n || remaining < perCall || maximumDebit < perCall) {
    throw new Error("bootstrap limits are inconsistent");
  }
  if (maximumDebit > remaining) {
    throw new Error("maximum total debit exceeds remaining allowance");
  }
  const expiresAt = canonicalTime(input.expiresAt, "capability expiresAt");
  if (expiresAt - nowMilliseconds < MINIMUM_LIFETIME_MS) {
    throw new Error("expiry must leave at least five minutes");
  }
  if (expiresAt - nowMilliseconds > MAXIMUM_LIFETIME_MS) {
    throw new Error("expiry exceeds the bootstrap lifetime");
  }
  const transferFactoryCid = identifier(
    input.transferFactoryContractId,
    "transfer factory contract ID",
  );
  const network = validateBoundedCapabilityBootstrapNetwork(input.network);
  const synchronizerId = identifier(
    input.synchronizerId,
    "bootstrap synchronizer ID",
  );
  const userId = identifier(input.userId, "bootstrap user ID", 256);
  const createArguments = Object.freeze({
    payer,
    agent,
    resourceBindingVersion: "sotto-resource-v1" as const,
    allowedResourceHash: input.allowedResourceHash,
    allowedRecipient: recipient,
    instrumentId: Object.freeze({ admin, id: "Amulet" as const }),
    perCallLimit: atomicToDamlDecimal(perCall.toString(), "per-call limit"),
    remainingAllowance: atomicToDamlDecimal(
      remaining.toString(),
      "remaining allowance",
    ),
    maximumTotalDebit: atomicToDamlDecimal(
      maximumDebit.toString(),
      "maximum total debit",
    ),
    expiresAt: input.expiresAt,
    revision: "0" as const,
    paused: false as const,
    transferFactoryCid,
    expectedAdmin: admin,
  });
  const commandId = `sotto-capability-bootstrap-v1-${sha256Hex(
    JSON.stringify({
      templateId: APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID,
      packageId: SOTTO_CONTROL_PACKAGE_ID,
      network,
      synchronizerId,
      createArguments,
    }),
  )}`;
  const request = Object.freeze({
    actAs: Object.freeze([payer]) as readonly [string],
    readAs: Object.freeze([]) as readonly [],
    userId,
    commandId,
    workflowId: "sotto-capability-bootstrap-v1" as const,
    synchronizerId,
    packageIdSelectionPreference: Object.freeze([
      SOTTO_CONTROL_PACKAGE_ID,
    ]) as readonly [string],
    commands: Object.freeze([
      Object.freeze({
        CreateCommand: Object.freeze({
          templateId: APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID,
          createArguments,
        }),
      }),
    ]),
  });
  registerBoundedCapabilityBootstrap(request, {
    commandId,
    expected: {
      agentParty: agent,
      expectedAdmin: admin,
      expiresAt: input.expiresAt,
      instrument: { admin, id: "Amulet" },
      maximumTotalDebitAtomic: maximumDebit.toString(),
      paused: false,
      payerParty: payer,
      perCallLimitAtomic: perCall.toString(),
      recipient,
      remainingAllowanceAtomic: remaining.toString(),
      resourceBindingVersion: "sotto-resource-v1",
      resourceHash: input.allowedResourceHash,
      revision: "0",
      templateId: APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID,
      transferFactoryContractId: transferFactoryCid,
    },
    network,
    packageId: SOTTO_CONTROL_PACKAGE_ID,
    synchronizerId,
    validatedAt: new Date(nowMilliseconds).toISOString(),
  });
  return request;
}

export function buildBoundedCapabilityBootstrap(
  input: BoundedCapabilityBootstrapInput,
) {
  return buildBoundedCapabilityBootstrapAt(input, Date.now());
}

export type BoundedCapabilityBootstrapRequest = ReturnType<
  typeof buildBoundedCapabilityBootstrap
>;

export function assertBoundedCapabilityBootstrapFresh(request: unknown): void {
  const state = boundedCapabilityBootstrapState(request);
  const nowMilliseconds = Date.now();
  if (!Number.isSafeInteger(nowMilliseconds) || nowMilliseconds < 0) {
    throw new Error("bootstrap clock is invalid");
  }
  const validatedAt = canonicalTime(state.validatedAt, "bootstrap validatedAt");
  if (nowMilliseconds < validatedAt - CLOCK_ROLLBACK_TOLERANCE_MS) {
    throw new Error("bootstrap clock moved backwards");
  }
  const expiresAt = canonicalTime(
    state.expected.expiresAt,
    "capability expiresAt",
  );
  if (expiresAt - nowMilliseconds < MINIMUM_LIFETIME_MS) {
    throw new Error("expiry must leave at least five minutes");
  }
  if (nowMilliseconds - validatedAt > MAXIMUM_AUTHORITY_AGE_MS) {
    throw new Error("bootstrap authority is stale");
  }
}

function reconcileAgainstExpected(
  value: unknown,
  expected: ExpectedBootstrapCapability,
  synchronizerId: string,
) {
  if (!Array.isArray(value) || value.length > MAXIMUM_ACS_ENTRIES) {
    throw new Error("bootstrap ACS result exceeds count limit");
  }
  const matchingContractIds: string[] = [];
  for (const entryValue of value) {
    const entry = objectValue(entryValue, "bootstrap ACS entry");
    const contractEntry = objectValue(
      entry.contractEntry,
      "bootstrap ACS contract entry",
    );
    const active = objectValue(
      contractEntry.JsActiveContract,
      "bootstrap ACS active contract",
    );
    const snapshot = parsePurchaseCapabilityCreatedEvent(active.createdEvent);
    if (
      active.synchronizerId === synchronizerId &&
      matchesExpectedBootstrapCapability(snapshot, expected)
    ) {
      matchingContractIds.push(snapshot.contractId);
    }
  }
  return Object.freeze({
    activeCount: value.length,
    matchingContractIds: Object.freeze(matchingContractIds),
  });
}

export function reconcileBoundedCapabilityBootstrapAcs(
  value: unknown,
  request: unknown,
) {
  const state = boundedCapabilityBootstrapState(request);
  return reconcileAgainstExpected(value, state.expected, state.synchronizerId);
}

export function parseBoundedCapabilityBootstrapResponse(
  value: unknown,
  request: unknown,
) {
  const state = boundedCapabilityBootstrapState(request);
  const transaction = objectValue(
    objectValue(value, "bootstrap response").transaction,
    "bootstrap transaction",
  );
  const events = transaction.events;
  if (!Array.isArray(events) || events.length !== 1) {
    throw new Error("bootstrap transaction must contain exactly one event");
  }
  const wrapper = objectValue(events[0], "bootstrap event");
  const snapshot = parsePurchaseCapabilityCreatedEvent(wrapper.CreatedEvent);
  if (!matchesExpectedBootstrapCapability(snapshot, state.expected)) {
    throw new Error("created capability does not match the bootstrap request");
  }
  const responseCommandId = transaction.commandId ?? transaction.command_id;
  if (responseCommandId !== state.commandId) {
    throw new Error("bootstrap transaction command ID does not match");
  }
  if (transaction.synchronizerId !== state.synchronizerId) {
    throw new Error("bootstrap transaction synchronizer does not match");
  }
  const offset = transaction.offset;
  if (!Number.isSafeInteger(offset) || (offset as number) < 0) {
    throw new Error("bootstrap transaction offset is invalid");
  }
  const updateId = identifier(transaction.updateId, "bootstrap update ID");
  if (!UPDATE_ID_PATTERN.test(updateId)) {
    throw new Error("bootstrap update ID is invalid");
  }
  return Object.freeze({
    commandId: state.commandId,
    contractId: snapshot.contractId,
    offset: offset as number,
    updateId,
  });
}
