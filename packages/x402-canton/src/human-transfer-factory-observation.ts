import { randomBytes } from "node:crypto";
import {
  requireHumanObservationActive,
  withHumanObservationDeadline,
  type HumanObservationOptions,
} from "./human-observation-deadline.js";
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
import {
  bindHumanTransferFactoryObservation,
  MAX_HUMAN_TRANSFER_FACTORY_ACQUISITION_MS,
  requireHumanTransferFactoryAcquisitionFresh,
} from "./human-transfer-factory-state.js";
import type {
  HumanTransferFactoryObservation,
  HumanTransferFactoryRegistryReader,
} from "./human-transfer-factory-types.js";
import { FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID } from "./purchase-holding-types.js";
import { canonicalTime } from "./purchase-commitment-primitives.js";
import { parseTransferFactoryResponseWithExpectation } from "./transfer-factory-response.js";
import {
  MAX_REGISTRY_RESPONSE_BYTES,
  REGISTRY_TIMEOUT_MS,
  TRANSFER_FACTORY_REGISTRY_PATH,
} from "./transfer-factory-types.js";

function requireReader(candidate: unknown): HumanTransferFactoryRegistryReader {
  if (typeof candidate !== "function") {
    throw new Error("human TransferFactory reader is invalid");
  }
  return candidate as HumanTransferFactoryRegistryReader;
}

async function readRegistry(
  reader: HumanTransferFactoryRegistryReader,
  request: Parameters<HumanTransferFactoryRegistryReader>[0],
  signal: AbortSignal,
): Promise<Uint8Array> {
  try {
    return await reader(request, Object.freeze({ signal }));
  } catch {
    throw new Error("human TransferFactory registry read failed");
  }
}

export function createHumanTransferFactoryObserver(
  candidateReader: HumanTransferFactoryRegistryReader,
): (
  intent: HumanPurchaseLedgerIntent,
  holdings: HumanPurchaseHoldingObservation,
  options?: HumanObservationOptions,
) => Promise<HumanTransferFactoryObservation> {
  const reader = requireReader(candidateReader);
  return async (candidateIntent, holdingObservation, options = {}) => {
    const intent = readAuthenticatedHumanPurchaseLedgerIntent(candidateIntent);
    if (
      intent.packageSelection.packageIds[0] !==
      FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID
    ) {
      throw new Error(
        "human TransferFactory package selection is not approved",
      );
    }
    const holdings = readHumanPurchaseHoldingObservation(
      holdingObservation,
      intent,
    );
    const choiceArguments = buildHumanTransferFactoryChoiceArguments(
      intent,
      holdings,
    );
    const choiceArgumentsDigest =
      digestHumanTransferFactoryChoiceArguments(choiceArguments);
    const request = Object.freeze({
      registryAdmin: intent.challenge.instrument.admin,
      path: TRANSFER_FACTORY_REGISTRY_PATH,
      method: "POST" as const,
      contentType: "application/json" as const,
      redirect: "error" as const,
      timeoutMilliseconds: REGISTRY_TIMEOUT_MS,
      maximumResponseBytes: MAX_REGISTRY_RESPONSE_BYTES,
      body: JSON.stringify({ choiceArguments, excludeDebugFields: true }),
    });
    return await withHumanObservationDeadline(
      "human TransferFactory observation",
      MAX_HUMAN_TRANSFER_FACTORY_ACQUISITION_MS,
      options,
      async (signal) => {
        const acquisitionStartedAt = Date.now();
        requireHumanTransferFactoryAcquisitionFresh(
          intent,
          acquisitionStartedAt,
        );
        const bytes = await readRegistry(reader, request, signal);
        requireHumanObservationActive(
          signal,
          "human TransferFactory observation",
        );
        requireHumanTransferFactoryAcquisitionFresh(
          intent,
          acquisitionStartedAt,
        );
        const material = parseTransferFactoryResponseWithExpectation(bytes, {
          choiceArgumentsDigest,
          expectedFactoryId: intent.tokenFactory.contractId,
          creationTemplateId: intent.tokenFactory.creationTemplateId,
          requireFactoryDisclosure: false,
          synchronizerId: intent.challenge.synchronizerId,
        });
        requireHumanObservationActive(
          signal,
          "human TransferFactory observation",
        );
        const capturedAt = Date.now();
        requireHumanTransferFactoryAcquisitionFresh(
          intent,
          acquisitionStartedAt,
          capturedAt,
        );
        const observedAt = new Date(capturedAt).toISOString();
        canonicalTime(observedAt, "human TransferFactory observedAt");
        const observation = Object.freeze({
          observationId: `sha256:${randomBytes(32).toString("hex")}` as const,
          observedAt,
        });
        bindHumanTransferFactoryObservation(
          observation,
          intent,
          holdingObservation,
          acquisitionStartedAt,
          capturedAt,
          material,
        );
        return observation;
      },
    );
  };
}

export {
  claimHumanTransferFactoryObservation,
  MAX_HUMAN_TRANSFER_FACTORY_ACQUISITION_MS,
  MAX_HUMAN_TRANSFER_FACTORY_OBSERVATION_AGE_MS,
  readHumanTransferFactoryObservation,
} from "./human-transfer-factory-state.js";
export type {
  HumanTransferFactoryObservation,
  HumanTransferFactoryRegistryReader,
  HumanTransferFactoryRegistryRequest,
} from "./human-transfer-factory-types.js";
