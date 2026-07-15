import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCapabilityWalletSigningSession } from "../src/index.js";
import {
  APPROVED_SIGNATURE,
  CONNECTOR_ID,
  CONNECTOR_ORIGIN,
  recordingConnector,
  verifiedCapabilityBootstrap,
} from "./capability-wallet-connector.fixtures.js";

describe("capability wallet response discriminators", () => {
  beforeEach(() =>
    vi.useFakeTimers({ now: new Date("2026-07-15T10:00:00.000Z") }),
  );
  afterEach(() => vi.useRealTimers());

  it.each([
    ["legacy signature format", { signatureFormat: "SIGNATURE_FORMAT_RAW" }],
    ["unknown algorithm", { signingAlgorithm: "SIGNING_ALGORITHM_ED_25519" }],
    [
      "cross-paired scheme",
      { signingAlgorithm: "SIGNING_ALGORITHM_SPEC_EC_DSA_SHA_256" },
    ],
  ])("rejects an unnegotiated response %s", async (_label, mutation) => {
    const prepared = await verifiedCapabilityBootstrap();

    await expect(
      createCapabilityWalletSigningSession({
        connector: recordingConnector({
          ...APPROVED_SIGNATURE,
          signature: { ...APPROVED_SIGNATURE.signature, ...mutation },
        }),
        connectorId: CONNECTOR_ID,
        connectorOrigin: CONNECTOR_ORIGIN,
        prepared,
        timeoutMilliseconds: 1_000,
      }),
    ).rejects.toThrow(/signature|signing/iu);
  });
});
