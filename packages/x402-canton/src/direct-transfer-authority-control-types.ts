import type { AuthenticatedPackagePreferenceProjection } from "./package-preference-observation-types.js";
import type { SelectedPurchaseHolding } from "./purchase-holding-types.js";
import type { StrictJsonObject } from "./strict-json-value.js";
import type { TransferFactoryChoiceArguments } from "./transfer-factory-choice.js";
import type { TransferFactoryExecutionMaterial } from "./transfer-factory-types.js";

export type DirectTransferAuthorityProbe = Readonly<{
  choiceArguments: TransferFactoryChoiceArguments;
  choiceArgumentsDigest: `sha256:${string}`;
}>;

export type DirectTransferAuthorityChoiceArgument = Readonly<{
  expectedAdmin: string;
  transfer: TransferFactoryChoiceArguments["transfer"];
  extraArgs: Readonly<{
    context: StrictJsonObject;
    meta: Readonly<{ values: Readonly<Record<string, never>> }>;
  }>;
}>;

export type DirectTransferAuthorityPrepareRequest = Readonly<{
  commandId: string;
  commands: readonly [
    Readonly<{
      ExerciseCommand: Readonly<{
        templateId: string;
        contractId: string;
        choice: "TransferFactory_Transfer";
        choiceArgument: DirectTransferAuthorityChoiceArgument;
      }>;
    }>,
  ];
  actAs: readonly [string];
  readAs: readonly [];
  disclosedContracts: TransferFactoryExecutionMaterial["disclosedContracts"];
  synchronizerId: string;
  packageIdSelectionPreference: readonly [string, ...string[]];
  verboseHashing: false;
  prefetchContractKeys: readonly [];
  maxRecordTime: string;
  hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2";
}>;

export type DirectTransferAuthorityControlInput = Readonly<{
  agentParty: string;
  controlId: `sha256:${string}`;
  factory: TransferFactoryExecutionMaterial;
  holdings: readonly SelectedPurchaseHolding[];
  packageSelection: AuthenticatedPackagePreferenceProjection;
  payerParty: string;
  probe: DirectTransferAuthorityProbe;
  synchronizerId: string;
}>;

export type DirectTransferAuthorityControl = Readonly<{
  agentRequest: DirectTransferAuthorityPrepareRequest;
  payerRequest: DirectTransferAuthorityPrepareRequest;
}>;
