import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  capturePaymentRequiredResponse,
  commitBoundedPurchase,
  commitHttpRequest,
  createPurchaseCapabilityObserver,
  readBoundedPurchaseLedgerIntent,
  type AuthenticatedPackagePreferenceProjection,
  type BoundedPurchaseLedgerIntent,
} from "@sotto/x402-canton";
import { preparedPurchaseBytes } from "../../../packages/x402-canton/test/prepared-purchase.fixtures.js";
import { createdCapabilityEvent } from "../../../packages/x402-canton/test/purchase-capability-observation.fixtures.js";
import {
  AGENT,
  createPurchaseInput,
  PAYER,
  readChallengeBytes,
  RESOURCE_URL,
} from "../../../packages/x402-canton/test/purchase-commitment.fixtures.js";
import { holdingEntry } from "../../../packages/x402-canton/test/purchase-holding-observation.fixtures.js";
import {
  factoryResponse,
  responseBytes,
} from "../../../packages/x402-canton/test/transfer-factory-observation.fixtures.js";
import type { FiveNorthPurchaseReaders } from "../src/five-north-purchase-readers.js";
import { prepareOnlyPurchase } from "../src/prepare-only-purchase.js";
import { claimPrepareOnlyPackageSelection } from "./prepare-only-package-selection.fixture.js";

const AUTHORIZATION_INSTANCE = "prepare-only-authorization-1";
const challengeHeader = Buffer.from(
  readChallengeBytes(createPurchaseInput()),
).toString("base64");

function paymentRequiredResponse(): Response {
  return new Response(null, {
    headers: { "PAYMENT-REQUIRED": challengeHeader },
    status: 402,
  });
}

function preparedResponse(transaction: Uint8Array): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      preparedTransaction: Buffer.from(transaction).toString("base64"),
      preparedTransactionHash: Buffer.alloc(32, 7).toString("base64"),
      hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
      hashingDetails: null,
      costEstimation: null,
    }),
  );
}

async function intentFor(
  packageSelection: AuthenticatedPackagePreferenceProjection,
  challengeObservedAt: number,
): Promise<BoundedPurchaseLedgerIntent> {
  const currentTime = Date.now();
  vi.setSystemTime(challengeObservedAt);
  try {
    const fixture = createPurchaseInput();
    const capability = await createPurchaseCapabilityObserver(async () => ({
      activeAtOffset: 42,
      createdEvent: createdCapabilityEvent(),
    }))("00capability7");
    return readBoundedPurchaseLedgerIntent(
      commitBoundedPurchase({
        authorizationInstanceId: AUTHORIZATION_INSTANCE,
        binding: commitHttpRequest({ method: "GET", url: RESOURCE_URL }),
        capability,
        expectedNetwork: "canton:devnet",
        packageSelection,
        paymentObservation: capturePaymentRequiredResponse(
          paymentRequiredResponse(),
        ),
        payerParty: PAYER,
        tokenFactory: fixture.tokenFactory,
      }),
    );
  } finally {
    vi.setSystemTime(currentTime);
  }
}

function baseInput(
  source: FiveNorthPurchaseReaders,
  claimPackageSelection: Parameters<
    typeof prepareOnlyPurchase
  >[0]["claimPackageSelection"],
) {
  return {
    authorizationInstanceId: AUTHORIZATION_INSTANCE,
    capabilityContractId: "00capability7",
    claimPackageSelection,
    createReaders: () => source,
    expectedAdmin: "DSO::1220dso",
    expectedNetwork: "canton:devnet" as const,
    fetchAuthorized: async () => paymentRequiredResponse(),
    method: "GET",
    payerParty: PAYER,
    resourceUrl: RESOURCE_URL,
    tokenFactoryContractId: "00tokenfactory7",
  };
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-07-13T10:00:00.000Z") });
});

afterEach(() => vi.useRealTimers());

it("acquires exact authenticated package scope after the observed 402", async () => {
  let intent: BoundedPurchaseLedgerIntent | undefined;
  const source: FiveNorthPurchaseReaders = {
    capability: async () => {
      vi.advanceTimersByTime(1);
      return { activeAtOffset: 42, createdEvent: createdCapabilityEvent() };
    },
    holdings: {
      readLedgerEnd: async () => ({ offset: 42 }),
      readActiveContracts: async () => [
        holdingEntry("00holding-a", "0.3250000000"),
      ],
    },
    registry: async () => {
      if (intent === undefined) throw new Error("intent was not committed");
      return responseBytes(factoryResponse(intent));
    },
    prepared: async ({ body }) => {
      if (intent === undefined) throw new Error("intent was not committed");
      return preparedResponse(preparedPurchaseBytes(intent, body));
    },
  };
  const claimPackageSelection = vi.fn(async (scope) => {
    expect(scope.signal).toBeInstanceOf(AbortSignal);
    const selection = await claimPrepareOnlyPackageSelection();
    intent = await intentFor(selection, Date.parse(scope.challengeObservedAt));
    return selection;
  });
  const provider = vi.fn(async () => {
    vi.advanceTimersByTime(1);
    return paymentRequiredResponse();
  });

  const result = await prepareOnlyPurchase({
    ...baseInput(source, claimPackageSelection),
    fetchAuthorized: provider,
  });

  expect(claimPackageSelection).toHaveBeenCalledWith({
    adminParty: "DSO::1220dso",
    agentParty: AGENT,
    challengeObservedAt: "2026-07-13T10:00:00.001Z",
    executeBefore: "2026-07-13T10:00:45.001Z",
    payerParty: PAYER,
    providerParty: "sotto-provider::1220provider",
    signal: expect.any(AbortSignal),
    synchronizerId: "global-domain::1220sync",
  });
  expect(result.purchaseCommitment).toBe(intent?.purchaseCommitment);
});
