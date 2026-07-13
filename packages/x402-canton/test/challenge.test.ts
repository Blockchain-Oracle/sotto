import { describe, expect, it } from "vitest";
import { parsePaymentChallenge } from "../src/index.js";

const validChallenge = {
  amount: "12500000000",
  asset: "CC",
  extra: {
    assetTransferMethod: "transfer-factory",
    executeBeforeSeconds: 60,
    feePayer: "facilitator::1220fee",
    instrumentId: { admin: "DSO::1220dso", id: "Amulet" },
    memo: "sotto-attempt",
    synchronizerId: "global-domain::1220sync",
  },
  maxTimeoutSeconds: 60,
  network: "canton:devnet",
  payTo: "provider::1220abc",
  scheme: "exact",
};

describe("parsePaymentChallenge", () => {
  it("accepts the published FTPtech 0.6.0 requirement shape", () => {
    const parsed = parsePaymentChallenge(validChallenge);

    expect(parsed).toEqual(validChallenge);
    expect(parsed).not.toHaveProperty("expiresAt");
    expect(parsed).not.toHaveProperty("requestHash");
  });

  it("accepts the evidenced Five North direct Amulet transfer method", () => {
    const challenge = {
      ...validChallenge,
      extra: {
        ...validChallenge.extra,
        assetTransferMethod: "amulet-rules-transfer",
      },
    };

    expect(parsePaymentChallenge(challenge)).toEqual(challenge);
  });

  it.each([
    ["fractional atomic amount", { amount: "1.25" }, "atomic integer"],
    [
      "unsupported transfer method",
      { extra: { ...validChallenge.extra, assetTransferMethod: "lock" } },
      "supported",
    ],
    [
      "missing synchronizer",
      { extra: { ...validChallenge.extra, synchronizerId: "" } },
      "synchronizerId",
    ],
    [
      "execution window beyond timeout",
      { extra: { ...validChallenge.extra, executeBeforeSeconds: 61 } },
      "maxTimeoutSeconds",
    ],
    [
      "inconsistent structured asset",
      { asset: "OTHER::Token" },
      "instrumentId",
    ],
  ] as const)("rejects %s", (_name, mutation, message) => {
    expect(() =>
      parsePaymentChallenge({ ...validChallenge, ...mutation }),
    ).toThrow(message);
  });
});
