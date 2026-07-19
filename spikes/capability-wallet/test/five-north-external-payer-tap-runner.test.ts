import { SDK } from "@canton-network/wallet-sdk";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runFiveNorthExternalPayerTap } from "../src/five-north-external-payer-tap-runner.js";
import {
  mutatePreparedTap,
  preparedTapFixture,
  TAP_AMOUNT,
  TAP_PAYER,
  TAP_SYNCHRONIZER,
} from "./five-north-external-payer-tap.fixtures.js";

const cleanups: Array<() => Promise<void>> = [];

async function walletKey() {
  const parent = await realpath(
    await mkdtemp(join(tmpdir(), "sotto-tap-wallet-")),
  );
  cleanups.push(() => rm(parent, { force: true, recursive: true }));
  const directory = join(parent, "wallet");
  await mkdir(directory, { mode: 0o700 });
  const keyFile = join(directory, "payer.key");
  const sdk = SDK.createOffline();
  const key = sdk.keys.generate();
  await writeFile(keyFile, Buffer.from(key.privateKey, "base64"), {
    mode: 0o600,
  });
  return {
    expectedFingerprint: await sdk.keys.fingerprint(key.publicKey),
    keyFile,
  };
}

function response(preparedTransaction = preparedTapFixture()) {
  return {
    hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2" as const,
    preparedTransaction: Buffer.from(preparedTransaction).toString("base64"),
    preparedTransactionHash: Buffer.alloc(32, 7).toString("base64"),
  };
}

const recomputePreparedHash = async () => new Uint8Array(32).fill(7);

function input(key: Awaited<ReturnType<typeof walletKey>>) {
  return {
    amount: TAP_AMOUNT,
    expectedFingerprint: key.expectedFingerprint,
    keyFile: key.keyFile,
    payerParty: TAP_PAYER,
    signal: new AbortController().signal,
    submissionId: `sotto-external-payer-tap-v1-${"a".repeat(64)}`,
    synchronizerId: TAP_SYNCHRONIZER,
  };
}

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe("Five North external payer tap runner", () => {
  it("verifies, wallet-signs, and executes one exact tap", async () => {
    const key = await walletKey();
    const execute = vi.fn(async (signature: string) => {
      expect(signature).toMatch(/^[A-Za-z0-9+/]+={0,2}$/u);
      return { completionOffset: 44, updateId: "1220tap-update" };
    });

    await expect(
      runFiveNorthExternalPayerTap(input(key), {
        prepareTap: async () => ({ execute, response: response() }),
        recomputePreparedHash,
      }),
    ).resolves.toEqual({
      amount: TAP_AMOUNT,
      completionOffset: 44,
      mutationSubmitted: true,
      payerParty: TAP_PAYER,
      submissionId: `sotto-external-payer-tap-v1-${"a".repeat(64)}`,
      synchronizerId: TAP_SYNCHRONIZER,
      updateId: "1220tap-update",
      version: "sotto-five-north-external-payer-tap-execution-v1",
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("rejects a changed graph before opening the key or executing", async () => {
    const execute = vi.fn();
    const preparedTransaction = mutatePreparedTap((prepared) => {
      prepared.transaction!.roots = ["1"];
    });

    await expect(
      runFiveNorthExternalPayerTap(
        {
          ...input({
            expectedFingerprint: `1220${"b".repeat(64)}`,
            keyFile: "/missing/wallet/payer.key",
          }),
        },
        {
          prepareTap: async () => ({
            execute,
            response: response(preparedTransaction),
          }),
          recomputePreparedHash,
        },
      ),
    ).rejects.toThrow(/prepared envelope/iu);
    expect(execute).not.toHaveBeenCalled();
  });

  it("blocks a second live dispatch after the durable start record", async () => {
    const key = await walletKey();
    const execute = vi.fn(async () => ({
      completionOffset: 44,
      updateId: "1220tap-update",
    }));
    const dependencies = {
      prepareTap: async () => ({ execute, response: response() }),
      recomputePreparedHash,
    };

    await runFiveNorthExternalPayerTap(input(key), dependencies);
    await expect(
      runFiveNorthExternalPayerTap(input(key), dependencies),
    ).rejects.toThrow(/reconciliation/iu);
    expect(execute).toHaveBeenCalledOnce();
  });
});
