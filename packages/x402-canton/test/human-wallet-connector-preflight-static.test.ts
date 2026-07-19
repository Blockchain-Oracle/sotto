import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHumanWalletConnectorPreflight } from "../src/human-wallet-connector-preflight.js";
import { readAuthenticatedHumanWalletConnectorPreflight } from "../src/human-wallet-connector-preflight-state.js";
import type { HumanWalletUnsupportedReason } from "../src/human-wallet-connector-types.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  HUMAN_CONNECTOR_CAPABILITIES,
  HUMAN_CONNECTOR_ID,
  HUMAN_CONNECTOR_ORIGIN,
  humanPreflightInput,
  mutateHumanConnectorCapabilities,
} from "./human-wallet-connector-preflight.fixtures.js";

type Mutation = (candidate: Record<string, unknown>) => void;

const unsupportedCases: ReadonlyArray<
  readonly [HumanWalletUnsupportedReason, Mutation]
> = [
  ["unsupported-capabilities-version", (value) => (value.version = "v2")],
  ["unsupported-package", (value) => (value.packageIds = [])],
  ["unsupported-hashing-scheme", (value) => (value.hashingSchemeVersions = [])],
  ["unsupported-approval-version", (value) => (value.approvalVersions = [])],
  ["unsupported-network", (value) => (value.networks = [])],
  ["unsupported-synchronizer", (value) => (value.synchronizerIds = [])],
  [
    "unsupported-key-fingerprint",
    (value) => (value.payerParty = `sotto-other::1220${"b".repeat(64)}`),
  ],
  [
    "unsupported-key-format",
    (value) => {
      (value.signingKey as Record<string, unknown>).publicKeyFormat = "PEM";
    },
  ],
  [
    "unsupported-signature-scheme",
    (value) => {
      (value.signingKey as Record<string, unknown>).signingAlgorithm =
        "SIGNING_ALGORITHM_SPEC_EC_DSA_SHA_256";
    },
  ],
  [
    "unsupported-prepared-signing",
    (value) => (value.preparedTransactionSigning = false),
  ],
  [
    "unsupported-explicit-approval",
    (value) => (value.explicitApproval = false),
  ],
];

describe("human wallet static preflight compatibility", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it.each(unsupportedCases)(
    "returns %s before identity or approval",
    async (reason, mutate) => {
      const observePayerIdentity = vi.fn();
      const requestApproval = vi.fn();
      const capabilities = mutateHumanConnectorCapabilities(mutate);
      const result = await createHumanWalletConnectorPreflight({
        ...humanPreflightInput(capabilities),
        connector: { discover: async () => capabilities, requestApproval },
        observePayerIdentity,
      });

      expect(result).toEqual({
        connectorId: HUMAN_CONNECTOR_ID,
        connectorKind: "wallet-sdk",
        origin: HUMAN_CONNECTOR_ORIGIN,
        outcome: "unsupported",
        reason,
      });
      expect(Object.isFrozen(result)).toBe(true);
      expect(observePayerIdentity).not.toHaveBeenCalled();
      expect(requestApproval).not.toHaveBeenCalled();
      expect(() =>
        readAuthenticatedHumanWalletConnectorPreflight(result),
      ).toThrow(/not authenticated/u);
    },
  );

  it("pins unsupported precedence to the capability version", async () => {
    const capabilities = mutateHumanConnectorCapabilities((value) => {
      value.version = "v2";
      value.packageIds = [];
      value.preparedTransactionSigning = false;
    });
    await expect(
      createHumanWalletConnectorPreflight(humanPreflightInput(capabilities)),
    ).resolves.toMatchObject({ reason: "unsupported-capabilities-version" });
  });

  it("accepts the exact sixteen-value boundary", async () => {
    const capabilities = mutateHumanConnectorCapabilities((value) => {
      value.networks = [
        "canton:devnet",
        ...Array.from({ length: 15 }, (_, index) => `canton:extra-${index}`),
      ];
    });
    await expect(
      createHumanWalletConnectorPreflight(humanPreflightInput(capabilities)),
    ).resolves.toMatchObject({ outcome: "compatible" });
  });

  it("negotiates OpenRPC without changing the security contract", async () => {
    const capabilities = mutateHumanConnectorCapabilities((value) => {
      value.connectorKind = "openrpc";
      value.origin = "openrpc://loop-reference";
    });
    const result = await createHumanWalletConnectorPreflight({
      ...humanPreflightInput(capabilities),
      connectorKind: "openrpc",
      connectorOrigin: "openrpc://loop-reference",
    });
    expect(result).toMatchObject({
      connectorKind: "openrpc",
      origin: "openrpc://loop-reference",
      outcome: "compatible",
    });
  });

  it("rejects malformed or substituted discovery without reading identity", async () => {
    const malformed = structuredClone(
      HUMAN_CONNECTOR_CAPABILITIES,
    ) as unknown as Record<string, unknown>;
    Object.defineProperty(malformed, "version", {
      enumerable: true,
      get: () => {
        throw new Error("PRIVATE_KEY=do-not-leak");
      },
    });
    const observePayerIdentity = vi.fn();

    await expect(
      createHumanWalletConnectorPreflight({
        ...humanPreflightInput(),
        connector: {
          discover: async () => malformed,
          requestApproval: vi.fn(),
        },
        observePayerIdentity,
      }),
    ).rejects.toThrow("human wallet capabilities are invalid");
    expect(observePayerIdentity).not.toHaveBeenCalled();
  });
});
