import { describe, expect, it, vi } from "vitest";
import { commitHttpRequest } from "@sotto/x402-canton";
import {
  createPaidResourceHandler,
  encodeSettlementProof,
  startPaidProvider,
} from "../src/provider.js";
import { decodePaymentRequired } from "../src/observation.js";

const resourceUrl = "https://provider.example/paid/weather";
const payer = "sotto-spike-payer::1220participant";
const provider = "sotto-spike-provider::1220participant";
const requestCommitment = commitHttpRequest({
  method: "GET",
  url: resourceUrl,
}).commitment;
const proof = {
  attemptId: `sha256:${"a".repeat(64)}`,
  requestCommitment,
  updateId: `1220${"c".repeat(64)}`,
} as const;

function handler(verified: boolean) {
  return createPaidResourceHandler({
    amount: "2500000000",
    dsoParty: "DSO::1220dso",
    maxTimeoutSeconds: 60,
    payerParty: payer,
    providerParty: provider,
    resourceUrl,
    synchronizerId: "global-domain::1220sync",
    verifySettlement: vi.fn(async () => verified),
  });
}

describe("createPaidResourceHandler", () => {
  it("returns a request-bound x402 challenge before payment", async () => {
    const response = await handler(false)(new Request(resourceUrl));
    const header = response.headers.get("PAYMENT-REQUIRED");

    expect(response.status).toBe(402);
    expect(header).not.toBeNull();
    const challenge = decodePaymentRequired(header ?? "");
    const requirement = challenge.accepts[0] as Record<string, unknown>;
    const extra = requirement.extra as Record<string, unknown>;
    expect(requirement).toMatchObject({
      amount: "2500000000",
      network: "canton:devnet",
      payTo: provider,
      scheme: "exact",
    });
    expect(extra).toMatchObject({
      assetTransferMethod: "amulet-rules-transfer",
      feePayer: payer,
      memo: commitHttpRequest({ method: "GET", url: resourceUrl }).commitment,
    });
  });

  it("advertises transfer-factory only for the bounded capability lane", async () => {
    const response = await createPaidResourceHandler({
      amount: "2500000000",
      assetTransferMethod: "transfer-factory",
      dsoParty: "DSO::1220dso",
      maxTimeoutSeconds: 60,
      payerParty: payer,
      providerParty: provider,
      resourceUrl,
      synchronizerId: "global-domain::1220sync",
      verifySettlement: vi.fn(async () => false),
    })(new Request(resourceUrl));
    const challenge = decodePaymentRequired(
      response.headers.get("PAYMENT-REQUIRED") ?? "",
    );
    const extra = (challenge.accepts[0] as Record<string, unknown>)
      .extra as Record<string, unknown>;

    expect(extra.assetTransferMethod).toBe("transfer-factory");
  });

  it("delivers only after independent settlement verification", async () => {
    const verifySettlement = vi.fn(async () => true);
    const paidHandler = createPaidResourceHandler({
      amount: "2500000000",
      dsoParty: "DSO::1220dso",
      maxTimeoutSeconds: 60,
      payerParty: payer,
      providerParty: provider,
      resourceUrl,
      synchronizerId: "global-domain::1220sync",
      verifySettlement,
    });
    const response = await paidHandler(
      new Request(resourceUrl, {
        headers: { "PAYMENT-SIGNATURE": encodeSettlementProof(proof) },
      }),
    );

    expect(verifySettlement).toHaveBeenCalledWith(proof);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ paid: true });
  });

  it("does not deliver for an unverified proof", async () => {
    const response = await handler(false)(
      new Request(resourceUrl, {
        headers: { "PAYMENT-SIGNATURE": encodeSettlementProof(proof) },
      }),
    );

    expect(response.status).toBe(402);
  });

  it("rejects a settlement proof for a different HTTP request", async () => {
    const verifySettlement = vi.fn(async () => true);
    const paidHandler = createPaidResourceHandler({
      amount: "2500000000",
      dsoParty: "DSO::1220dso",
      maxTimeoutSeconds: 60,
      payerParty: payer,
      providerParty: provider,
      resourceUrl,
      synchronizerId: "global-domain::1220sync",
      verifySettlement,
    });
    const response = await paidHandler(
      new Request(resourceUrl, {
        headers: {
          "PAYMENT-SIGNATURE": encodeSettlementProof({
            ...proof,
            requestCommitment: `sha256:${"d".repeat(64)}`,
          }),
        },
      }),
    );

    expect(response.status).toBe(402);
    expect(verifySettlement).not.toHaveBeenCalled();
  });

  it("serves the paid handler through a bounded local HTTP bridge", async () => {
    const server = await startPaidProvider({
      handler: handler(false),
      port: 0,
      resourceUrl,
    });
    try {
      const response = await fetch(server.localUrl);
      expect(response.status).toBe(402);
      expect(response.headers.get("PAYMENT-REQUIRED")).not.toBeNull();
    } finally {
      await server.close();
    }
  });

  it("preserves the incoming path and query at the local HTTP bridge", async () => {
    const server = await startPaidProvider({
      handler: handler(false),
      port: 0,
      resourceUrl,
    });
    try {
      const localUrl = new URL(server.localUrl);
      for (const target of ["/wrong-path", `${localUrl.pathname}?mutated=1`]) {
        const response = await fetch(new URL(target, localUrl.origin));
        expect(response.status).toBe(404);
      }
    } finally {
      await server.close();
    }
  });
});
