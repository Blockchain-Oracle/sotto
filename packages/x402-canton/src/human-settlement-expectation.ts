import type { HashVerifiedHumanPreparedPurchase } from "./human-prepared-purchase-hash.js";
import {
  readHashVerifiedHumanSettlementAuthority,
  type ReadHashVerifiedHumanSettlementAuthority,
} from "./human-prepared-purchase-hash-state.js";
import { preparedTransferContextIds } from "./prepared-transfer-context-ids.js";

export const HUMAN_SETTLEMENT_EXPECTATION_VERSION =
  "sotto-human-settlement-expectation-v1" as const;

declare const humanSettlementExpectationBrand: unique symbol;
export type HumanSettlementExpectationSnapshot = Readonly<{
  version: typeof HUMAN_SETTLEMENT_EXPECTATION_VERSION;
  commandId: string;
  attemptId: `sha256:${string}`;
  challengeId: `sha256:${string}`;
  requestCommitment: `sha256:${string}`;
  purchaseCommitment: `sha256:${string}`;
  payerParty: string;
  providerParty: string;
  amount: string;
  dsoParty: string;
  synchronizerId: string;
  packageId: string;
  transferFactoryContractId: string;
  inputHoldingContractIds: readonly string[];
  transferPreapprovalContractId: string;
  choiceContextContractIds: Readonly<Record<string, string>>;
  amuletTemplateId: string;
  transferPreapprovalTemplateId: string;
}>;

export type HumanSettlementExpectation = HumanSettlementExpectationSnapshot &
  Readonly<{
    readonly [humanSettlementExpectationBrand]: true;
  }>;

const authenticatedExpectations = new WeakSet<object>();

function utf8Compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function choiceContextContractIds(
  value: unknown,
): Readonly<Record<string, string>> {
  const context = preparedTransferContextIds(value);
  for (const key of [
    "external-party-config-state",
    "featured-app-right",
    "transfer-preapproval",
  ]) {
    if (!context.has(key)) {
      throw new Error(`human settlement context ${key} is absent`);
    }
  }
  return Object.freeze(
    Object.fromEntries(
      [...context.entries()].sort(([left], [right]) =>
        utf8Compare(left, right),
      ),
    ),
  );
}

function spliceAmuletPackageId(
  intent: ReadHashVerifiedHumanSettlementAuthority["intent"],
): string {
  const references = intent.packageSelection.references.filter(
    ({ packageName }) => packageName === "splice-amulet",
  );
  if (references.length !== 1) {
    throw new Error(
      "human settlement package selection must contain exactly one splice-amulet reference",
    );
  }
  const packageId = references[0]!.packageId;
  if (
    intent.packageSelection.packageIds.filter(
      (candidate) => candidate === packageId,
    ).length !== 1
  ) {
    throw new Error(
      "human settlement splice-amulet reference is not selected exactly once",
    );
  }
  return packageId;
}

export function projectHumanSettlementExpectation(
  verified: HashVerifiedHumanPreparedPurchase,
): HumanSettlementExpectation {
  const { intent, prepareRequest } =
    readHashVerifiedHumanSettlementAuthority(verified);
  const command = prepareRequest.commands[0].ExerciseCommand.choiceArgument;
  const context = choiceContextContractIds(command.extraArgs.context);
  const packageId = spliceAmuletPackageId(intent);
  const expectation = Object.freeze({
    version: HUMAN_SETTLEMENT_EXPECTATION_VERSION,
    commandId: prepareRequest.commandId,
    attemptId: intent.attemptId,
    challengeId: intent.challenge.challengeId,
    requestCommitment: intent.request.requestCommitment,
    purchaseCommitment: intent.purchaseCommitment,
    payerParty: intent.challenge.payerParty,
    providerParty: intent.challenge.recipientParty,
    amount: command.transfer.amount,
    dsoParty: intent.tokenFactory.expectedAdmin,
    synchronizerId: intent.challenge.synchronizerId,
    packageId,
    transferFactoryContractId: intent.tokenFactory.contractId,
    inputHoldingContractIds: Object.freeze([
      ...command.transfer.inputHoldingCids,
    ]),
    transferPreapprovalContractId: context["transfer-preapproval"]!,
    choiceContextContractIds: context,
    amuletTemplateId: `${packageId}:Splice.Amulet:Amulet`,
    transferPreapprovalTemplateId: `${packageId}:Splice.AmuletRules:TransferPreapproval`,
  }) as HumanSettlementExpectation;
  authenticatedExpectations.add(expectation);
  return expectation;
}

/** @internal Human settlement reconciliation only. */
export function readAuthenticatedHumanSettlementExpectation(
  candidate: unknown,
): HumanSettlementExpectation {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    !authenticatedExpectations.has(candidate)
  ) {
    throw new Error("human settlement expectation is not authenticated");
  }
  return candidate as HumanSettlementExpectation;
}

/** @internal Strict journal restoration only. */
export function registerRestoredHumanSettlementExpectation(
  snapshot: HumanSettlementExpectationSnapshot,
): HumanSettlementExpectation {
  const expectation = snapshot as HumanSettlementExpectation;
  authenticatedExpectations.add(expectation);
  return expectation;
}
