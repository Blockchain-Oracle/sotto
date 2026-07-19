import type { StrictJsonObject } from "./strict-json-value.js";
import type { ValidatedDisclosedContract } from "./purchase-holding-types.js";
import type { BoundedPackageIdSelectionPreference } from "./bounded-purchase-command-preference.js";

export type BoundedPurchaseChoiceArgument = Readonly<{
  attemptId: `sha256:${string}`;
  purchaseCommitment: `sha256:${string}`;
  requestCommitment: `sha256:${string}`;
  challengeId: `sha256:${string}`;
  resourceHash: `sha256:${string}`;
  recipient: string;
  amount: string;
  requestedAt: string;
  executeBefore: string;
  inputHoldingCids: readonly string[];
  extraArgs: Readonly<{
    context: StrictJsonObject;
    meta: Readonly<{ values: Readonly<Record<string, never>> }>;
  }>;
  expectedRevision: string;
}>;

export type BoundedPurchasePrepareRequest = Readonly<{
  commandId: string;
  commands: readonly Readonly<{
    ExerciseCommand: Readonly<{
      templateId: string;
      contractId: string;
      choice: "Purchase";
      choiceArgument: BoundedPurchaseChoiceArgument;
    }>;
  }>[];
  actAs: readonly [string];
  readAs: readonly [];
  disclosedContracts: readonly ValidatedDisclosedContract[];
  synchronizerId: string;
  packageIdSelectionPreference: BoundedPackageIdSelectionPreference;
  verboseHashing: false;
  prefetchContractKeys: readonly [];
  maxRecordTime: string;
  hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2";
}>;
