import {
  readAuthenticatedHumanPurchaseProviderSettlement,
  type AuthenticatedHumanPurchaseProviderSettlement,
} from "./human-purchase-provider-reconciliation.js";
import {
  humanCompletionPayload,
  humanDeliveryPayload,
  humanSettlementPayload,
} from "./human-purchase-journal-terminal-payloads.js";
import { humanJournalHash } from "./human-purchase-journal-primitives.js";
import { appendHumanPurchaseJournalStage } from "./human-purchase-journal-storage.js";
import type { HumanPurchaseOperationId } from "./human-purchase-journal-types.js";

type StageInput = Readonly<{ operationId: string; workspaceRoot: string }>;

function operationId(value: unknown): HumanPurchaseOperationId {
  return humanJournalHash(
    value,
    "human purchase operation ID",
  ) as HumanPurchaseOperationId;
}

export function markHumanPurchaseCompletion(
  input: StageInput &
    (
      | Readonly<{
          classification: "SUCCEEDED";
          completionOffset: number;
          updateId: string;
        }>
      | Readonly<{
          classification: "REJECTED";
          completionOffset: number;
          statusCode: number;
        }>
    ),
): Promise<void> {
  return appendHumanPurchaseJournalStage({
    ...input,
    createPayload: (state) =>
      humanCompletionPayload(
        input.classification === "SUCCEEDED"
          ? {
              classification: input.classification,
              completionOffset: input.completionOffset,
              updateId: input.updateId,
            }
          : {
              classification: input.classification,
              completionOffset: input.completionOffset,
              statusCode: input.statusCode,
            },
        state.beginExclusive,
      ),
    expectedStage: "execution-started",
    kind: "completion",
    operationId: operationId(input.operationId),
  });
}

export function markHumanPurchaseSettlementReconciled(
  input: StageInput &
    Readonly<{ settlement: AuthenticatedHumanPurchaseProviderSettlement }>,
): Promise<void> {
  return appendHumanPurchaseJournalStage({
    ...input,
    createPayload: (state) => {
      if (state.completion?.classification !== "SUCCEEDED") {
        throw new Error("human settlement requires successful completion");
      }
      return humanSettlementPayload(
        {
          proof: readAuthenticatedHumanPurchaseProviderSettlement(
            input.settlement,
          ),
        },
        state.expectation,
        state.completion.updateId,
      );
    },
    expectedStage: "completion",
    kind: "settlement-reconciled",
    operationId: operationId(input.operationId),
  });
}

export function markHumanPurchaseDelivery(
  input: StageInput &
    Readonly<{
      bodyByteCount: number;
      bodySha256: string;
      status: 200;
    }>,
): Promise<void> {
  return appendHumanPurchaseJournalStage({
    ...input,
    createPayload: () =>
      humanDeliveryPayload({
        bodyByteCount: input.bodyByteCount,
        bodySha256: input.bodySha256,
        status: input.status,
      }),
    expectedStage: "settlement-reconciled",
    kind: "delivery",
    operationId: operationId(input.operationId),
  });
}
