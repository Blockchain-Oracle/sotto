import {
  prepareOwnerOnlyBootstrapJournalDirectory,
  readCapabilityBootstrapJournalJson,
  writeExclusiveCapabilityBootstrapJson,
} from "./capability-bootstrap-journal-storage.js";
import {
  humanApprovalPayload,
  humanExecutionPayload,
  humanSignaturePayload,
  restoreHumanIntentPayload,
  untrustedHumanIntentPayload,
} from "./human-purchase-journal-payloads.js";
import {
  humanCompletionPayload,
  humanDeliveryPayload,
  humanSettlementPayload,
} from "./human-purchase-journal-terminal-payloads.js";
import {
  humanPurchaseJournalDirectoryName,
  humanPurchaseOperationId,
  isMissingHumanJournalRecord,
} from "./human-purchase-journal-primitives.js";
import {
  createHumanPurchaseJournalRecord,
  parseHumanPurchaseJournalRecord,
} from "./human-purchase-journal-record.js";
import {
  HUMAN_PURCHASE_JOURNAL_STAGES,
  type HumanPurchaseApprovalPayload,
  type HumanPurchaseCompletionPayload,
  type HumanPurchaseDeliveryPayload,
  type HumanPurchaseExecutionPayload,
  type HumanPurchaseJournalRecord,
  type HumanPurchaseJournalPayload,
  type HumanPurchaseJournalStage,
  type HumanPurchaseJournalState,
  type HumanPurchaseOperationId,
  type HumanPurchaseSettlementPayload,
  type HumanPurchaseSignaturePayload,
} from "./human-purchase-journal-types.js";

export function humanPurchaseJournalDirectory(
  workspaceRoot: string,
  operationId: HumanPurchaseOperationId,
): Promise<string> {
  return prepareOwnerOnlyBootstrapJournalDirectory(
    workspaceRoot,
    humanPurchaseJournalDirectoryName(operationId),
  );
}

async function optionalRecord(directory: string, name: string) {
  try {
    return await readCapabilityBootstrapJournalJson(directory, name);
  } catch (error) {
    if (isMissingHumanJournalRecord(error)) return null;
    throw error;
  }
}

export async function loadHumanPurchaseJournalState(input: {
  operationId: HumanPurchaseOperationId;
  workspaceRoot: string;
}): Promise<HumanPurchaseJournalState> {
  const directory = await humanPurchaseJournalDirectory(
    input.workspaceRoot,
    input.operationId,
  );
  let current = parseHumanPurchaseJournalRecord(
    await readCapabilityBootstrapJournalJson(directory, "00-intent.json"),
    {
      kind: "intent",
      operationId: input.operationId,
      previousRecordSha256: null,
    },
    untrustedHumanIntentPayload,
  );
  const restored = restoreHumanIntentPayload(
    current.payload as ReturnType<typeof untrustedHumanIntentPayload>,
  );
  if (
    humanPurchaseOperationId(restored.expectation.purchaseCommitment) !==
    input.operationId
  ) {
    throw new Error("human purchase journal operation does not match intent");
  }
  let approvalRequested: HumanPurchaseApprovalPayload | null = null;
  let signatureVerified: HumanPurchaseSignaturePayload | null = null;
  let executionStarted: HumanPurchaseExecutionPayload | null = null;
  let completion: HumanPurchaseCompletionPayload | null = null;
  let settlementReconciled: HumanPurchaseSettlementPayload | null = null;
  let delivery: HumanPurchaseDeliveryPayload | null = null;
  let stage: HumanPurchaseJournalStage = "intent";
  let missing = false;
  const parsers = [
    (value: unknown) => humanApprovalPayload(value),
    (value: unknown) =>
      humanSignaturePayload(value, approvalRequested!.sessionId),
    (value: unknown) =>
      humanExecutionPayload(value, signatureVerified!.sessionId),
    (value: unknown) => humanCompletionPayload(value, restored.beginExclusive),
    (value: unknown) =>
      humanSettlementPayload(
        value,
        restored.expectation,
        completion?.classification === "SUCCEEDED"
          ? completion.updateId
          : "rejected completion has no update",
      ),
    (value: unknown) => humanDeliveryPayload(value),
  ] as const;
  const setters: ReadonlyArray<(value: HumanPurchaseJournalPayload) => void> = [
    (value) => (approvalRequested = value as HumanPurchaseApprovalPayload),
    (value) => (signatureVerified = value as HumanPurchaseSignaturePayload),
    (value) => (executionStarted = value as HumanPurchaseExecutionPayload),
    (value) => (completion = value as HumanPurchaseCompletionPayload),
    (value) => (settlementReconciled = value as HumanPurchaseSettlementPayload),
    (value) => (delivery = value as HumanPurchaseDeliveryPayload),
  ];
  for (
    let index = 1;
    index < HUMAN_PURCHASE_JOURNAL_STAGES.length;
    index += 1
  ) {
    const [name, kind] = HUMAN_PURCHASE_JOURNAL_STAGES[index]!;
    const value = await optionalRecord(directory, name);
    if (value === null) {
      missing = true;
      continue;
    }
    if (missing) throw new Error("human purchase journal stage gap detected");
    const next = parseHumanPurchaseJournalRecord(
      value,
      {
        kind,
        operationId: input.operationId,
        previousRecordSha256: current.recordSha256,
      },
      parsers[index - 1]!,
    );
    if (Date.parse(next.recordedAt) < Date.parse(current.recordedAt)) {
      throw new Error("human purchase journal time moved backwards");
    }
    current = next;
    stage = kind;
    setters[index - 1]!(next.payload);
  }
  return Object.freeze({
    approvalRequested,
    beginExclusive: restored.beginExclusive,
    completion,
    delivery,
    directoryName: humanPurchaseJournalDirectoryName(input.operationId),
    executionStarted,
    expectation: restored.expectation,
    latestRecordSha256: current.recordSha256,
    latestRecordedAt: current.recordedAt,
    operationId: input.operationId,
    settlementReconciled,
    signatureVerified,
    sourceCommit: restored.sourceCommit,
    stage,
  }) as HumanPurchaseJournalState;
}

export async function appendHumanPurchaseJournalStage(input: {
  createPayload: (
    state: HumanPurchaseJournalState,
  ) => HumanPurchaseJournalRecord["payload"];
  expectedStage: HumanPurchaseJournalStage;
  kind: HumanPurchaseJournalStage;
  operationId: HumanPurchaseOperationId;
  workspaceRoot: string;
}): Promise<void> {
  const state = await loadHumanPurchaseJournalState(input);
  if (state.stage !== input.expectedStage) {
    throw new Error(
      `human purchase journal ${input.kind} stage is out of order`,
    );
  }
  const record = createHumanPurchaseJournalRecord({
    kind: input.kind,
    operationId: input.operationId,
    payload: input.createPayload(state),
    previousRecordSha256: state.latestRecordSha256,
  });
  if (Date.parse(record.recordedAt) < Date.parse(state.latestRecordedAt)) {
    throw new Error("human purchase journal time moved backwards");
  }
  const name = HUMAN_PURCHASE_JOURNAL_STAGES.find(
    ([, kind]) => kind === input.kind,
  )![0];
  const directory = await humanPurchaseJournalDirectory(
    input.workspaceRoot,
    input.operationId,
  );
  await writeExclusiveCapabilityBootstrapJson(directory, name, record);
}
