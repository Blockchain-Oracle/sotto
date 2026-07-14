import {
  assertBoundedCapabilityBootstrapFresh,
  parseBoundedCapabilityBootstrapResponse,
  reconcileBoundedCapabilityBootstrapAcs,
  restoreBoundedCapabilityBootstrapIntent,
  type BoundedCapabilityBootstrapRequest,
} from "@sotto/x402-canton";
import { AmbiguousTransactionSubmissionError } from "./five-north-transaction-submit.js";

type BootstrapRunnerInput = Readonly<{
  persistCompletionCursor: (beginExclusive: number) => Promise<void>;
  persistIntent: (request: BoundedCapabilityBootstrapRequest) => Promise<void>;
  persistSubmissionStarted: () => Promise<void>;
  readActiveCapabilities: () => Promise<unknown>;
  readLedgerEndOffset: () => Promise<number>;
  request: BoundedCapabilityBootstrapRequest;
  submit: (request: BoundedCapabilityBootstrapRequest) => Promise<unknown>;
}>;

function exactReconciliation(
  value: unknown,
  request: BoundedCapabilityBootstrapRequest,
): string {
  const result = reconcileBoundedCapabilityBootstrapAcs(value, request);
  if (result.activeCount > 1 || result.matchingContractIds.length > 1) {
    throw new Error("capability bootstrap produced duplicate active contracts");
  }
  if (result.activeCount === 0) {
    throw new Error("capability bootstrap outcome is unresolved");
  }
  if (result.matchingContractIds.length !== 1) {
    throw new Error("active capability does not match the bootstrap request");
  }
  return result.matchingContractIds[0]!;
}

export async function runBoundedCapabilityBootstrap(
  input: BootstrapRunnerInput,
) {
  await input.persistIntent(input.request);
  const before = reconcileBoundedCapabilityBootstrapAcs(
    await input.readActiveCapabilities(),
    input.request,
  );
  if (before.activeCount !== 0) {
    throw new Error("capability bootstrap preflight must be empty");
  }
  assertBoundedCapabilityBootstrapFresh(input.request);
  const beginExclusive = await input.readLedgerEndOffset();
  if (!Number.isSafeInteger(beginExclusive) || beginExclusive < 0) {
    throw new Error("capability bootstrap completion cursor is invalid");
  }
  await input.persistCompletionCursor(beginExclusive);
  assertBoundedCapabilityBootstrapFresh(input.request);
  await input.persistSubmissionStarted();
  assertBoundedCapabilityBootstrapFresh(input.request);
  let submitted:
    ReturnType<typeof parseBoundedCapabilityBootstrapResponse> | undefined;
  let response: unknown;
  try {
    response = await input.submit(input.request);
  } catch (error) {
    if (!(error instanceof AmbiguousTransactionSubmissionError)) throw error;
  }
  if (response !== undefined) {
    submitted = parseBoundedCapabilityBootstrapResponse(
      response,
      input.request,
    );
  }
  const contractId = exactReconciliation(
    await input.readActiveCapabilities(),
    input.request,
  );
  if (submitted !== undefined && submitted.contractId !== contractId) {
    throw new Error("submitted and reconciled capability IDs do not match");
  }
  return Object.freeze({
    commandId: input.request.commandId,
    contractId,
    offset: submitted?.offset ?? null,
    outcome:
      submitted === undefined
        ? ("reconciled-after-ambiguous" as const)
        : ("submitted" as const),
    updateId: submitted?.updateId ?? null,
  });
}

export async function recoverBoundedCapabilityBootstrap(
  input: Readonly<{
    intent: unknown;
    readActiveCapabilities: () => Promise<unknown>;
  }>,
) {
  const request = restoreBoundedCapabilityBootstrapIntent(input.intent);
  const contractId = exactReconciliation(
    await input.readActiveCapabilities(),
    request,
  );
  return Object.freeze({
    commandId: request.commandId,
    contractId,
    offset: null,
    outcome: "recovered" as const,
    updateId: null,
  });
}
