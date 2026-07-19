import type { HumanPreparedPurchaseApproval } from "@sotto/x402-canton";
import type { HumanPrepareWorkerResult } from "./human-prepare-worker-types.js";

type PreparedResult = Extract<
  HumanPrepareWorkerResult,
  { outcome: "prepared-hash-verified" }
>;

type PreparedResultState = Readonly<{
  approval: HumanPreparedPurchaseApproval;
  checkpoint: PreparedResult["checkpoint"];
  checkpointSnapshot: Readonly<{
    attemptId: string;
    preparedTransactionHash: string;
    transferContextHash: string;
  }>;
  handoff: PreparedResult["handoff"];
}>;

const preparedResultStates = new WeakMap<object, PreparedResultState>();

function requirePreparedResult(candidate: unknown): PreparedResult {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    (candidate as Partial<PreparedResult>).outcome !== "prepared-hash-verified"
  ) {
    throw new Error("human prepare worker result is invalid");
  }
  return candidate as PreparedResult;
}

function requireConsistentState(
  result: PreparedResult,
  state: PreparedResultState,
): void {
  if (
    result.approval !== state.approval ||
    result.checkpoint !== state.checkpoint ||
    result.handoff !== state.handoff ||
    result.checkpoint.attemptId !== state.checkpointSnapshot.attemptId ||
    result.checkpoint.preparedTransactionHash !==
      state.checkpointSnapshot.preparedTransactionHash ||
    result.checkpoint.transferContextHash !==
      state.checkpointSnapshot.transferContextHash ||
    state.checkpointSnapshot.attemptId !== state.approval.attemptId ||
    state.checkpointSnapshot.preparedTransactionHash !==
      state.approval.preparedTransactionHash ||
    state.checkpointSnapshot.transferContextHash !==
      state.approval.transferContextHash
  ) {
    throw new Error("human prepare worker result is inconsistent");
  }
}

export function registerHumanPrepareWorkerResult(result: PreparedResult): void {
  if (!Object.isFrozen(result)) {
    throw new Error("human prepare worker result must be frozen");
  }
  const state = Object.freeze({
    approval: result.approval,
    checkpoint: result.checkpoint,
    checkpointSnapshot: Object.freeze({
      attemptId: result.checkpoint.attemptId,
      preparedTransactionHash: result.checkpoint.preparedTransactionHash,
      transferContextHash: result.checkpoint.transferContextHash,
    }),
    handoff: result.handoff,
  });
  requireConsistentState(result, state);
  preparedResultStates.set(result, state);
}

export function readHumanPrepareWorkerApproval(
  candidate: unknown,
): HumanPreparedPurchaseApproval {
  const result = requirePreparedResult(candidate);
  const state = preparedResultStates.get(result);
  if (state === undefined) {
    throw new Error("human prepare worker result is not authenticated");
  }
  requireConsistentState(result, state);
  return state.approval;
}
