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
import {
  prepareOnlyPurchase,
  type PrepareOnlyPurchaseInput,
} from "../src/prepare-only-purchase.js";

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

function shortPaymentRequiredResponse(): Response {
  const challenge = JSON.parse(
    new TextDecoder().decode(readChallengeBytes(createPurchaseInput())),
  ) as {
    accepts: Array<{
      extra: { executeBeforeSeconds: number };
      maxTimeoutSeconds: number;
    }>;
  };
  challenge.accepts[0]!.extra.executeBeforeSeconds = 4;
  challenge.accepts[0]!.maxTimeoutSeconds = 4;
  return new Response(null, {
    headers: {
      "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(challenge)).toString(
        "base64",
      ),
    },
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

function purchaseInput(
  source: FiveNorthPurchaseReaders,
  overrides: Partial<PrepareOnlyPurchaseInput> = {},
): PrepareOnlyPurchaseInput {
  return {
    authorizationInstanceId: AUTHORIZATION_INSTANCE,
    capabilityContractId: "00capability7",
    createReaders: () => source,
    expectedAdmin: "DSO::1220dso",
    expectedNetwork: "canton:devnet",
    fetchAuthorized: async () => paymentRequiredResponse(),
    method: "GET",
    payerParty: PAYER,
    resourceUrl: RESOURCE_URL,
    tokenFactoryContractId: "00tokenfactory7",
    ...overrides,
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
    const source = await readers();
    const createReaders = vi.fn(() => source);
    const provider = vi.fn(async (_url: URL, init: RequestInit) => {
      expect(new Headers(init.headers).has("PAYMENT-SIGNATURE")).toBe(false);
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return paymentRequiredResponse();
    });
    const result = await prepareOnlyPurchase(
      purchaseInput(source, { createReaders, fetchAuthorized: provider }),
    );
    const expected = await expectedIntent();

    expect(provider).toHaveBeenCalledOnce();
    expect(createReaders).toHaveBeenCalledWith(expect.any(AbortSignal));
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
      prepareOnlyPurchase(
        purchaseInput(source, {
          fetchAuthorized: async () => {
            throw new Error("provider is not authorized");
          },
        }),
      ),
    ).rejects.toThrow("not authorized");
    expect(prepared).not.toHaveBeenCalled();
  });

  it.each([0, 30_001, 1.5, Number.POSITIVE_INFINITY])(
    "rejects invalid total timeout %s before I/O",
    async (timeoutMilliseconds) => {
      const source = await readers();
      const provider = vi.fn(async () => paymentRequiredResponse());
      const createReaders = vi.fn(() => source);

      await expect(
        prepareOnlyPurchase(
          purchaseInput(source, {
            createReaders,
            fetchAuthorized: provider,
            timeoutMilliseconds,
          }),
        ),
      ).rejects.toThrow(/timeout/i);
      expect(provider).not.toHaveBeenCalled();
      expect(createReaders).not.toHaveBeenCalled();
    },
  );

  it("sanitizes caller cancellation before any I/O", async () => {
    const source = await readers();
    const controller = new AbortController();
    controller.abort("never expose this private reason");
    const provider = vi.fn(async () => paymentRequiredResponse());
    const createReaders = vi.fn(() => source);

    const promise = prepareOnlyPurchase(
      purchaseInput(source, {
        createReaders,
        fetchAuthorized: provider,
        signal: controller.signal,
      }),
    );
    await expect(promise).rejects.toThrow("purchase cancelled");
    await expect(promise).rejects.not.toThrow(/private reason/);
    expect(provider).not.toHaveBeenCalled();
    expect(createReaders).not.toHaveBeenCalled();
  });

  it("stops before registry and prepare when cancelled after capability read", async () => {
    const source = await readers();
    const controller = new AbortController();
    const capability = source.capability;
    const registry = vi.spyOn(source, "registry");
    const prepared = vi.spyOn(source, "prepared");
    const cancelledSource: FiveNorthPurchaseReaders = {
      ...source,
      capability: vi.fn(async (contractId) => {
        const result = await capability(contractId);
        controller.abort("sensitive cancellation reason");
        return result;
      }),
    };

    const promise = prepareOnlyPurchase(
      purchaseInput(cancelledSource, { signal: controller.signal }),
    );
    await expect(promise).rejects.toThrow("purchase cancelled");
    await expect(promise).rejects.not.toThrow(/sensitive/);
    expect(registry).not.toHaveBeenCalled();
    expect(prepared).not.toHaveBeenCalled();
  });

  it("rejects a challenge without the five-second preparation reserve", async () => {
    const source = await readers();
    const createReaders = vi.fn(() => source);

    await expect(
      prepareOnlyPurchase(
        purchaseInput(source, {
          createReaders,
          fetchAuthorized: async () => shortPaymentRequiredResponse(),
        }),
      ),
    ).rejects.toThrow(/deadline/i);
    expect(createReaders).not.toHaveBeenCalled();
  });
});
