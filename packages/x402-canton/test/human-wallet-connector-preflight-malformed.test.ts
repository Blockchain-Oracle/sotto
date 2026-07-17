import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHumanWalletConnectorPreflight } from "../src/human-wallet-connector-preflight.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  HUMAN_CONNECTOR_CAPABILITIES,
  humanPreflightInput,
  mutateHumanConnectorCapabilities,
} from "./human-wallet-connector-preflight.fixtures.js";

const malformedCases: ReadonlyArray<
  readonly [string, (candidate: Record<string, unknown>) => void]
> = [
  ["extra key", (value) => (value.privateKey = "secret")],
  ["missing key", (value) => delete value.approvalVersions],
  [
    "duplicate array",
    (value) => (value.networks = ["canton:devnet", "canton:devnet"]),
  ],
  [
    "sparse array",
    (value) => {
      const networks = ["canton:devnet", "canton:other"];
      delete networks[1];
      value.networks = networks;
    },
  ],
  [
    "seventeen values",
    (value) =>
      (value.networks = Array.from(
        { length: 17 },
        (_, index) => `canton:${index}`,
      )),
  ],
  ["invalid package", (value) => (value.packageIds = ["not-a-package"])],
  ["invalid network", (value) => (value.networks = ["ethereum:1"])],
  ["invalid kind", (value) => (value.connectorKind = "browser-extension")],
  [
    "invalid fingerprint",
    (value) => {
      (value.signingKey as Record<string, unknown>).fingerprint = "1220short";
    },
  ],
];

describe("human wallet malformed discovery", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it.each(malformedCases)(
    "rejects %s before identity or approval",
    async (_name, mutate) => {
      const capabilities = mutateHumanConnectorCapabilities(mutate);
      const observePayerIdentity = vi.fn();
      const requestApproval = vi.fn();

      await expect(
        createHumanWalletConnectorPreflight({
          ...humanPreflightInput(),
          connector: { discover: async () => capabilities, requestApproval },
          observePayerIdentity,
        }),
      ).rejects.toThrow("human wallet capabilities are invalid");
      expect(observePayerIdentity).not.toHaveBeenCalled();
      expect(requestApproval).not.toHaveBeenCalled();
    },
  );

  it("rejects registered identity substitution", async () => {
    const capabilities = {
      ...HUMAN_CONNECTOR_CAPABILITIES,
      connectorId: "substituted-wallet",
    };
    const observePayerIdentity = vi.fn();
    await expect(
      createHumanWalletConnectorPreflight({
        ...humanPreflightInput(),
        connector: {
          discover: async () => capabilities,
          requestApproval: vi.fn(),
        },
        observePayerIdentity,
      }),
    ).rejects.toThrow("human wallet capabilities are invalid");
    expect(observePayerIdentity).not.toHaveBeenCalled();
  });

  it("rejects private or path-bearing public origins before discovery", async () => {
    const discover = vi.fn();
    const credentialOrigin = [
      "https://",
      "user",
      ":",
      "password",
      "@",
      "example.com/private?query=value",
    ].join("");
    await expect(
      createHumanWalletConnectorPreflight({
        ...humanPreflightInput(),
        connector: { discover, requestApproval: vi.fn() },
        connectorOrigin: credentialOrigin,
      }),
    ).rejects.toThrow(/origin.*public-safe/u);
    expect(discover).not.toHaveBeenCalled();
  });
});
