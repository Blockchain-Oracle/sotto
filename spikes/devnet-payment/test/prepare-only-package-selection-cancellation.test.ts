import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createdCapabilityEvent } from "../../../packages/x402-canton/test/purchase-capability-observation.fixtures.js";
import {
  createPurchaseInput,
  PAYER,
  readChallengeBytes,
  RESOURCE_URL,
} from "../../../packages/x402-canton/test/purchase-commitment.fixtures.js";
import type { FiveNorthPurchaseReaders } from "../src/five-north-purchase-readers.js";
import { prepareOnlyPurchase } from "../src/prepare-only-purchase.js";

const challengeHeader = Buffer.from(
  readChallengeBytes(createPurchaseInput()),
).toString("base64");

function paymentRequiredResponse(): Response {
  return new Response(null, {
    headers: { "PAYMENT-REQUIRED": challengeHeader },
    status: 402,
  });
}

function blockedReaders() {
  const holdings = vi.fn();
  const registry = vi.fn();
  const prepared = vi.fn();
  const source: FiveNorthPurchaseReaders = {
    capability: async () => ({
      activeAtOffset: 42,
      createdEvent: createdCapabilityEvent(),
    }),
    holdings: {
      readLedgerEnd: holdings,
      readActiveContracts: holdings,
    },
    registry,
    prepared,
  };
  return { holdings, prepared, registry, source };
}

function purchaseInput(
  source: FiveNorthPurchaseReaders,
  claimPackageSelection: Parameters<
    typeof prepareOnlyPurchase
  >[0]["claimPackageSelection"],
) {
  return {
    authorizationInstanceId: "prepare-only-authorization-1",
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

it("cancels a hung package acquisition before later reads", async () => {
  const controller = new AbortController();
  const { holdings, prepared, registry, source } = blockedReaders();
  let started!: () => void;
  const acquisitionStarted = new Promise<void>(
    (resolve) => (started = resolve),
  );
  const purchase = prepareOnlyPurchase({
    ...purchaseInput(source, async ({ signal }) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      started();
      return new Promise<never>(() => undefined);
    }),
    signal: controller.signal,
  });
  let rejection: unknown;
  void purchase.catch((error: unknown) => {
    rejection = error;
  });

  await acquisitionStarted;
  controller.abort("private caller reason");
  await Promise.resolve();
  await Promise.resolve();

  expect(rejection).toEqual(new Error("prepare-only purchase cancelled"));
  expect(holdings).not.toHaveBeenCalled();
  expect(registry).not.toHaveBeenCalled();
  expect(prepared).not.toHaveBeenCalled();
});

it("enforces the outer deadline while package acquisition hangs", async () => {
  vi.useRealTimers();
  const { holdings, prepared, registry, source } = blockedReaders();
  const purchase = prepareOnlyPurchase({
    ...purchaseInput(source, async () => new Promise<never>(() => undefined)),
    timeoutMilliseconds: 10,
  });
  let rejection: unknown;
  void purchase.catch((error: unknown) => {
    rejection = error;
  });

  await new Promise((resolve) => setTimeout(resolve, 30));

  expect(rejection).toEqual(
    new Error("prepare-only purchase deadline exceeded"),
  );
  expect(holdings).not.toHaveBeenCalled();
  expect(registry).not.toHaveBeenCalled();
  expect(prepared).not.toHaveBeenCalled();
});
