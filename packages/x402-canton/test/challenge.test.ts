import { describe, expect, it } from "vitest";
import { parsePaymentChallenge, verifyPreparedPayment } from "../src/index.js";

const validChallenge = {
  amount: "1.25",
  asset: "USDC",
  expiresAt: "2026-07-12T16:00:00.000Z",
  network: "canton:five-north-devnet",
  recipient: "provider::1220abc",
  requestHash: "sha256:request",
};

describe("parsePaymentChallenge", () => {
  it("accepts explicit Canton payment authority fields", () => {
    expect(parsePaymentChallenge(validChallenge)).toEqual(validChallenge);
  });

  it("rejects a missing request binding", () => {
    const unbound: Record<string, string> = { ...validChallenge };
    Reflect.deleteProperty(unbound, "requestHash");
    expect(() => parsePaymentChallenge(unbound)).toThrow("requestHash");
  });
});

describe("verifyPreparedPayment", () => {
  it("rejects a recipient mutation", () => {
    expect(() =>
      verifyPreparedPayment(validChallenge, {
        ...validChallenge,
        recipient: "attacker::1220def",
      }),
    ).toThrow("recipient");
  });
});
