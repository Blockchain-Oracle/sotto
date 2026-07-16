import type { HumanTransferFactoryChoiceArguments } from "./human-transfer-factory-choice.js";
import type { StrictJsonObject } from "./strict-json-value.js";
import type { ValidatedDisclosedContract } from "./purchase-holding-types.js";

export type HumanPurchaseTransferChoiceArgument = Readonly<{
  expectedAdmin: string;
  transfer: HumanTransferFactoryChoiceArguments["transfer"];
  extraArgs: Readonly<{
    context: StrictJsonObject;
    meta: Readonly<{ values: Readonly<Record<string, never>> }>;
  }>;
}>;

export type HumanPurchasePrepareRequest = Readonly<{
  commandId: string;
  commands: readonly [
    Readonly<{
      ExerciseCommand: Readonly<{
        templateId: string;
        contractId: string;
        choice: "TransferFactory_Transfer";
        choiceArgument: HumanPurchaseTransferChoiceArgument;
      }>;
    }>,
  ];
  actAs: readonly [string];
  readAs: readonly [];
  disclosedContracts: readonly ValidatedDisclosedContract[];
  synchronizerId: string;
  packageIdSelectionPreference: readonly [string];
  verboseHashing: false;
  prefetchContractKeys: readonly [];
  maxRecordTime: string;
  hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2";
}>;
