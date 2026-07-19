import { createHash } from "node:crypto";

export const TRANSFER_PREAPPROVAL_PROPOSAL_QUERY_ID =
  "#splice-wallet:Splice.Wallet.TransferPreapproval:TransferPreapprovalProposal" as const;
const PROPOSAL_ENTITY =
  "Splice.Wallet.TransferPreapproval:TransferPreapprovalProposal";
const PARTY_PATTERN = /^[^\s:]+::1220[0-9a-f]{64}$/u;
const PACKAGE_PATTERN = /^[0-9a-f]{64}$/u;
const UPDATE_PATTERN = /^1220[0-9a-f]{64}$/u;
const MAX_ACS_ENTRIES = 16;

export type FiveNorthPreapprovalProposalInput = Readonly<{
  expectedDso: string;
  packageId: string;
  receiverParty: string;
  synchronizerId: string;
  userId: string;
  validatorParty: string;
}>;

type ProposalState = Readonly<{
  commandId: string;
  createArguments: Readonly<{
    expectedDso: string;
    provider: string;
    receiver: string;
  }>;
  packageId: string;
  templateId: string;
  input: FiveNorthPreapprovalProposalInput;
}>;

const states = new WeakMap<object, ProposalState>();

function identifier(value: unknown, label: string, maximum = 512): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.trim() !== value ||
    new TextEncoder().encode(value).byteLength > maximum
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function party(value: unknown, label: string): string {
  const result = identifier(value, label);
  if (!PARTY_PATTERN.test(result)) throw new Error(`${label} is invalid`);
  return result;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function arrayEquals(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) && JSON.stringify(value) === JSON.stringify(expected)
  );
}

function stateFor(request: unknown): ProposalState {
  if (typeof request !== "object" || request === null) {
    throw new Error("preapproval proposal request is not authenticated");
  }
  const state = states.get(request);
  if (state === undefined) {
    throw new Error("preapproval proposal request is not authenticated");
  }
  return state;
}

export function readFiveNorthPreapprovalProposalBinding(request: unknown) {
  const state = stateFor(request);
  return Object.freeze({
    commandId: state.commandId,
    dso: state.createArguments.expectedDso,
    provider: state.createArguments.provider,
    receiver: state.createArguments.receiver,
    synchronizerId: party(
      objectValue(request, "preapproval proposal request").synchronizerId,
      "proposal synchronizer ID",
    ),
  });
}

export function readFiveNorthPreapprovalProposalInput(request: unknown) {
  return stateFor(request).input;
}

function proposalSnapshot(value: unknown, synchronizerId: unknown) {
  const event = objectValue(value, "preapproval proposal event");
  const createArgument = objectValue(
    event.createArgument,
    "preapproval proposal create argument",
  );
  const expectedDso = party(createArgument.expectedDso, "proposal DSO Party");
  const provider = party(createArgument.provider, "proposal provider Party");
  const receiver = party(createArgument.receiver, "proposal receiver Party");
  return Object.freeze({
    contractId: identifier(event.contractId, "proposal contract ID"),
    createArguments: Object.freeze({ expectedDso, provider, receiver }),
    observers: event.observers,
    packageName: event.packageName,
    representativePackageId: identifier(
      event.representativePackageId,
      "proposal representative package ID",
      64,
    ),
    signatories: event.signatories,
    synchronizerId: party(
      synchronizerId,
      "preapproval proposal synchronizer ID",
    ),
    templateId: identifier(event.templateId, "proposal template ID"),
  });
}

function matches(
  snapshot: ReturnType<typeof proposalSnapshot>,
  state: ProposalState,
) {
  const packageNameTemplate =
    typeof snapshot.templateId === "string" &&
    /^#[^:\s]+:Splice\.Wallet\.TransferPreapproval:TransferPreapprovalProposal$/u.test(
      snapshot.templateId,
    );
  return (
    (snapshot.templateId === state.templateId || packageNameTemplate) &&
    snapshot.packageName === "splice-wallet" &&
    snapshot.representativePackageId === state.packageId &&
    snapshot.createArguments.receiver === state.createArguments.receiver &&
    snapshot.createArguments.provider === state.createArguments.provider &&
    snapshot.createArguments.expectedDso ===
      state.createArguments.expectedDso &&
    snapshot.synchronizerId === state.input.synchronizerId &&
    arrayEquals(snapshot.signatories, [state.createArguments.receiver]) &&
    arrayEquals(snapshot.observers, [state.createArguments.provider])
  );
}

export function buildFiveNorthPreapprovalProposal(
  input: FiveNorthPreapprovalProposalInput,
) {
  const receiver = party(input.receiverParty, "proposal receiver Party");
  if (!receiver.startsWith("sotto-")) {
    throw new Error("proposal receiver Party must be bounded sotto-");
  }
  const provider = party(input.validatorParty, "proposal validator Party");
  const expectedDso = party(input.expectedDso, "proposal DSO Party");
  if (receiver === provider) {
    throw new Error("proposal receiver and provider must be distinct");
  }
  const packageId = identifier(input.packageId, "splice-wallet package ID", 64);
  if (!PACKAGE_PATTERN.test(packageId)) {
    throw new Error("splice-wallet package ID is invalid");
  }
  const synchronizerId = party(
    input.synchronizerId,
    "proposal synchronizer ID",
  );
  const userId = identifier(input.userId, "proposal user ID", 256);
  const createArguments = Object.freeze({ receiver, provider, expectedDso });
  const commandId = `sotto-transfer-preapproval-proposal-v1-${createHash(
    "sha256",
  )
    .update(
      JSON.stringify({
        packageId,
        synchronizerId,
        templateId: TRANSFER_PREAPPROVAL_PROPOSAL_QUERY_ID,
        createArguments,
      }),
    )
    .digest("hex")}`;
  const request = Object.freeze({
    actAs: Object.freeze([receiver]) as readonly [string],
    readAs: Object.freeze([]) as readonly [],
    userId,
    commandId,
    workflowId: "sotto-transfer-preapproval-bootstrap-v1" as const,
    synchronizerId,
    packageIdSelectionPreference: Object.freeze([packageId]) as readonly [
      string,
    ],
    commands: Object.freeze([
      Object.freeze({
        CreateCommand: Object.freeze({
          templateId: TRANSFER_PREAPPROVAL_PROPOSAL_QUERY_ID,
          createArguments,
        }),
      }),
    ]),
  });
  states.set(request, {
    commandId,
    createArguments,
    input: Object.freeze({ ...input }),
    packageId,
    templateId: `${packageId}:${PROPOSAL_ENTITY}`,
  });
  return request;
}

export type FiveNorthPreapprovalProposalRequest = ReturnType<
  typeof buildFiveNorthPreapprovalProposal
>;

export function parseFiveNorthPreapprovalProposalResponse(
  value: unknown,
  request: unknown,
) {
  const state = stateFor(request);
  const transaction = objectValue(
    objectValue(value, "preapproval proposal response").transaction,
    "preapproval proposal transaction",
  );
  if (!Array.isArray(transaction.events) || transaction.events.length !== 1) {
    throw new Error("preapproval proposal transaction must have one event");
  }
  const wrapper = objectValue(
    transaction.events[0],
    "preapproval proposal wrapper",
  );
  const snapshot = proposalSnapshot(
    wrapper.CreatedEvent,
    transaction.synchronizerId,
  );
  if (!matches(snapshot, state)) {
    throw new Error("created preapproval proposal does not match request");
  }
  if (transaction.commandId !== state.commandId) {
    throw new Error("preapproval proposal command ID does not match");
  }
  if (
    !Number.isSafeInteger(transaction.offset) ||
    (transaction.offset as number) < 0
  ) {
    throw new Error("preapproval proposal offset is invalid");
  }
  const updateId = identifier(
    transaction.updateId,
    "preapproval proposal update ID",
  );
  if (!UPDATE_PATTERN.test(updateId)) {
    throw new Error("preapproval proposal update ID is invalid");
  }
  return Object.freeze({
    commandId: state.commandId,
    contractId: snapshot.contractId,
    offset: transaction.offset as number,
    updateId,
  });
}

export function reconcileFiveNorthPreapprovalProposalAcs(
  value: unknown,
  request: unknown,
) {
  const state = stateFor(request);
  if (!Array.isArray(value) || value.length > MAX_ACS_ENTRIES) {
    throw new Error("preapproval proposal ACS exceeds count limit");
  }
  const matchingContractIds = value
    .map((entry) => {
      const active = objectValue(
        objectValue(
          objectValue(entry, "proposal ACS entry").contractEntry,
          "proposal contract entry",
        ).JsActiveContract,
        "proposal active contract",
      );
      return proposalSnapshot(active.createdEvent, active.synchronizerId);
    })
    .filter((snapshot) => matches(snapshot, state))
    .map(({ contractId }) => contractId);
  return Object.freeze({
    activeCount: value.length,
    matchingContractIds: Object.freeze(matchingContractIds),
  });
}
