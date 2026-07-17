import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHumanWalletSigningSession } from "../src/index.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import { signedHumanWalletInputs } from "./human-wallet-signing-session.fixtures.js";

type Mutation = (capabilities: Record<string, unknown>) => void;

const mutations: ReadonlyArray<readonly [string, Mutation]> = [
  ["version", (value) => (value.version = "future-version")],
  ["approval version", (value) => (value.approvalVersions = [])],
  ["connector ID", (value) => (value.connectorId = "attacker-wallet")],
  ["connector kind", (value) => (value.connectorKind = "openrpc")],
  ["explicit approval", (value) => (value.explicitApproval = false)],
  ["hashing scheme", (value) => (value.hashingSchemeVersions = [])],
  ["network", (value) => (value.networks = [])],
  ["origin", (value) => (value.origin = "wallet://attacker")],
  ["package", (value) => (value.packageIds = [])],
  [
    "payer",
    (value) => {
      const key = value.signingKey as Record<string, string>;
      value.payerParty = `sotto-other-payer::${key.fingerprint}`;
    },
  ],
  ["prepared signing", (value) => (value.preparedTransactionSigning = false)],
  [
    "key fingerprint",
    (value) => {
      const key = value.signingKey as Record<string, string>;
      key.fingerprint = `1220${"f".repeat(64)}`;
    },
  ],
  [
    "key purpose",
    (value) => {
      const key = value.signingKey as Record<string, string>;
      key.purpose = "ENCRYPTION";
    },
  ],
  [
    "key format",
    (value) => {
      const key = value.signingKey as Record<string, string>;
      key.publicKeyFormat = "PUBLIC_KEY_FORMAT_DER_SPKI";
    },
  ],
  [
    "signature format",
    (value) => {
      const key = value.signingKey as Record<string, string>;
      key.signatureFormat = "SIGNATURE_FORMAT_DER";
    },
  ],
  [
    "signing algorithm",
    (value) => {
      const key = value.signingKey as Record<string, string>;
      key.signingAlgorithm = "SIGNING_ALGORITHM_SPEC_EC_DSA_SHA_256";
    },
  ],
  ["synchronizer", (value) => (value.synchronizerIds = [])],
];

describe("human wallet signing capability continuity", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it.each(mutations)(
    "stops a changed %s before approval",
    async (_name, mutate) => {
      const input = await signedHumanWalletInputs({
        rediscover: (capabilities) => {
          const candidate = structuredClone(capabilities) as Record<
            string,
            unknown
          >;
          mutate(candidate);
          return candidate;
        },
      });

      try {
        const result = await createHumanWalletSigningSession(
          { preflight: input.preflight, prepared: input.prepared },
          { resolveRegisteredPublicKey: async () => input.registeredKey },
        );
        expect(result.outcome).toBe("unsupported");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
      expect(input.approvalCalls()).toBe(0);
    },
  );

  it("accepts reordered but otherwise identical capability sets", async () => {
    const arrays = [
      "approvalVersions",
      "hashingSchemeVersions",
      "networks",
      "packageIds",
      "synchronizerIds",
    ] as const;
    const input = await signedHumanWalletInputs({
      mutateCapabilities: (capabilities) => {
        (capabilities.approvalVersions as string[]).push("future-approval");
        (capabilities.hashingSchemeVersions as string[]).push("future-hash");
        (capabilities.networks as string[]).push("canton:other");
        (capabilities.packageIds as string[]).push("f".repeat(64));
        (capabilities.synchronizerIds as string[]).push(
          `other::1220${"e".repeat(64)}`,
        );
      },
      rediscover: (capabilities) => {
        const candidate = structuredClone(capabilities) as Record<
          string,
          unknown
        >;
        for (const key of arrays) (candidate[key] as string[]).reverse();
        return candidate;
      },
    });

    await expect(
      createHumanWalletSigningSession(
        { preflight: input.preflight, prepared: input.prepared },
        { resolveRegisteredPublicKey: async () => input.registeredKey },
      ),
    ).resolves.toMatchObject({ outcome: "verified" });
    expect(input.approvalCalls()).toBe(1);
  });
});
