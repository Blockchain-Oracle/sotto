import { randomBytes } from "node:crypto";
import {
  canonicalTime,
  exactKeys,
  objectValue,
} from "./purchase-commitment-primitives.js";
import { selectPurchaseHoldings } from "./purchase-holding-parser.js";
import {
  readAuthenticatedBoundedPurchaseLedgerIntent,
  type BoundedPurchaseLedgerIntent,
} from "./purchase-ledger-intent.js";
import {
  HOLDING_INTERFACE_QUERY_ID,
  type PurchaseHoldingAcsReader,
  type PurchaseHoldingAcsRequest,
  type ValidatedDisclosedContract,
} from "./purchase-holding-types.js";

export const MAX_HOLDING_OBSERVATION_AGE_MS = 60_000;
const CLOCK_ROLLBACK_TOLERANCE_MS = 5_000;

declare const holdingObservationBrand: unique symbol;

export type PurchaseHoldingObservation = Readonly<{
  observationId: `sha256:${string}`;
  observedAt: string;
  readonly [holdingObservationBrand]: true;
}>;

export type PurchaseHoldingExecutionMaterial = Readonly<{
  attemptId: `sha256:${string}`;
  purchaseCommitment: `sha256:${string}`;
  contractIds: readonly string[];
  disclosedContracts: readonly ValidatedDisclosedContract[];
}>;

type HoldingObservationState = PurchaseHoldingExecutionMaterial & {
  capturedAt: number;
  claimed: boolean;
};

const holdingStates = new WeakMap<object, HoldingObservationState>();

function cloneMaterial(
  state: HoldingObservationState,
): PurchaseHoldingExecutionMaterial {
  return Object.freeze({
    attemptId: state.attemptId,
    purchaseCommitment: state.purchaseCommitment,
    contractIds: Object.freeze([...state.contractIds]),
    disclosedContracts: Object.freeze(
      state.disclosedContracts.map((contract) =>
        Object.freeze({ ...contract }),
      ),
    ),
  });
}

function assertFresh(state: HoldingObservationState): void {
  const age = Date.now() - state.capturedAt;
  if (age < -CLOCK_ROLLBACK_TOLERANCE_MS) {
    throw new Error("holding observation clock moved backwards");
  }
  if (age > MAX_HOLDING_OBSERVATION_AGE_MS) {
    throw new Error("holding observation is stale");
  }
}

function readState(
  observation: unknown,
  candidateIntent: unknown,
): HoldingObservationState {
  const intent = readAuthenticatedBoundedPurchaseLedgerIntent(candidateIntent);
  if (typeof observation !== "object" || observation === null) {
    throw new Error("holding observation is not authenticated");
  }
  const state = holdingStates.get(observation);
  if (state === undefined)
    throw new Error("holding observation is not authenticated");
  assertFresh(state);
  if (
    state.attemptId !== intent.attemptId ||
    state.purchaseCommitment !== intent.purchaseCommitment
  ) {
    throw new Error("holding observation belongs to a different purchase");
  }
  return state;
}

function createAcsRequest(
  payerParty: string,
  activeAtOffset: number,
): PurchaseHoldingAcsRequest {
  return {
    filter: {
      filtersByParty: {
        [payerParty]: {
          cumulative: [
            {
              identifierFilter: {
                InterfaceFilter: {
                  value: {
                    interfaceId: HOLDING_INTERFACE_QUERY_ID,
                    includeCreatedEventBlob: true,
                    includeInterfaceView: true,
                  },
                },
              },
            },
          ],
        },
      },
    },
    verbose: false,
    activeAtOffset,
  };
}

export function createPurchaseHoldingObserver(
  reader: PurchaseHoldingAcsReader,
): (
  intent: BoundedPurchaseLedgerIntent,
) => Promise<PurchaseHoldingObservation> {
  return async (candidateIntent) => {
    const intent =
      readAuthenticatedBoundedPurchaseLedgerIntent(candidateIntent);
    const acquisitionStartedAt = Date.now();
    const ledgerEnd = objectValue(
      await reader.readLedgerEnd(),
      "holding ledger end",
    );
    exactKeys(ledgerEnd, ["offset"], "holding ledger end");
    if (
      !Number.isSafeInteger(ledgerEnd.offset) ||
      (ledgerEnd.offset as number) < 0
    ) {
      throw new Error("holding Ledger offset must be nonnegative");
    }
    const selected = selectPurchaseHoldings(
      await reader.readActiveContracts(
        createAcsRequest(
          intent.challenge.payerParty,
          ledgerEnd.offset as number,
        ),
      ),
      intent,
    );
    const capturedAt = Date.now();
    const acquisitionAge = capturedAt - acquisitionStartedAt;
    if (acquisitionAge < -CLOCK_ROLLBACK_TOLERANCE_MS) {
      throw new Error(
        "holding observation clock moved backwards during acquisition",
      );
    }
    if (acquisitionAge > MAX_HOLDING_OBSERVATION_AGE_MS) {
      throw new Error("holding observation acquisition is stale");
    }
    const observedAt = new Date(capturedAt).toISOString();
    canonicalTime(observedAt, "holding observedAt");
    const observation = Object.freeze({
      observationId: `sha256:${randomBytes(32).toString("hex")}`,
      observedAt,
    }) as PurchaseHoldingObservation;
    holdingStates.set(observation, {
      attemptId: intent.attemptId,
      purchaseCommitment: intent.purchaseCommitment,
      contractIds: Object.freeze(
        selected.map(({ disclosure }) => disclosure.contractId),
      ),
      disclosedContracts: Object.freeze(
        selected.map(({ disclosure }) => disclosure),
      ),
      capturedAt: acquisitionStartedAt,
      claimed: false,
    });
    return observation;
  };
}

/** @internal Registry and command construction only. */
export function readPurchaseHoldingObservation(
  observation: unknown,
  intent: unknown,
): PurchaseHoldingExecutionMaterial {
  return cloneMaterial(readState(observation, intent));
}

/** @internal Command construction only; a failed prepare requires reacquisition. */
export function claimPurchaseHoldingObservation(
  observation: unknown,
  intent: unknown,
): PurchaseHoldingExecutionMaterial {
  const state = readState(observation, intent);
  if (state.claimed) throw new Error("holding observation is already claimed");
  state.claimed = true;
  return cloneMaterial(state);
}
