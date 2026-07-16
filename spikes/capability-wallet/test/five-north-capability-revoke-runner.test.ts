import { SDK } from "@canton-network/wallet-sdk";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { runFiveNorthCapabilityRevoke } from "../src/five-north-capability-revoke-runner.js";
import {
  mutatePreparedRevoke,
  preparedRevokeFixture,
  REVOKE_AGENT,
  REVOKE_CAPABILITY,
  REVOKE_PAYER,
  REVOKE_SYNCHRONIZER,
} from "./five-north-capability-revoke.fixtures.js";

const cleanups: Array<() => Promise<void>> = [];
const recomputePreparedHash = async () => new Uint8Array(32).fill(7);

async function walletKey() {
  const parent = await realpath(
    await mkdtemp(join(tmpdir(), "sotto-revoke-wallet-")),
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

function response(preparedTransaction = preparedRevokeFixture()) {
  return {
    hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2" as const,
    preparedTransaction: Buffer.from(preparedTransaction).toString("base64"),
    preparedTransactionHash: Buffer.alloc(32, 7).toString("base64"),
  };
}

function input(key: Awaited<ReturnType<typeof walletKey>>) {
  return {
    agentParty: REVOKE_AGENT,
    capabilityContractId: REVOKE_CAPABILITY,
    expectedFingerprint: key.expectedFingerprint,
    keyFile: key.keyFile,
    payerParty: REVOKE_PAYER,
    signal: new AbortController().signal,
    submissionId: `sotto-capability-revoke-v1-${"a".repeat(64)}`,
    synchronizerId: REVOKE_SYNCHRONIZER,
  };
}

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

it("wallet-signs and executes one exact capability revoke", async () => {
  const key = await walletKey();
  const execute = vi.fn(async () => ({
    completionOffset: 45,
    updateId: "1220revoke-update",
  }));
  await expect(
    runFiveNorthCapabilityRevoke(input(key), {
      prepareRevoke: async () => ({ execute, response: response() }),
      recomputePreparedHash,
    }),
  ).resolves.toMatchObject({
    capabilityContractId: REVOKE_CAPABILITY,
    completionOffset: 45,
    mutationSubmitted: true,
    updateId: "1220revoke-update",
    version: "sotto-five-north-capability-revoke-execution-v1",
  });
  expect(execute).toHaveBeenCalledOnce();
});

it("rejects a changed revoke before key access or execution", async () => {
  const execute = vi.fn();
  const prepared = mutatePreparedRevoke((value) => {
    value.transaction!.roots = ["1"];
  });
  await expect(
    runFiveNorthCapabilityRevoke(
      input({
        expectedFingerprint: `1220${"b".repeat(64)}`,
        keyFile: "/missing/wallet/payer.key",
      }),
      {
        prepareRevoke: async () => ({ execute, response: response(prepared) }),
        recomputePreparedHash,
      },
    ),
  ).rejects.toThrow(/prepared envelope/iu);
  expect(execute).not.toHaveBeenCalled();
});

it("blocks every repeated revoke dispatch after the durable start", async () => {
  const key = await walletKey();
  const execute = vi.fn(async () => ({
    completionOffset: 45,
    updateId: "1220revoke-update",
  }));
  const dependencies = {
    prepareRevoke: async () => ({ execute, response: response() }),
    recomputePreparedHash,
  };
  await runFiveNorthCapabilityRevoke(input(key), dependencies);
  await expect(
    runFiveNorthCapabilityRevoke(input(key), dependencies),
  ).rejects.toThrow(/reconciliation/iu);
  expect(execute).toHaveBeenCalledOnce();
});
