import type { SpikeConfig } from "./config.js";
import type {
  HumanPurchaseCompletionPayload,
  HumanPurchaseDeliveryPayload,
  HumanPurchaseJournalStage,
  HumanPurchaseOperationId,
  HumanPurchaseSettlementPayload,
} from "./human-purchase-journal-types.js";

type SuccessfulCompletion = Extract<
  HumanPurchaseCompletionPayload,
  { classification: "SUCCEEDED" }
>;
type RejectedCompletion = Extract<
  HumanPurchaseCompletionPayload,
  { classification: "REJECTED" }
>;
type CommonResult = Readonly<{
  operationId: HumanPurchaseOperationId;
  priorStage: HumanPurchaseJournalStage;
}>;

export type HumanPurchaseRecoveryInput = Readonly<{
  network: SpikeConfig["network"];
  operationId: string;
  providerParty: string;
  signal: AbortSignal;
  sourceCommit: string;
  workspaceRoot: string;
}>;

export type HumanPurchaseRecoveryResult =
  | (CommonResult & Readonly<{ status: "not-executed" }>)
  | (CommonResult &
      Readonly<{ completion: RejectedCompletion; status: "rejected" }>)
  | (CommonResult &
      Readonly<{
        completion: SuccessfulCompletion;
        settlement: HumanPurchaseSettlementPayload;
        status: "settled-undelivered";
      }>)
  | (CommonResult &
      Readonly<{
        completion: SuccessfulCompletion;
        delivery: HumanPurchaseDeliveryPayload;
        settlement: HumanPurchaseSettlementPayload;
        status: "delivered";
      }>);
