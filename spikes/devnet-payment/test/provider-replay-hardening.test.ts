import { commitHttpRequest } from "@sotto/x402-canton";
import { describe, expect, it, vi } from "vitest";
import {
  createPaidResourceHandler,
  encodeSettlementProof,
  type SettlementProof,
} from "../src/provider.js";

const resourceUrl = "https://provider.example/paid/weather";
const proof = Object.freeze({
  attemptId: `sha256:${"a".repeat(64)}`,
  requestCommitment: commitHttpRequest({ method: "GET", url: resourceUrl })
    .commitment,
  updateId: `1220${"c".repeat(64)}`,
}) satisfies SettlementProof;

function encodeRawJson(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function paidHandler(verifySettlement = vi.fn(async () => true)) {
  return {
    handler: createPaidResourceHandler({
      amount: "2500000000",
      dsoParty: "DSO::1220dso",
      maxTimeoutSeconds: 60,
      payerParty: "sotto-spike-payer::1220participant",
      providerParty: "sotto-spike-provider::1220participant",
      resourceUrl,
      synchronizerId: "global-domain::1220sync",
      verifySettlement,
    }),
    verifySettlement,
  };
}

describe("provider settlement-proof canonical form", () => {
  it.each([
    ["unpadded base64", encodeSettlementProof(proof).replace(/=+$/u, "")],
    [
      "reordered JSON",
      encodeRawJson(
        JSON.stringify({
          updateId: proof.updateId,
          requestCommitment: proof.requestCommitment,
          attemptId: proof.attemptId,
        }),
      ),
    ],
    ["whitespace JSON", encodeRawJson(` ${JSON.stringify(proof)}`)],
    [
      "duplicate JSON key",
      encodeRawJson(
        `{"attemptId":"${proof.attemptId}","attemptId":"${proof.attemptId}","requestCommitment":"${proof.requestCommitment}","updateId":"${proof.updateId}"}`,
      ),
    ],
    [
      "unknown JSON key",
      encodeRawJson(JSON.stringify({ ...proof, extra: "not-authorized" })),
    ],
  ])("rejects %s before settlement verification", async (_name, header) => {
    const { handler, verifySettlement } = paidHandler();

    const response = await handler(
      new Request(resourceUrl, {
        headers: { "PAYMENT-SIGNATURE": header },
      }),
    );

    expect(response.status).toBe(400);
    expect(verifySettlement).not.toHaveBeenCalled();
  });
});

describe("provider delivery replay hardening", () => {
  it("coalesces concurrent delivery and replays the exact cached response", async () => {
    const verifySettlement = vi.fn(async () => true);
    let deliveryRun = 0;
    const deliverPaidResource = vi.fn(async () => {
      deliveryRun += 1;
      return new Response(
        JSON.stringify({ privateResult: "weather", run: deliveryRun }),
        {
          headers: {
            "content-type": "application/json",
            "x-delivery-run": String(deliveryRun),
          },
          status: 200,
          statusText: "Paid",
        },
      );
    });
    const handler = createPaidResourceHandler({
      amount: "2500000000",
      deliverPaidResource,
      dsoParty: "DSO::1220dso",
      maxTimeoutSeconds: 60,
      payerParty: "sotto-spike-payer::1220participant",
      providerParty: "sotto-spike-provider::1220participant",
      resourceUrl,
      synchronizerId: "global-domain::1220sync",
      verifySettlement,
    });
    const request = () =>
      new Request(resourceUrl, {
        headers: { "PAYMENT-SIGNATURE": encodeSettlementProof(proof) },
      });

    const [first, concurrent] = await Promise.all([
      handler(request()),
      handler(request()),
    ]);
    const retry = await handler(request());

    expect(verifySettlement).toHaveBeenCalledOnce();
    expect(deliverPaidResource).toHaveBeenCalledOnce();
    expect(deliverPaidResource).toHaveBeenCalledWith(proof);
    expect(
      await Promise.all(
        [first, concurrent, retry].map(async (response) => ({
          body: await response.text(),
          contentType: response.headers.get("content-type"),
          deliveryRun: response.headers.get("x-delivery-run"),
          status: response.status,
          statusText: response.statusText,
        })),
      ),
    ).toEqual(
      Array.from({ length: 3 }, () => ({
        body: '{"privateResult":"weather","run":1}',
        contentType: "application/json",
        deliveryRun: "1",
        status: 200,
        statusText: "Paid",
      })),
    );
  });

  it("retries verification when settlement was not visible yet", async () => {
    const verifySettlement = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const deliverPaidResource = vi.fn(async () =>
      Response.json({ privateResult: "delivered" }),
    );
    const handler = createPaidResourceHandler({
      amount: "2500000000",
      deliverPaidResource,
      dsoParty: "DSO::1220dso",
      maxTimeoutSeconds: 60,
      payerParty: "sotto-spike-payer::1220participant",
      providerParty: "sotto-spike-provider::1220participant",
      resourceUrl,
      synchronizerId: "global-domain::1220sync",
      verifySettlement,
    });
    const request = () =>
      new Request(resourceUrl, {
        headers: { "PAYMENT-SIGNATURE": encodeSettlementProof(proof) },
      });

    expect((await handler(request())).status).toBe(402);
    expect((await handler(request())).status).toBe(200);
    expect(verifySettlement).toHaveBeenCalledTimes(2);
    expect(deliverPaidResource).toHaveBeenCalledOnce();
  });
});
