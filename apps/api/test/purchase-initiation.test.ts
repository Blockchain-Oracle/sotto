import { describe, expect, it } from "vitest";
import type { HumanPurchaseLedgerIntent } from "@sotto/x402-canton";
import type { HumanPurchaseAttemptResult } from "@sotto/database";
import { createPurchaseBindingRegistry } from "../src/services/purchase-binding.js";
import { createPurchaseInitiation } from "../src/services/purchase-initiation.js";
import { publishedResource, TEST_PARTY } from "./fakes.js";

const RESOURCE = publishedResource();
const URL_UNDER_TEST = "https://weather.example.com/weather/current";
const PAYER = `sotto-owner::1220${"a".repeat(64)}`;
const ATTEMPT_ID = `sha256:${"e".repeat(64)}` as const;

function challengeResponse(amount: string, recipient: string): Response {
  const challenge = {
    x402Version: 2,
    resource: { url: URL_UNDER_TEST },
    accepts: [
      {
        scheme: "exact",
        network: "canton:devnet",
        amount,
        asset: "CC",
        payTo: recipient,
        maxTimeoutSeconds: 600,
        extra: {
          assetTransferMethod: "transfer-factory",
          executeBeforeSeconds: 600,
          feePayer: PAYER,
          instrumentId: { admin: "DSO::1220dso", id: "Amulet" },
          synchronizerId: `global-domain::1220${"b".repeat(64)}`,
        },
      },
    ],
  };
  return new Response(null, {
    status: 402,
    headers: {
      "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(challenge)).toString(
        "base64",
      ),
    },
  });
}

const session = Object.freeze({ ownerId: "owner-1", partyId: TEST_PARTY });

function catalogWith(resource = RESOURCE) {
  return {
    listResources: async () => Object.freeze([resource]),
    resourceByListing: async (listingId: string) =>
      listingId === "listing-1" ? resource : null,
    latestHealth: async () => null,
  };
}

function fakeIntent(): HumanPurchaseLedgerIntent {
  return {
    attemptId: ATTEMPT_ID,
    request: {
      method: "GET",
      resourceOrigin: "https://weather.example.com",
      resourcePath: "/weather/current",
      requestCommitment: `sha256:${"f".repeat(64)}`,
    },
    challenge: { executeBefore: "2026-07-19T00:10:00.000Z" },
  } as unknown as HumanPurchaseLedgerIntent;
}

describe("purchase initiation", () => {
  it("stops with 409 and both facts when the live price changed", async () => {
    const initiation = createPurchaseInitiation({
      catalog: catalogWith(),
      binding: createPurchaseBindingRegistry(),
      repository: {
        initializeHumanPurchaseAttempt: async () => {
          throw new Error("must not initialize on a changed price");
        },
      },
      assembler: undefined,
      fetch402: async () => challengeResponse("9999999999", RESOURCE.recipient),
    });
    const outcome = await initiation.initiate({
      listingId: "listing-1",
      session,
      signal: AbortSignal.timeout(5_000),
    });
    expect(outcome.status).toBe(409);
    expect(outcome.body).toMatchObject({
      error: "price-changed",
      price: {
        changed: true,
        indexed: { amountAtomic: "2500000000" },
        observed: { amountAtomic: "9999999999" },
      },
    });
  });

  it("rejects a non-402 answer as an invalid challenge", async () => {
    const initiation = createPurchaseInitiation({
      catalog: catalogWith(),
      binding: createPurchaseBindingRegistry(),
      repository: {
        initializeHumanPurchaseAttempt: async () => {
          throw new Error("unreachable");
        },
      },
      assembler: undefined,
      fetch402: async () => new Response("ok", { status: 200 }),
    });
    const outcome = await initiation.initiate({
      listingId: "listing-1",
      session,
      signal: AbortSignal.timeout(5_000),
    });
    expect(outcome.status).toBe(502);
    expect(outcome.body).toMatchObject({ error: "challenge-invalid" });
  });

  it("answers 503 five-north-unavailable without DevNet configuration", async () => {
    const initiation = createPurchaseInitiation({
      catalog: catalogWith(),
      binding: createPurchaseBindingRegistry(),
      repository: {
        initializeHumanPurchaseAttempt: async () => {
          throw new Error("unreachable");
        },
      },
      assembler: undefined,
      fetch402: async () =>
        challengeResponse(RESOURCE.amountAtomic, RESOURCE.recipient),
    });
    const outcome = await initiation.initiate({
      listingId: "listing-1",
      session,
      signal: AbortSignal.timeout(5_000),
    });
    expect(outcome.status).toBe(503);
    expect(outcome.body).toMatchObject({ error: "five-north-unavailable" });
  });

  it("initializes through the assembler and binds the buyer owner", async () => {
    const binding = createPurchaseBindingRegistry();
    const initialized: HumanPurchaseLedgerIntent[] = [];
    const initiation = createPurchaseInitiation({
      catalog: catalogWith(),
      binding,
      repository: {
        initializeHumanPurchaseAttempt: async (intent) => {
          initialized.push(intent);
          return {
            outcome: "created",
            attemptId: intent.attemptId,
            state: "intent-created",
            commandId: "sotto-human-purchase-v1-test",
          } as unknown as HumanPurchaseAttemptResult;
        },
      },
      assembler: async (input) => {
        expect(input.request).toEqual({ method: "GET", url: URL_UNDER_TEST });
        expect(input.providerParty).toBe(RESOURCE.recipient);
        expect(input.partyId).toBe(TEST_PARTY);
        return { intent: fakeIntent(), beginExclusive: 42 };
      },
      fetch402: async () =>
        challengeResponse(RESOURCE.amountAtomic, RESOURCE.recipient),
    });
    const outcome = await initiation.initiate({
      listingId: "listing-1",
      session,
      signal: AbortSignal.timeout(5_000),
    });
    expect(outcome.status).toBe(201);
    expect(outcome.body).toMatchObject({
      attemptId: ATTEMPT_ID,
      outcome: "created",
      state: "intent-created",
      price: { changed: false },
    });
    expect(initialized).toHaveLength(1);
    await expect(
      binding.resolver({
        attemptId: ATTEMPT_ID,
        resource: {
          method: "GET",
          origin: "https://weather.example.com",
          path: "/weather/current",
        },
      } as never),
    ).resolves.toEqual({
      ownerId: "owner-1",
      resourceRevisionId: RESOURCE.resourceRevisionId,
      beginExclusive: 42,
    });
  });

  it("404s an unknown listing and 502s an unreachable provider", async () => {
    const initiation = createPurchaseInitiation({
      catalog: catalogWith(),
      binding: createPurchaseBindingRegistry(),
      repository: {
        initializeHumanPurchaseAttempt: async () => {
          throw new Error("unreachable");
        },
      },
      assembler: undefined,
      fetch402: async () => {
        throw new Error("connection refused");
      },
    });
    const unknown = await initiation.initiate({
      listingId: "listing-9",
      session,
      signal: AbortSignal.timeout(5_000),
    });
    expect(unknown.status).toBe(404);
    const unreachable = await initiation.initiate({
      listingId: "listing-1",
      session,
      signal: AbortSignal.timeout(5_000),
    });
    expect(unreachable.status).toBe(502);
    expect(unreachable.body).toMatchObject({ error: "provider-unreachable" });
  });
});
