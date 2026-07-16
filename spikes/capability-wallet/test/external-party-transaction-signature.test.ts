import { SDK, signTransactionHash } from "@canton-network/wallet-sdk";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { captureBoundedPurchaseSigningAuthorizationForTest } from "../../../packages/x402-canton/dist/bounded-purchase-signing-authorization.js";
import { createExternalPartyBoundedPurchaseSigner } from "../src/external-party-transaction-signature.js";

const cleanups: Array<() => Promise<void>> = [];

async function walletKey() {
  const parent = await realpath(
    await mkdtemp(join(tmpdir(), "sotto-external-agent-signature-")),
  );
  cleanups.push(() => rm(parent, { force: true, recursive: true }));
  const wallet = join(parent, "wallet");
  await mkdir(wallet, { mode: 0o700 });
  const sdk = SDK.createOffline();
  const keys = sdk.keys.generate();
  const fingerprint = await sdk.keys.fingerprint(keys.publicKey);
  const keyFile = join(wallet, "agent.key");
  await writeFile(keyFile, Buffer.from(keys.privateKey, "base64"), {
    mode: 0o600,
  });
  return { fingerprint, keyFile, keys };
}

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe("external Party prepared-transaction signature", () => {
  it("signs one exact digest for the matching Party and fingerprint", async () => {
    const key = await walletKey();
    const digest = new Uint8Array(32).fill(7);
    const party = `sotto-external-agent::${key.fingerprint}`;
    const authorization = captureBoundedPurchaseSigningAuthorizationForTest({
      attemptId: `sha256:${"a".repeat(64)}`,
      capturedAt: Date.now(),
      executeBefore: new Date(Date.now() + 60_000).toISOString(),
      party,
      preparedTransactionHash: digest,
      purchaseCommitment: `sha256:${"b".repeat(64)}`,
    });
    const sign = createExternalPartyBoundedPurchaseSigner({
      expectedFingerprint: key.fingerprint,
      keyFile: key.keyFile,
      signal: new AbortController().signal,
    });

    const envelope = await sign(authorization);

    expect(envelope).toEqual({
      party,
      signatures: [
        {
          format: "SIGNATURE_FORMAT_CONCAT",
          signature: signTransactionHash(
            Buffer.from(digest).toString("base64"),
            key.keys.privateKey,
          ),
          signedBy: key.fingerprint,
          signingAlgorithmSpec: "SIGNING_ALGORITHM_SPEC_ED25519",
        },
      ],
    });
    expect(Object.isFrozen(envelope)).toBe(true);
    expect(Object.isFrozen(envelope.signatures)).toBe(true);
    expect(Object.isFrozen(envelope.signatures[0])).toBe(true);
    expect(digest).toEqual(new Uint8Array(32).fill(7));
  });

  it("rejects authority substitution before opening a key", async () => {
    const fingerprint = `1220${"a".repeat(64)}`;
    const authorization = captureBoundedPurchaseSigningAuthorizationForTest({
      attemptId: `sha256:${"c".repeat(64)}`,
      capturedAt: Date.now(),
      executeBefore: new Date(Date.now() + 60_000).toISOString(),
      party: `sotto-other-agent::1220${"b".repeat(64)}`,
      preparedTransactionHash: new Uint8Array(32),
      purchaseCommitment: `sha256:${"d".repeat(64)}`,
    });
    const sign = createExternalPartyBoundedPurchaseSigner({
      expectedFingerprint: fingerprint,
      keyFile: "/missing/agent.key",
      signal: new AbortController().signal,
    });
    await expect(sign(authorization)).rejects.toThrow(/Party.*fingerprint/iu);
  });

  it("rejects a key whose registered fingerprint differs", async () => {
    const key = await walletKey();
    const expectedFingerprint = `1220${"c".repeat(64)}`;
    const authorization = captureBoundedPurchaseSigningAuthorizationForTest({
      attemptId: `sha256:${"e".repeat(64)}`,
      capturedAt: Date.now(),
      executeBefore: new Date(Date.now() + 60_000).toISOString(),
      party: `sotto-external-agent::${expectedFingerprint}`,
      preparedTransactionHash: new Uint8Array(32),
      purchaseCommitment: `sha256:${"f".repeat(64)}`,
    });
    const sign = createExternalPartyBoundedPurchaseSigner({
      expectedFingerprint,
      keyFile: key.keyFile,
      signal: new AbortController().signal,
    });
    await expect(sign(authorization)).rejects.toThrow(
      /signing key does not match/iu,
    );
  });

  it("rejects a forged authorization before opening a key", async () => {
    const sign = createExternalPartyBoundedPurchaseSigner({
      expectedFingerprint: `1220${"a".repeat(64)}`,
      keyFile: "/missing/agent.key",
      signal: new AbortController().signal,
    });

    await expect(
      sign(
        Object.freeze({
          attemptId: `sha256:${"a".repeat(64)}`,
          authorizationId: `sha256:${"b".repeat(64)}`,
          executeBefore: new Date(Date.now() + 60_000).toISOString(),
          party: `sotto-agent::1220${"a".repeat(64)}`,
          purchaseCommitment: `sha256:${"c".repeat(64)}`,
        }) as never,
      ),
    ).rejects.toThrow(/not authenticated/iu);
  });
});
