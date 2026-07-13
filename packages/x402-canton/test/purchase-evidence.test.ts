import { describe, expect, it } from "vitest";
import {
  commitBoundedPurchase,
  createBoundedPurchaseEvidence,
  type BoundedPurchaseCommitment,
} from "../src/index.js";
import {
  createPurchaseInput,
  replaceBoundRequest,
  RESOURCE_URL,
} from "./purchase-commitment.fixtures.js";

describe("bounded purchase evidence", () => {
  it("projects only the approved hash identifiers", () => {
    const input = replaceBoundRequest(createPurchaseInput(), {
      body: new TextEncoder().encode('{"private":"Kigali forecast"}'),
      headers: [
        ["content-type", "application/json"],
        ["idempotency-key", "private-purchase-7"],
      ],
      method: "POST",
      url: `${RESOURCE_URL}&access_token=private-token`,
    });
    const result = commitBoundedPurchase(input);
    const evidence = createBoundedPurchaseEvidence(result);

    expect(Object.keys(evidence).sort()).toEqual(
      [
        "attemptId",
        "authorizationMode",
        "bodyHash",
        "challengeId",
        "purchaseCommitment",
        "requestCommitment",
        "version",
      ].sort(),
    );
    expect(evidence).toEqual({
      attemptId: result.attemptId,
      authorizationMode: "bounded-capability",
      bodyHash: `sha256:${input.binding.bodySha256}`,
      challengeId: result.challengeId,
      purchaseCommitment: result.commitment,
      requestCommitment: input.binding.commitment,
      version: "sotto-purchase-v2",
    });

    const serialized = JSON.stringify(evidence);
    for (const forbidden of [
      "Kigali forecast",
      "private-token",
      "private-purchase-7",
      "provider.example",
      "authorization-7",
      "00capability7",
      "00tokenfactory7",
      "sotto-agent",
      "sotto-payer",
      "sotto-provider",
      "Sotto.Control.PurchaseCapability",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "canonicalBytes",
      "challengeBytes",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("does not retain raw challenge input on the commitment result", () => {
    const result = commitBoundedPurchase(createPurchaseInput());
    expect(result).not.toHaveProperty("challengeBytes");
    expect(result).not.toHaveProperty("authorizationInstanceId");
  });

  it("rejects a structurally valid but unauthenticated commitment object", () => {
    const hash = `sha256:${"0".repeat(64)}` as const;
    const forged = {
      attemptId: hash,
      bodyHash: hash,
      canonicalBytes: new TextEncoder().encode("{}"),
      challengeId: hash,
      commitment: hash,
      expiresAt: "not-a-time",
      requestCommitment: hash,
      version: "sotto-purchase-v2",
    } as BoundedPurchaseCommitment;

    expect(() => createBoundedPurchaseEvidence(forged)).toThrow(
      "authenticated",
    );
  });

  it("rejects canonical bytes mutated after commitment", () => {
    const result = commitBoundedPurchase(createPurchaseInput());
    result.canonicalBytes[0] = 0x5b;

    expect(() => createBoundedPurchaseEvidence(result)).toThrow("mutated");
  });
});
