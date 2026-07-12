import { describe, expect, it } from "vitest";
import {
  commitHttpRequest,
  createPaymentAuthorization,
  type CantonPaymentRequirement,
} from "../src/index.js";

const requirement = {
  amount: "12500000000",
  asset: "CC",
  extra: {
    assetTransferMethod: "transfer-factory",
    executeBeforeSeconds: 45,
    feePayer: "facilitator::1220fee",
    instrumentId: { admin: "DSO::1220dso", id: "Amulet" },
    synchronizerId: "global-domain::1220sync",
  },
  maxTimeoutSeconds: 60,
  network: "canton:devnet",
  payTo: "provider::1220abc",
  scheme: "exact",
} as const satisfies CantonPaymentRequirement;
const binding = commitHttpRequest({
  body: new TextEncoder().encode('{"task":"private"}'),
  headers: [["content-type", "application/json"]],
  method: "POST",
  url: "https://provider.example/resource",
});

describe("createPaymentAuthorization", () => {
  it("binds one attempt to the exact request and live payment requirement", () => {
    const authorization = createPaymentAuthorization({
      attemptId: binding.commitment,
      binding,
      carriedRequestCommitment: binding.commitment,
      observedAt: "2026-07-12T15:59:00.000Z",
      payerParty: "sotto-payer::1220payer",
      requirement,
    });

    expect(authorization).toEqual({
      attemptId: binding.commitment,
      bindingVersion: "sotto-http-request-v1",
      expiresAt: "2026-07-12T15:59:45.000Z",
      payerParty: "sotto-payer::1220payer",
      requestCommitment: binding.commitment,
      requirement,
    });
  });

  it("rejects a carrier that does not contain the exact commitment", () => {
    expect(() =>
      createPaymentAuthorization({
        attemptId: binding.commitment,
        binding,
        carriedRequestCommitment: `sha256:${"0".repeat(64)}`,
        observedAt: "2026-07-12T15:59:00.000Z",
        payerParty: "sotto-payer::1220payer",
        requirement,
      }),
    ).toThrow("request commitment");
  });
});
