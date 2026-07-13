import {
  parseFiveNorthPreapprovalProposalResponse,
  readFiveNorthPreapprovalProposalBinding,
  reconcileFiveNorthPreapprovalProposalAcs,
  type FiveNorthPreapprovalProposalRequest,
} from "./five-north-preapproval-proposal.js";
import { reconcileFiveNorthTransferPreapprovalAcs } from "./five-north-transfer-preapproval.js";
import { AmbiguousTransactionSubmissionError } from "./five-north-transaction-submit.js";

type ReaderInput = Readonly<{
  readStateContracts: () => Promise<unknown>;
  request: FiveNorthPreapprovalProposalRequest;
}>;

type RunnerInput = ReaderInput &
  Readonly<{
    persistIntent: (
      request: FiveNorthPreapprovalProposalRequest,
    ) => Promise<void> | void;
    persistSubmissionStarted: () => Promise<void> | void;
    submit: (request: FiveNorthPreapprovalProposalRequest) => Promise<unknown>;
  }>;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactProposal(
  value: unknown,
  request: FiveNorthPreapprovalProposalRequest,
) {
  const reconciliation = reconcileFiveNorthPreapprovalProposalAcs(
    value,
    request,
  );
  if (
    reconciliation.activeCount !== reconciliation.matchingContractIds.length ||
    reconciliation.matchingContractIds.length > 1
  ) {
    throw new Error("preapproval proposal ACS is ambiguous");
  }
  return reconciliation.matchingContractIds[0] ?? null;
}

function partitionContracts(value: unknown) {
  if (!Array.isArray(value) || value.length > 32) {
    throw new Error("preapproval state ACS exceeds count limit");
  }
  const proposals: unknown[] = [];
  const preapprovals: unknown[] = [];
  for (const entry of value) {
    const active = objectValue(
      objectValue(
        objectValue(entry, "preapproval state entry").contractEntry,
        "preapproval state contract entry",
      ).JsActiveContract,
      "preapproval state active contract",
    );
    const event = objectValue(active.createdEvent, "preapproval state event");
    const templateId = event.templateId;
    if (
      event.packageName === "splice-wallet" &&
      typeof templateId === "string" &&
      templateId.endsWith(
        ":Splice.Wallet.TransferPreapproval:TransferPreapprovalProposal",
      )
    ) {
      proposals.push(entry);
    } else if (
      event.packageName === "splice-amulet" &&
      typeof templateId === "string" &&
      templateId.endsWith(":Splice.AmuletRules:TransferPreapproval")
    ) {
      preapprovals.push(entry);
    } else {
      throw new Error("preapproval state ACS contains an unexpected contract");
    }
  }
  return { preapprovals, proposals };
}

async function readState(input: ReaderInput) {
  const binding = readFiveNorthPreapprovalProposalBinding(input.request);
  const snapshot = objectValue(
    await input.readStateContracts(),
    "preapproval state snapshot",
  );
  if (
    JSON.stringify(Object.keys(snapshot).sort()) !==
      JSON.stringify(["activeAtOffset", "contracts"].sort()) ||
    !Number.isSafeInteger(snapshot.activeAtOffset) ||
    (snapshot.activeAtOffset as number) < 0
  ) {
    throw new Error("preapproval state snapshot is invalid");
  }
  const activeAtOffset = snapshot.activeAtOffset as number;
  const { preapprovals, proposals } = partitionContracts(snapshot.contracts);
  const preapproval = reconcileFiveNorthTransferPreapprovalAcs(
    preapprovals,
    binding,
  );
  const proposalContractId = exactProposal(proposals, input.request);
  if (
    preapproval.matches.length > 1 ||
    (preapproval.matches.length === 1 && proposalContractId !== null)
  ) {
    throw new Error("preapproval state contains duplicate authority");
  }
  if (preapproval.matches.length === 1) {
    return Object.freeze({
      activeAtOffset,
      kind: "ready" as const,
      preapproval: preapproval.matches[0]!,
    });
  }
  return proposalContractId === null
    ? Object.freeze({ activeAtOffset, kind: "absent" as const })
    : Object.freeze({
        activeAtOffset,
        kind: "pending" as const,
        proposalContractId,
      });
}

function stateResult(
  state: Awaited<ReturnType<typeof readState>>,
  source: "already" | "reconciled" | "recovered" | "submitted",
  proposalUpdateId?: string,
) {
  if (state.kind === "ready") {
    return Object.freeze({
      outcome: `${source}-ready` as const,
      activeAtOffset: state.activeAtOffset,
      preapprovalContractId: state.preapproval.contractId,
      proposalUpdateId,
      status: "ready" as const,
    });
  }
  if (state.kind === "pending") {
    return Object.freeze({
      outcome: `${source}-pending` as const,
      activeAtOffset: state.activeAtOffset,
      proposalContractId: state.proposalContractId,
      proposalUpdateId,
      status: "pending" as const,
    });
  }
  throw new Error("Five North preapproval outcome is unresolved");
}

export async function runFiveNorthPreapproval(input: RunnerInput) {
  await input.persistIntent(input.request);
  const before = await readState(input);
  if (before.kind !== "absent") return stateResult(before, "already");

  await input.persistSubmissionStarted();
  let response: unknown;
  let ambiguous = false;
  try {
    response = await input.submit(input.request);
  } catch (error) {
    if (!(error instanceof AmbiguousTransactionSubmissionError)) throw error;
    ambiguous = true;
  }
  const submitted =
    response === undefined
      ? undefined
      : parseFiveNorthPreapprovalProposalResponse(response, input.request);
  const after = await readState(input);
  if (after.activeAtOffset < before.activeAtOffset) {
    throw new Error("preapproval state offset moved backwards");
  }
  if (
    submitted !== undefined &&
    after.kind === "pending" &&
    after.proposalContractId !== submitted.contractId
  ) {
    throw new Error("submitted preapproval proposal does not match live state");
  }
  if (submitted !== undefined && after.activeAtOffset < submitted.offset) {
    throw new Error("preapproval state predates the submitted proposal");
  }
  return stateResult(
    after,
    ambiguous ? "reconciled" : "submitted",
    submitted?.updateId,
  );
}

export async function recoverFiveNorthPreapproval(input: ReaderInput) {
  return stateResult(await readState(input), "recovered");
}
