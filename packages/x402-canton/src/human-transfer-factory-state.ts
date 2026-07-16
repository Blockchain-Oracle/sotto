import { MIN_HUMAN_SIGNING_RESERVE_MS } from "./human-purchase-commitment-validation.js";
import { readHumanPurchaseHoldingObservation } from "./human-purchase-holding-observation.js";
import type { HumanPurchaseHoldingObservation } from "./human-purchase-holding-types.js";
import {
  readAuthenticatedHumanPurchaseLedgerIntent,
  type HumanPurchaseLedgerIntent,
} from "./human-purchase-ledger-intent.js";
import {
  buildHumanTransferFactoryChoiceArguments,
  digestHumanTransferFactoryChoiceArguments,
} from "./human-transfer-factory-choice.js";
import type {
  HumanTransferFactoryExecutionMaterial,
  HumanTransferFactoryObservation,
} from "./human-transfer-factory-types.js";
import { snapshotStrictJsonObject } from "./strict-json-value.js";
import { MAX_REGISTRY_CONTEXT_BYTES } from "./transfer-factory-types.js";

export const MAX_HUMAN_TRANSFER_FACTORY_ACQUISITION_MS = 10_000;
export const MAX_HUMAN_TRANSFER_FACTORY_OBSERVATION_AGE_MS = 60_000;
const CLOCK_ROLLBACK_TOLERANCE_MS = 5_000;

type HumanTransferFactoryState = HumanTransferFactoryExecutionMaterial & {
  acquisitionStartedAt: number;
  capturedAt: number;
  claimed: boolean;
  holdingObservation: HumanPurchaseHoldingObservation;
  intent: HumanPurchaseLedgerIntent;
};

const states = new WeakMap<object, HumanTransferFactoryState>();

function requireTimes(
  intent: HumanPurchaseLedgerIntent,
  acquisitionStartedAt: number,
  capturedAt: number,
  now: number,
): void {
  if (
    capturedAt - acquisitionStartedAt < -CLOCK_ROLLBACK_TOLERANCE_MS ||
    now - capturedAt < -CLOCK_ROLLBACK_TOLERANCE_MS ||
    now - Date.parse(intent.challenge.requestedAt) <
      -CLOCK_ROLLBACK_TOLERANCE_MS
  ) {
    throw new Error("human TransferFactory observation clock moved backwards");
  }
  if (
    capturedAt - acquisitionStartedAt >
      MAX_HUMAN_TRANSFER_FACTORY_ACQUISITION_MS ||
    now - acquisitionStartedAt > MAX_HUMAN_TRANSFER_FACTORY_OBSERVATION_AGE_MS
  ) {
    throw new Error("human TransferFactory observation is stale");
  }
  if (now >= Date.parse(intent.challenge.executeBefore)) {
    throw new Error("human TransferFactory challenge is expired");
  }
}

export function requireHumanTransferFactoryAcquisitionFresh(
  intent: HumanPurchaseLedgerIntent,
  acquisitionStartedAt: number,
  capturedAt = Date.now(),
): void {
  requireTimes(intent, acquisitionStartedAt, capturedAt, capturedAt);
}

function cloneMaterial(
  state: HumanTransferFactoryState,
): HumanTransferFactoryExecutionMaterial {
  return Object.freeze({
    factoryId: state.factoryId,
    transferKind: state.transferKind,
    choiceArgumentsDigest: state.choiceArgumentsDigest,
    choiceContextData: snapshotStrictJsonObject(
      state.choiceContextData,
      "human TransferFactory choice context",
      {
        maximumBytes: MAX_REGISTRY_CONTEXT_BYTES,
        maximumDepth: 16,
        maximumNodes: 2_048,
      },
    ),
    disclosedContracts: Object.freeze(
      state.disclosedContracts.map((contract) =>
        Object.freeze({ ...contract }),
      ),
    ),
  });
}

function readState(
  observation: unknown,
  candidateIntent: unknown,
  candidateHoldings: unknown,
): HumanTransferFactoryState {
  const intent = readAuthenticatedHumanPurchaseLedgerIntent(candidateIntent);
  const holdings = readHumanPurchaseHoldingObservation(
    candidateHoldings,
    intent,
  );
  if (typeof observation !== "object" || observation === null) {
    throw new Error("human TransferFactory observation is not authenticated");
  }
  const state = states.get(observation);
  if (state === undefined) {
    throw new Error("human TransferFactory observation is not authenticated");
  }
  requireTimes(
    state.intent,
    state.acquisitionStartedAt,
    state.capturedAt,
    Date.now(),
  );
  if (state.intent !== intent) {
    throw new Error(
      "human TransferFactory observation belongs to another purchase",
    );
  }
  const digest = digestHumanTransferFactoryChoiceArguments(
    buildHumanTransferFactoryChoiceArguments(intent, holdings),
  );
  if (
    state.holdingObservation !== candidateHoldings ||
    state.choiceArgumentsDigest !== digest
  ) {
    throw new Error(
      "human TransferFactory observation belongs to other holdings",
    );
  }
  if (state.claimed) {
    throw new Error("human TransferFactory observation is already claimed");
  }
  return state;
}

export function bindHumanTransferFactoryObservation(
  observation: HumanTransferFactoryObservation,
  intent: HumanPurchaseLedgerIntent,
  holdings: HumanPurchaseHoldingObservation,
  acquisitionStartedAt: number,
  capturedAt: number,
  material: HumanTransferFactoryExecutionMaterial,
): void {
  requireTimes(intent, acquisitionStartedAt, capturedAt, capturedAt);
  states.set(observation, {
    ...material,
    acquisitionStartedAt,
    capturedAt,
    claimed: false,
    holdingObservation: holdings,
    intent,
  });
}

export function readHumanTransferFactoryObservation(
  observation: unknown,
  intent: unknown,
  holdings: unknown,
): HumanTransferFactoryExecutionMaterial {
  return cloneMaterial(readState(observation, intent, holdings));
}

export function claimHumanTransferFactoryObservation(
  observation: unknown,
  intent: unknown,
  holdings: unknown,
): HumanTransferFactoryExecutionMaterial {
  const state = readState(observation, intent, holdings);
  if (
    Date.parse(state.intent.challenge.executeBefore) - Date.now() <
    MIN_HUMAN_SIGNING_RESERVE_MS
  ) {
    throw new Error(
      "human TransferFactory challenge lacks the signing reserve",
    );
  }
  state.claimed = true;
  return cloneMaterial(state);
}
