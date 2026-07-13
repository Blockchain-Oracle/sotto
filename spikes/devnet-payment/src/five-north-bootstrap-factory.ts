import { randomBytes } from "node:crypto";
import {
  buildBoundedCapabilityBootstrap,
  buildTransferFactoryBootstrapProbe,
  HOLDING_INTERFACE_QUERY_ID,
  MAX_REGISTRY_RESPONSE_BYTES,
  parseTransferFactoryBootstrapResponse,
  REGISTRY_TIMEOUT_MS,
  selectPurchaseHoldingsByCriteria,
  TRANSFER_FACTORY_REGISTRY_PATH,
  type PurchaseHoldingAcsReader,
  type PurchaseHoldingAcsRequest,
  type TransferFactoryRegistryReader,
} from "@sotto/x402-canton";
import {
  readFiveNorthCapabilityReadiness,
  type FiveNorthCapabilityReadinessObservation,
} from "./five-north-capability-readiness.js";
import {
  validateFiveNorthCapabilityPolicy,
  type FiveNorthCapabilityPolicy,
} from "./five-north-capability-policy.js";

const MAXIMUM_AGE_MS = 60_000;
const CLOCK_ROLLBACK_TOLERANCE_MS = 5_000;
const PROBE_WINDOW_MS = 60_000;

type BootstrapFactoryReaders = Readonly<{
  holdings: PurchaseHoldingAcsReader;
  readAuthenticatedUserId: () => Promise<string>;
  registry: TransferFactoryRegistryReader;
}>;

declare const factoryBrand: unique symbol;
export type FiveNorthBootstrapFactoryObservation = Readonly<{
  observationId: `sha256:${string}`;
  observedAt: string;
  readonly [factoryBrand]: true;
}>;

type FactoryState = {
  capturedAt: number;
  claimed: boolean;
  factoryId: string;
  policyDigest: `sha256:${string}`;
  readiness: FiveNorthCapabilityReadinessObservation;
};

const states = new WeakMap<object, FactoryState>();

function holdingRequest(
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

function ledgerOffset(value: unknown): number {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("bootstrap holding ledger end must be an object");
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).join(",") !== "offset" ||
    !Number.isSafeInteger(record.offset) ||
    (record.offset as number) < 0
  ) {
    throw new Error("bootstrap holding ledger offset is invalid");
  }
  return record.offset as number;
}

function assertFresh(capturedAt: number): void {
  const age = Date.now() - capturedAt;
  if (age < -CLOCK_ROLLBACK_TOLERANCE_MS) {
    throw new Error("bootstrap factory clock moved backwards");
  }
  if (age > MAXIMUM_AGE_MS) {
    throw new Error("bootstrap factory observation is stale");
  }
}

export function createFiveNorthBootstrapFactoryObserver(
  readers: BootstrapFactoryReaders,
): (
  readiness: FiveNorthCapabilityReadinessObservation,
  policy: FiveNorthCapabilityPolicy,
) => Promise<FiveNorthBootstrapFactoryObservation> {
  return async (readiness, candidatePolicy) => {
    const acquisitionStartedAt = Date.now();
    const policy = validateFiveNorthCapabilityPolicy(
      candidatePolicy,
      acquisitionStartedAt,
    );
    const scope = {
      agentParty: policy.value.agentParty,
      payerParty: policy.value.payerParty,
    };
    const authority = readFiveNorthCapabilityReadiness(readiness, scope);
    const [userId, ledgerEnd] = await Promise.all([
      readers.readAuthenticatedUserId(),
      readers.holdings.readLedgerEnd(),
    ]);
    if (userId !== authority.userId) {
      throw new Error("bootstrap factory authenticated user does not match");
    }
    const activeAtOffset = ledgerOffset(ledgerEnd);
    const selected = selectPurchaseHoldingsByCriteria(
      await readers.holdings.readActiveContracts(
        holdingRequest(policy.value.payerParty, activeAtOffset),
      ),
      {
        debitCeilingAtomic: policy.value.maximumTotalDebitAtomic,
        instrument: { admin: authority.expectedAdmin, id: "Amulet" },
        payerParty: policy.value.payerParty,
        synchronizerId: authority.synchronizerId,
      },
    );
    const probe = buildTransferFactoryBootstrapProbe({
      amountAtomic: policy.value.perCallLimitAtomic,
      executeBefore: new Date(
        acquisitionStartedAt + PROBE_WINDOW_MS,
      ).toISOString(),
      expectedAdmin: authority.expectedAdmin,
      inputHoldingCids: selected.map(({ disclosure }) => disclosure.contractId),
      payerParty: policy.value.payerParty,
      recipientParty: policy.value.allowedRecipient,
      requestedAt: new Date(acquisitionStartedAt).toISOString(),
    });
    const request = Object.freeze({
      registryAdmin: authority.expectedAdmin,
      path: TRANSFER_FACTORY_REGISTRY_PATH,
      method: "POST" as const,
      contentType: "application/json" as const,
      redirect: "error" as const,
      timeoutMilliseconds: REGISTRY_TIMEOUT_MS,
      maximumResponseBytes: MAX_REGISTRY_RESPONSE_BYTES,
      body: JSON.stringify({
        choiceArguments: probe.choiceArguments,
        excludeDebugFields: true,
      }),
    });
    const parsed = parseTransferFactoryBootstrapResponse(
      await readers.registry(request),
      {
        choiceArgumentsDigest: probe.choiceArgumentsDigest,
        synchronizerId: authority.synchronizerId,
      },
    );
    if ((await readers.readAuthenticatedUserId()) !== authority.userId) {
      throw new Error("bootstrap factory authenticated user changed");
    }
    readFiveNorthCapabilityReadiness(readiness, scope);
    const capturedAt = Date.now();
    if (
      capturedAt < acquisitionStartedAt - CLOCK_ROLLBACK_TOLERANCE_MS ||
      capturedAt - acquisitionStartedAt > MAXIMUM_AGE_MS
    ) {
      throw new Error("bootstrap factory acquisition is stale");
    }
    const observation = Object.freeze({
      observationId: `sha256:${randomBytes(32).toString("hex")}`,
      observedAt: new Date(capturedAt).toISOString(),
    }) as FiveNorthBootstrapFactoryObservation;
    states.set(observation, {
      capturedAt: acquisitionStartedAt,
      claimed: false,
      factoryId: parsed.factoryId,
      policyDigest: policy.digest,
      readiness,
    });
    return observation;
  };
}

export function buildFiveNorthCapabilityBootstrap(
  readiness: FiveNorthCapabilityReadinessObservation,
  factory: FiveNorthBootstrapFactoryObservation,
  candidatePolicy: FiveNorthCapabilityPolicy,
) {
  const policy = validateFiveNorthCapabilityPolicy(candidatePolicy, Date.now());
  const authority = readFiveNorthCapabilityReadiness(readiness, policy.value);
  if (typeof factory !== "object" || factory === null) {
    throw new Error("bootstrap factory observation is not authenticated");
  }
  const state = states.get(factory);
  if (state === undefined) {
    throw new Error("bootstrap factory observation is not authenticated");
  }
  assertFresh(state.capturedAt);
  if (state.claimed) {
    throw new Error("bootstrap factory observation is already claimed");
  }
  if (state.readiness !== readiness || state.policyDigest !== policy.digest) {
    throw new Error("bootstrap factory policy or readiness does not match");
  }
  const request = buildBoundedCapabilityBootstrap({
    ...policy.value,
    instrument: { admin: authority.expectedAdmin, id: "Amulet" },
    synchronizerId: authority.synchronizerId,
    transferFactoryContractId: state.factoryId,
    userId: authority.userId,
  });
  state.claimed = true;
  return request;
}
