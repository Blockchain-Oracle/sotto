import { randomBytes } from "node:crypto";
import {
  requireHumanObservationActive,
  withHumanObservationDeadline,
  type HumanObservationOptions,
} from "./human-observation-deadline.js";
import {
  readAuthenticatedHumanPurchaseLedgerIntent,
  type HumanPurchaseLedgerIntent,
} from "./human-purchase-ledger-intent.js";
import {
  createHumanHoldingAcsRequest,
  readHumanHoldingLedgerOffset,
} from "./human-purchase-holding-request.js";
import {
  bindHumanPurchaseHoldingObservation,
  MAX_HUMAN_HOLDING_ACQUISITION_MS,
  requireHumanHoldingAcquisitionFresh,
} from "./human-purchase-holding-state.js";
import type {
  HumanPurchaseHoldingObservation,
  HumanPurchaseHoldingReader,
} from "./human-purchase-holding-types.js";
import { canonicalTime } from "./purchase-commitment-primitives.js";
import { selectPurchaseHoldingsByCriteria } from "./purchase-holding-parser.js";
import { FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID } from "./purchase-holding-types.js";

function requireReader(candidate: unknown): HumanPurchaseHoldingReader {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("human holding reader is invalid");
  }
  const reader = candidate as Partial<HumanPurchaseHoldingReader>;
  if (
    typeof reader.readLedgerEnd !== "function" ||
    typeof reader.readActiveContracts !== "function"
  ) {
    throw new Error("human holding reader is invalid");
  }
  return reader as HumanPurchaseHoldingReader;
}

async function readUpstream(
  phase: "contracts" | "ledger-end",
  read: () => Promise<unknown>,
): Promise<unknown> {
  try {
    return await read();
  } catch {
    throw new Error(`human holding ${phase} read failed`);
  }
}

export function createHumanPurchaseHoldingObserver(
  candidateReader: HumanPurchaseHoldingReader,
): (
  intent: HumanPurchaseLedgerIntent,
  options?: HumanObservationOptions,
) => Promise<HumanPurchaseHoldingObservation> {
  const reader = requireReader(candidateReader);
  return async (candidateIntent, options = {}) => {
    const intent = readAuthenticatedHumanPurchaseLedgerIntent(candidateIntent);
    if (
      intent.packageSelection.packageIds[0] !==
      FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID
    ) {
      throw new Error("human holding package selection is not approved");
    }
    return await withHumanObservationDeadline(
      "human holding observation",
      MAX_HUMAN_HOLDING_ACQUISITION_MS,
      options,
      async (signal) => {
        const acquisitionStartedAt = Date.now();
        requireHumanHoldingAcquisitionFresh(intent, acquisitionStartedAt);
        const readOptions = Object.freeze({ signal });
        const ledgerEnd = await readUpstream("ledger-end", () =>
          reader.readLedgerEnd(readOptions),
        );
        requireHumanObservationActive(signal, "human holding observation");
        requireHumanHoldingAcquisitionFresh(intent, acquisitionStartedAt);
        const activeAtOffset = readHumanHoldingLedgerOffset(ledgerEnd);
        const contracts = await readUpstream("contracts", () =>
          reader.readActiveContracts(
            createHumanHoldingAcsRequest(
              intent.challenge.payerParty,
              activeAtOffset,
            ),
            readOptions,
          ),
        );
        requireHumanObservationActive(signal, "human holding observation");
        requireHumanHoldingAcquisitionFresh(intent, acquisitionStartedAt);
        const selected = selectPurchaseHoldingsByCriteria(contracts, {
          debitCeilingAtomic: intent.limits.maximumTotalDebitAtomic,
          instrument: intent.challenge.instrument,
          payerParty: intent.challenge.payerParty,
          synchronizerId: intent.challenge.synchronizerId,
        });
        requireHumanObservationActive(signal, "human holding observation");
        const capturedAt = Date.now();
        requireHumanHoldingAcquisitionFresh(
          intent,
          acquisitionStartedAt,
          capturedAt,
        );
        const observedAt = new Date(capturedAt).toISOString();
        canonicalTime(observedAt, "human holding observedAt");
        const observation = Object.freeze({
          observationId: `sha256:${randomBytes(32).toString("hex")}` as const,
          observedAt,
        });
        bindHumanPurchaseHoldingObservation(
          observation,
          intent,
          acquisitionStartedAt,
          capturedAt,
          selected,
        );
        return observation;
      },
    );
  };
}

export {
  claimHumanPurchaseHoldingObservation,
  readHumanPurchaseHoldingObservation,
} from "./human-purchase-holding-state.js";
export {
  MAX_HUMAN_HOLDING_ACQUISITION_MS,
  MAX_HUMAN_HOLDING_OBSERVATION_AGE_MS,
} from "./human-purchase-holding-state.js";
export type {
  HumanPurchaseHoldingObservation,
  HumanPurchaseHoldingReader,
} from "./human-purchase-holding-types.js";
