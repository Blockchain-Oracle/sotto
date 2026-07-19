import { expect, it, vi } from "vitest";
import type { FiveNorthHumanWalletProfile } from "../src/five-north-human-wallet-profile.js";
import { createFiveNorthInteractiveHumanWallet } from "../src/five-north-interactive-human-wallet.js";

const FINGERPRINT = `1220${"a".repeat(64)}` as const;
const PROFILE: FiveNorthHumanWalletProfile = Object.freeze({
  fingerprint: FINGERPRINT,
  party: `sotto-external-payer::${FINGERPRINT}`,
  publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
  synchronizerId: `global-domain::1220${"b".repeat(64)}`,
  topologyHash: Buffer.from([
    0x12,
    0x20,
    ...new Uint8Array(32).fill(7),
  ]).toString("base64"),
});

it("composes one process-isolated connector and registered key resolver", async () => {
  const signal = new AbortController().signal;
  const identity = {
    fingerprint: FINGERPRINT,
    publicKey: Buffer.alloc(32, 9).toString("base64"),
    publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW" as const,
  };
  const exchange = vi.fn();
  const storage = {} as never;
  const connector = { discover: vi.fn(), requestApproval: vi.fn() };
  const dependencies = {
    createConnector: vi.fn(() => connector),
    createExchange: vi.fn(() => exchange),
    createStorage: vi.fn(async () => storage),
    readIdentity: vi.fn(async () => identity),
  };

  const result = await createFiveNorthInteractiveHumanWallet(
    {
      keyFile: "/workspace/.capability-wallet/payer.key",
      profile: PROFILE,
      signal,
      workspaceRoot: "/workspace",
    },
    dependencies,
  );

  expect(dependencies.readIdentity).toHaveBeenCalledWith({
    expectedFingerprint: FINGERPRINT,
    keyFile: "/workspace/.capability-wallet/payer.key",
    signal,
    workspaceRoot: "/workspace",
  });
  expect(dependencies.createStorage).toHaveBeenCalledWith({
    rootDirectory: "/workspace/.capability-wallet",
  });
  expect(dependencies.createExchange).toHaveBeenCalledWith({
    keyFile: "/workspace/.capability-wallet/payer.key",
    rootDirectory: "/workspace/.capability-wallet",
    workspaceRoot: "/workspace",
  });
  expect(dependencies.createConnector).toHaveBeenCalledWith({
    capabilities: expect.objectContaining({
      payerParty: PROFILE.party,
      signingKey: expect.objectContaining({ fingerprint: FINGERPRINT }),
    }),
    exchange,
    storage,
  });
  expect(result.connector).toBe(connector);
  await expect(
    result.resolveRegisteredPublicKey(
      {
        keyPurpose: "SIGNING",
        network: "canton:devnet",
        party: PROFILE.party,
        publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
        signatureFormat: "SIGNATURE_FORMAT_CONCAT",
        signedBy: FINGERPRINT,
        signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519",
        subjectHash: `sha256:${"c".repeat(64)}`,
        synchronizerId: PROFILE.synchronizerId,
        topologyHash: PROFILE.topologyHash,
      },
      { signal },
    ),
  ).resolves.toEqual(identity);
});
