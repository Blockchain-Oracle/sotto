import { bindHumanPurchasePrepareRequest } from "./human-purchase-command-state.js";
import type {
  HumanPurchasePrepareRequest,
  HumanPurchaseTransferChoiceArgument,
} from "./human-purchase-command-types.js";
import { prepareHumanPurchaseHoldingClaim } from "./human-purchase-holding-state.js";
import type {
  HumanPurchaseHoldingExecutionMaterial,
  HumanPurchaseHoldingObservation,
} from "./human-purchase-holding-types.js";
import {
  prepareHumanPurchaseCommandAuthorityClaim,
  type HumanPurchaseLedgerIntent,
} from "./human-purchase-ledger-intent.js";
import { buildHumanTransferFactoryChoiceArguments } from "./human-transfer-factory-choice.js";
import type { HumanTransferFactoryObservation } from "./human-transfer-factory-observation.js";
import { prepareHumanTransferFactoryClaim } from "./human-transfer-factory-state.js";
import { mergePurchaseDisclosures } from "./purchase-disclosure-merge.js";
import { snapshotStrictJsonObject } from "./strict-json-value.js";
import { MAX_REGISTRY_CONTEXT_BYTES } from "./transfer-factory-types.js";

function purchaseChoiceArgument(
  intent: HumanPurchaseLedgerIntent,
  holdings: HumanPurchaseHoldingExecutionMaterial,
  context: unknown,
): HumanPurchaseTransferChoiceArgument {
  const source = buildHumanTransferFactoryChoiceArguments(intent, holdings);
  return Object.freeze({
    expectedAdmin: source.expectedAdmin,
    transfer: source.transfer,
    extraArgs: Object.freeze({
      context: snapshotStrictJsonObject(
        context,
        "human transfer choice context",
        {
          maximumBytes: MAX_REGISTRY_CONTEXT_BYTES,
          maximumDepth: 16,
          maximumNodes: 2_048,
        },
      ),
      meta: source.extraArgs.meta,
    }),
  });
}

function constructRequest(
  intent: HumanPurchaseLedgerIntent,
  holdings: HumanPurchaseHoldingExecutionMaterial,
  context: unknown,
  disclosures: HumanPurchasePrepareRequest["disclosedContracts"],
  packageIds: readonly [string],
): HumanPurchasePrepareRequest {
  const exercise = Object.freeze({
    templateId: intent.tokenFactory.interfaceId,
    contractId: intent.tokenFactory.contractId,
    choice: "TransferFactory_Transfer" as const,
    choiceArgument: purchaseChoiceArgument(intent, holdings, context),
  });
  return Object.freeze({
    commandId: `sotto-human-purchase-v1-${intent.purchaseCommitment.slice(7)}`,
    commands: Object.freeze([
      Object.freeze({ ExerciseCommand: exercise }),
    ]) as HumanPurchasePrepareRequest["commands"],
    actAs: Object.freeze([...intent.actAs]) as readonly [string],
    readAs: Object.freeze([]) as readonly [],
    disclosedContracts: disclosures,
    synchronizerId: intent.challenge.synchronizerId,
    packageIdSelectionPreference: packageIds,
    verboseHashing: false,
    prefetchContractKeys: Object.freeze([]) as readonly [],
    maxRecordTime: intent.challenge.executeBefore,
    hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
  });
}

export function buildHumanPurchasePrepareRequest(
  candidateIntent: HumanPurchaseLedgerIntent,
  holdingObservation: HumanPurchaseHoldingObservation,
  registryObservation: HumanTransferFactoryObservation,
): HumanPurchasePrepareRequest {
  const now = Date.now();
  const authority = prepareHumanPurchaseCommandAuthorityClaim(
    candidateIntent,
    now,
  );
  const holdings = prepareHumanPurchaseHoldingClaim(
    holdingObservation,
    authority.intent,
    now,
  );
  const registry = prepareHumanTransferFactoryClaim(
    registryObservation,
    authority.intent,
    holdingObservation,
    now,
  );
  const disclosures = mergePurchaseDisclosures(
    holdings.material.disclosedContracts,
    registry.material.disclosedContracts,
  );
  const request = constructRequest(
    authority.intent,
    holdings.material,
    registry.material.choiceContextData,
    disclosures,
    authority.packageIds,
  );
  bindHumanPurchasePrepareRequest(
    request,
    authority.intent,
    authority.requireFresh,
  );
  registry.commit();
  holdings.commit();
  authority.commit();
  return request;
}

export type {
  HumanPurchasePrepareRequest,
  HumanPurchaseTransferChoiceArgument,
} from "./human-purchase-command-types.js";
