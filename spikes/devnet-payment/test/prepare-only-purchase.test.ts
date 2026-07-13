import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  capturePaymentRequiredResponse,
  commitBoundedPurchase,
  commitHttpRequest,
  createPurchaseCapabilityObserver,
  readBoundedPurchaseLedgerIntent,
} from "@sotto/x402-canton";
import { preparedPurchaseBytes } from "../../../packages/x402-canton/test/prepared-purchase.fixtures.js";
import { createdCapabilityEvent } from "../../../packages/x402-canton/test/purchase-capability-observation.fixtures.js";
import {
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

async function expectedIntent() {
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
      paymentObservation: capturePaymentRequiredResponse(
        paymentRequiredResponse(),
      ),
      payerParty: PAYER,
      tokenFactory: fixture.tokenFactory,
    }),
  );
}

async function readers(): Promise<FiveNorthPurchaseReaders> {
  const intent = await expectedIntent();
  return {
    capability: async () => ({
      activeAtOffset: 42,
      createdEvent: createdCapabilityEvent(),
    }),
    holdings: {
      readLedgerEnd: async () => ({ offset: 42 }),
      readActiveContracts: async () => [
        holdingEntry("00holding-a", "0.3250000000"),
      ],
    },
    registry: async () => responseBytes(factoryResponse(intent)),
    prepared: async ({ body }) =>
      preparedResponse(preparedPurchaseBytes(intent, body)),
  };
}

describe("prepare-only bounded purchase", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:00.000Z") });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stops after one authentic bounded preparation with redacted output", async () => {
    const authorizeUrl = vi.fn(async () => undefined);
    const provider = vi.fn(async (_url: string, init: RequestInit) => {
      expect(new Headers(init.headers).has("PAYMENT-SIGNATURE")).toBe(false);
      return paymentRequiredResponse();
    });
    const result = await prepareOnlyPurchase({
      authorizationInstanceId: AUTHORIZATION_INSTANCE,
      authorizeUrl,
      capabilityContractId: "00capability7",
      expectedAdmin: "DSO::1220dso",
      expectedNetwork: "canton:devnet",
      fetcher: provider,
      method: "GET",
      payerParty: PAYER,
      readers: await readers(),
      resourceUrl: RESOURCE_URL,
      tokenFactoryContractId: "00tokenfactory7",
    });
    const expected = await expectedIntent();

    expect(authorizeUrl).toHaveBeenCalledOnce();
    expect(provider).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      attemptId: expected.attemptId,
      prepared: {
        observationId: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        preparedTransactionHash: Buffer.alloc(32, 7).toString("base64"),
      },
      purchaseCommitment: expected.purchaseCommitment,
      status: "prepared-not-signed",
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('"preparedTransaction":');
    expect(serialized).not.toContain("PAYMENT-SIGNATURE");
    expect(result).not.toHaveProperty("execute");
    expect(result).not.toHaveProperty("sign");
  });

  it("does not prepare when URL authority rejects the provider", async () => {
    const source = await readers();
    const prepared = vi.spyOn(source, "prepared");

    await expect(
      prepareOnlyPurchase({
        authorizationInstanceId: AUTHORIZATION_INSTANCE,
        authorizeUrl: async () => {
          throw new Error("provider is not authorized");
        },
        capabilityContractId: "00capability7",
        expectedAdmin: "DSO::1220dso",
        expectedNetwork: "canton:devnet",
        fetcher: async () => paymentRequiredResponse(),
        method: "GET",
        payerParty: PAYER,
        readers: source,
        resourceUrl: RESOURCE_URL,
        tokenFactoryContractId: "00tokenfactory7",
      }),
    ).rejects.toThrow("not authorized");
    expect(prepared).not.toHaveBeenCalled();
  });
});
