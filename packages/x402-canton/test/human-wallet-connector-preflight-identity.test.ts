import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHumanWalletConnectorPreflight } from "../src/human-wallet-connector-preflight.js";
import { readAuthenticatedHumanWalletConnectorPreflight } from "../src/human-wallet-connector-preflight-state.js";
import type { HumanWalletUnsupportedReason } from "../src/human-wallet-connector-types.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  humanPreflightInput,
  mutateHumanConnectorCapabilities,
} from "./human-wallet-connector-preflight.fixtures.js";
import { humanPayerIdentityObserver } from "./human-payer-identity.fixtures.js";

type Mutation = (candidate: Record<string, unknown>) => void;

const mismatchCases: ReadonlyArray<
  readonly [HumanWalletUnsupportedReason, Mutation]
> = [
  [
    "unsupported-payer",
    (value) => {
      const fingerprint = `1220${"b".repeat(64)}`;
      value.payerParty = `sotto-other::${fingerprint}`;
      (value.signingKey as Record<string, unknown>).fingerprint = fingerprint;
    },
  ],
  ["unsupported-network", (value) => (value.networks = ["canton:other"])],
  [
    "unsupported-synchronizer",
    (value) => (value.synchronizerIds = ["other-domain::1220other"]),
  ],
  [
    "unsupported-key-format",
    (value) => {
      const key = value.signingKey as Record<string, unknown>;
      key.publicKeyFormat = "PUBLIC_KEY_FORMAT_DER_SPKI";
      key.signatureFormat = "SIGNATURE_FORMAT_DER";
      key.signingAlgorithm = "SIGNING_ALGORITHM_SPEC_EC_DSA_SHA_256";
    },
  ],
];

describe("human wallet preflight identity binding", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it.each(mismatchCases)(
    "returns %s after one identity read",
    async (reason, mutate) => {
      const capabilities = mutateHumanConnectorCapabilities(mutate);
      const observePayerIdentity = vi.fn(humanPayerIdentityObserver());
      const requestApproval = vi.fn();

      const result = await createHumanWalletConnectorPreflight({
        ...humanPreflightInput(capabilities),
        connector: { discover: async () => capabilities, requestApproval },
        observePayerIdentity,
      });

      expect(result).toMatchObject({ outcome: "unsupported", reason });
      expect(observePayerIdentity).toHaveBeenCalledTimes(1);
      expect(requestApproval).not.toHaveBeenCalled();
      expect(() =>
        readAuthenticatedHumanWalletConnectorPreflight(result),
      ).toThrow(/not authenticated/u);
    },
  );

  it("redacts identity-reader failures", async () => {
    const requestApproval = vi.fn();
    await expect(
      createHumanWalletConnectorPreflight({
        ...humanPreflightInput(),
        connector: {
          discover: async () =>
            humanPreflightInput().connector.discover({
              signal: new AbortController().signal,
            }),
          requestApproval,
        },
        observePayerIdentity: async () => {
          throw new Error("PRIVATE_KEY=do-not-leak");
        },
      }),
    ).rejects.toThrow("human wallet payer identity read failed");
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("allows one winner when two preflights share one identity observation", async () => {
    const observation = await humanPayerIdentityObserver()();
    const requestApproval = vi.fn();
    const base = humanPreflightInput();
    const input = {
      ...base,
      connector: {
        discover: base.connector.discover,
        requestApproval,
      },
      observePayerIdentity: async () => observation,
    };
    const results = await Promise.allSettled([
      createHumanWalletConnectorPreflight(input),
      createHumanWalletConnectorPreflight(input),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
    expect(requestApproval).not.toHaveBeenCalled();
  });
});
