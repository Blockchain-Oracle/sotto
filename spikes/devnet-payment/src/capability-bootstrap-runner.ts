import {
  assertBoundedCapabilityBootstrapFresh,
  parseBoundedCapabilityBootstrapCompletionResponse,
  reconcileBoundedCapabilityBootstrapAcs,
  restoreBoundedCapabilityBootstrapIntent,
  type BoundedCapabilityBootstrapRequest,
} from "@sotto/x402-canton";
import type { CapabilityBootstrapCompletion } from "./capability-bootstrap-completion.js";
import {
  AmbiguousTransactionSubmissionError,
  type AmbiguousTransactionSubmissionReason,
} from "./five-north-transaction-submit.js";

type BootstrapRunnerInput = Readonly<{
  persistCompletionCursor: (beginExclusive: number) => Promise<void>;
  persistIntent: (request: BoundedCapabilityBootstrapRequest) => Promise<void>;
  persistSubmissionStarted: () => Promise<void>;
  readActiveCapabilities: () => Promise<unknown>;
  readCompletion: (
    beginExclusive: number,
    request: BoundedCapabilityBootstrapRequest,
  ) => Promise<CapabilityBootstrapCompletion>;
  readLedgerEndOffset: () => Promise<number>;
  request: BoundedCapabilityBootstrapRequest;
  submit: (request: BoundedCapabilityBootstrapRequest) => Promise<unknown>;
}>;

export class DefinitiveCapabilityBootstrapRejectionError extends Error {
  constructor(
    readonly completionOffset: number,
    readonly statusCode: number,
  ) {
    super("capability bootstrap command was rejected");
  }
}

function optionalReconciliation(
  value: unknown,
  request: BoundedCapabilityBootstrapRequest,
): string | null {
  const result = reconcileBoundedCapabilityBootstrapAcs(value, request);
  if (result.activeCount > 1 || result.matchingContractIds.length > 1) {
    throw new Error("capability bootstrap produced duplicate active contracts");
  }
  if (result.activeCount === 0) return null;
  if (result.matchingContractIds.length !== 1) {
    throw new Error("active capability does not match the bootstrap request");
  }
  return result.matchingContractIds[0]!;
}

function resolveDualEvidence(input: {
  active: unknown;
  completion: CapabilityBootstrapCompletion;
  request: BoundedCapabilityBootstrapRequest;
  submitted?: ReturnType<
    typeof parseBoundedCapabilityBootstrapCompletionResponse
  >;
  submissionAmbiguity?: AmbiguousTransactionSubmissionReason;
  submissionStatusCode?: number;
}) {
  const contractId = optionalReconciliation(input.active, input.request);
  if (input.completion.classification !== "SUCCEEDED") {
    if (input.submitted !== undefined || contractId !== null) {
      throw new Error("capability completion evidence is inconsistent");
    }
    if (input.completion.classification === "REJECTED") {
      throw new DefinitiveCapabilityBootstrapRejectionError(
        input.completion.completionOffset,
        input.completion.statusCode,
      );
    }
    const details = [
      ...(input.submissionAmbiguity === undefined ||
      input.submissionAmbiguity === "UNKNOWN"
        ? []
        : [input.submissionAmbiguity]),
      ...(input.submissionStatusCode === undefined
        ? []
        : [`HTTP ${input.submissionStatusCode}`]),
    ];
    throw new Error(
      `capability bootstrap outcome is unresolved${details.length === 0 ? "" : ` (${details.join(", ")})`}`,
    );
  }
  if (contractId === null) {
    throw new Error("successful completion has no exact active capability");
  }
  if (
    input.submitted !== undefined &&
    (input.submitted.offset !== input.completion.completionOffset ||
      input.submitted.updateId !== input.completion.updateId)
  ) {
    throw new Error("completion and submission response are inconsistent");
  }
  return Object.freeze({
    contractId,
    offset: input.completion.completionOffset,
    updateId: input.completion.updateId,
  });
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
    | ReturnType<typeof parseBoundedCapabilityBootstrapCompletionResponse>
    | undefined;
  let response: unknown;
  let submissionAmbiguity: AmbiguousTransactionSubmissionReason | undefined;
  let submissionStatusCode: number | undefined;
  try {
    response = await input.submit(input.request);
  } catch (error) {
    if (!(error instanceof AmbiguousTransactionSubmissionError)) throw error;
    submissionAmbiguity = error.reason;
    submissionStatusCode = error.statusCode;
  }
  if (response !== undefined) {
    try {
      submitted = parseBoundedCapabilityBootstrapCompletionResponse(
        response,
        input.request,
      );
    } catch {
      submissionAmbiguity = "SUCCESS_RESPONSE_INVALID";
    }
  }
  const completion = await input.readCompletion(beginExclusive, input.request);
  const resolved = resolveDualEvidence({
    active: await input.readActiveCapabilities(),
    completion,
    request: input.request,
    ...(submitted === undefined ? {} : { submitted }),
    ...(submissionAmbiguity === undefined ? {} : { submissionAmbiguity }),
    ...(submissionStatusCode === undefined ? {} : { submissionStatusCode }),
  });
  return Object.freeze({
    commandId: input.request.commandId,
    contractId: resolved.contractId,
    offset: resolved.offset,
    outcome:
      submitted === undefined
        ? ("reconciled-after-ambiguous" as const)
        : ("submitted" as const),
    updateId: resolved.updateId,
  });
}

export async function recoverBoundedCapabilityBootstrap(
  input: Readonly<{
    beginExclusive: number;
    intent: unknown;
    readActiveCapabilities: () => Promise<unknown>;
    readCompletion: (
      beginExclusive: number,
      request: BoundedCapabilityBootstrapRequest,
    ) => Promise<CapabilityBootstrapCompletion>;
  }>,
) {
  const request = restoreBoundedCapabilityBootstrapIntent(input.intent);
  const completion = await input.readCompletion(input.beginExclusive, request);
  const resolved = resolveDualEvidence({
    active: await input.readActiveCapabilities(),
    completion,
    request,
  });
  return Object.freeze({
    commandId: request.commandId,
    contractId: resolved.contractId,
    offset: resolved.offset,
    outcome: "recovered" as const,
    updateId: resolved.updateId,
  });
}
