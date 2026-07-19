import { expect, it, vi } from "vitest";
import {
  createReferenceHumanWalletInteractiveExchange,
  createReferenceHumanWalletRejectExchange,
  registeredReferenceHumanWalletKeyResolver,
} from "../src/reference-human-wallet-child-process.js";

it("spawns the human approval CLI without injectable terminal input", async () => {
  const runInteractive = vi.fn(async (input: Record<string, unknown>) => {
    expect(input).not.toHaveProperty("standardInput");
  });
  const exchange = createReferenceHumanWalletInteractiveExchange(
    {
      keyFile: "/wallet/payer.key",
      rootDirectory: "/wallet/.capability-wallet",
      workspaceRoot: "/workspace",
    },
    { runInteractive },
  );
  const signal = new AbortController().signal;

  await exchange("a".repeat(64), { signal });

  expect(runInteractive).toHaveBeenCalledWith({
    arguments: [
      "--root",
      "/wallet/.capability-wallet",
      "--handoff-id",
      "a".repeat(64),
      "--approve",
      "--key-file",
      "/wallet/payer.key",
    ],
    script:
      "/workspace/spikes/capability-wallet/src/reference-human-wallet-cli.ts",
    signal,
    workspaceRoot: "/workspace",
  });
});

it("spawns an explicit rejection without passing a key", async () => {
  const runChild = vi.fn(async () => "rejected");
  const exchange = createReferenceHumanWalletRejectExchange(
    {
      rootDirectory: "/wallet/.capability-wallet",
      workspaceRoot: "/workspace",
    },
    { runChild },
  );
  const signal = new AbortController().signal;

  await exchange("b".repeat(64), { signal });

  expect(runChild).toHaveBeenCalledWith({
    arguments: [
      "--root",
      "/wallet/.capability-wallet",
      "--handoff-id",
      "b".repeat(64),
      "--reject",
    ],
    script:
      "/workspace/spikes/capability-wallet/src/reference-human-wallet-cli.ts",
    signal,
    workspaceRoot: "/workspace",
  });
});

it("rejects malformed handoff IDs before spawning either process", async () => {
  const runInteractive = vi.fn();
  const approve = createReferenceHumanWalletInteractiveExchange(
    {
      keyFile: "/wallet/payer.key",
      rootDirectory: "/wallet/.capability-wallet",
      workspaceRoot: "/workspace",
    },
    { runInteractive },
  );
  const runChild = vi.fn();
  const reject = createReferenceHumanWalletRejectExchange(
    {
      rootDirectory: "/wallet/.capability-wallet",
      workspaceRoot: "/workspace",
    },
    { runChild },
  );
  const options = { signal: new AbortController().signal };

  await expect(approve("A".repeat(64), options)).rejects.toThrow(/handoff/iu);
  await expect(reject("../request", options)).rejects.toThrow(/handoff/iu);
  expect(runInteractive).not.toHaveBeenCalled();
  expect(runChild).not.toHaveBeenCalled();
});

it("resolves only the exact registered Five North human signing key", async () => {
  const fingerprint = `1220${"c".repeat(64)}` as const;
  const party = `sotto-external-payer::${fingerprint}`;
  const synchronizerId = `global-domain::1220${"d".repeat(64)}`;
  const topologyHash = Buffer.from([
    0x12,
    0x20,
    ...new Uint8Array(32).fill(7),
  ]).toString("base64");
  const identity = {
    fingerprint,
    publicKey: Buffer.alloc(32, 9).toString("base64"),
    publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW" as const,
  };
  const resolveKey = registeredReferenceHumanWalletKeyResolver({
    identity,
    profile: {
      fingerprint,
      party,
      publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
      synchronizerId,
      topologyHash,
    },
  });
  const signal = new AbortController().signal;
  const query = {
    keyPurpose: "SIGNING" as const,
    network: "canton:devnet" as const,
    party,
    publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW" as const,
    signatureFormat: "SIGNATURE_FORMAT_CONCAT" as const,
    signedBy: fingerprint,
    signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519" as const,
    subjectHash: `sha256:${"e".repeat(64)}` as const,
    synchronizerId,
    topologyHash,
  };

  await expect(resolveKey(query, { signal })).resolves.toEqual(identity);
  await expect(
    resolveKey({ ...query, topologyHash: "changed" }, { signal }),
  ).rejects.toThrow(/registered key query/iu);
});
