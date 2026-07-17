import type { HumanPurchasePrepareRequest } from "../src/index.js";
import {
  INPUT_AMOUNT,
  PREPARED_PURCHASE_EFFECT_CIDS,
} from "./prepared-purchase-effect-values.fixtures.js";

const INPUT_AMOUNTS = new Map([
  [PREPARED_PURCHASE_EFFECT_CIDS.inputHolding, INPUT_AMOUNT],
  ["00holding-multi-a", "0.2000000000"],
  ["00holding-multi-b", "0.1250000000"],
]);

export type HumanPreparedInputVector = Readonly<{
  amount: string;
  archiveNodeId: string;
  contractId: string;
  innerFetchNodeId: string;
  rootFetchNodeId: string;
}>;

export function humanPreparedInputVector(
  request: HumanPurchasePrepareRequest,
): readonly HumanPreparedInputVector[] {
  const contractIds =
    request.commands[0].ExerciseCommand.choiceArgument.transfer
      .inputHoldingCids;
  if (contractIds.length < 1 || contractIds.length > 2) {
    throw new Error("human prepared fixture requires one or two inputs");
  }
  return Object.freeze(
    contractIds.map((contractId, index) => {
      const amount = INPUT_AMOUNTS.get(contractId);
      if (amount === undefined) {
        throw new Error(
          `human prepared fixture input ${contractId} is unknown`,
        );
      }
      return Object.freeze({
        amount,
        archiveNodeId: index === 0 ? "2" : String(14 + index * 2),
        contractId,
        innerFetchNodeId: index === 0 ? "13" : String(13 + index * 2),
        rootFetchNodeId: index === 0 ? "12" : String(12 + index * 2),
      });
    }),
  );
}
