import { lstat, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerFiveNorthExternalPayerCliCases } from "./five-north-external-payer-cli.cases.js";
import { registerFiveNorthExternalPayerCliSecurityCases } from "./five-north-external-payer-cli-security.cases.js";
import { registerFiveNorthExternalPayerJournalCases } from "./five-north-external-payer-journal.cases.js";
import { registerFiveNorthExternalPayerSecurityCases } from "./five-north-external-payer-security.cases.js";
import { registerFiveNorthExternalPayerTopologyCases } from "./five-north-external-payer-topology.cases.js";
import { externalPayerOfflineSdk } from "./five-north-external-payer.fixtures.js";
import { registerFiveNorthExternalPayerProcessCases } from "./five-north-external-payer-process.cases.js";

const cleanups: Array<() => Promise<void>> = [];

registerFiveNorthExternalPayerCliCases();
registerFiveNorthExternalPayerCliSecurityCases();
registerFiveNorthExternalPayerJournalCases();
registerFiveNorthExternalPayerSecurityCases();
registerFiveNorthExternalPayerTopologyCases();
registerFiveNorthExternalPayerProcessCases();

async function moduleUnderTest() {
  try {
    return await import("../src/five-north-external-payer.js");
  } catch (cause) {
    throw new Error("FIVE_NORTH_EXTERNAL_PAYER_NOT_IMPLEMENTED", { cause });
  }
}

async function walletKeyFile(): Promise<string> {
  const parent = await realpath(
    await mkdtemp(join(tmpdir(), "sotto-external-payer-")),
  );
  cleanups.push(() => rm(parent, { force: true, recursive: true }));
  const directory = join(parent, "wallet-owned");
  await mkdir(directory, { mode: 0o700 });
  return join(directory, "payer.key");
}

async function externalPartyClient() {
  const offline = externalPayerOfflineSdk;
  const topologyTransactions = ["AA=="];
  const multiHash =
    await offline.utils.hash.topologyTransaction(topologyTransactions);
  let publicKey = "";
  const response = async () => {
    const fingerprint = await offline.keys.fingerprint(publicKey);
    return {
      multiHash,
      partyId: `sotto-external-payer::${fingerprint}`,
      publicKeyFingerprint: fingerprint,
      topologyTransactions,
    };
  };
  const execute = vi.fn(response);
  const topology = vi.fn(response);
  const createExternalParty = vi.fn((candidate: string) => {
    publicKey = candidate;
    return { execute, topology };
  });
  return { createExternalParty, execute, topology };
}

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe("Five North external payer wallet command", () => {
  it("defaults to a redacted non-mutating topology dry run", async () => {
    const { runFiveNorthExternalPayer } = await moduleUnderTest();
    const { createExternalParty, execute, topology } =
      await externalPartyClient();
    const keyFile = await walletKeyFile();

    const result = await runFiveNorthExternalPayer(
      {
        keyFile,
        mode: "dry-run",
        partyHint: "sotto-external-payer",
        signal: new AbortController().signal,
        synchronizerId: "global-domain::1220sync",
      },
      { createExternalParty },
    );

    expect(createExternalParty).toHaveBeenCalledWith(expect.any(String), {
      partyHint: "sotto-external-payer",
      synchronizerId: "global-domain::1220sync",
    });
    expect(topology).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
    expect(result).toEqual({
      fingerprint: expect.stringMatching(/^1220[0-9a-f]{64}$/u),
      mode: "dry-run",
      mutationSubmitted: false,
      partyHint: "sotto-external-payer",
      proposedPartyId: expect.stringMatching(/^sotto-external-payer::1220/u),
      synchronizerId: "global-domain::1220sync",
      version: "sotto-five-north-external-payer-v1",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /private|publicKey|signature|topology|multiHash/iu,
    );
    const status = await lstat(keyFile);
    expect(status.size).toBe(64);
    expect(status.mode & 0o777).toBe(0o600);
  });

  it("requires the reviewed fingerprint for exactly one live mutation", async () => {
    const { runFiveNorthExternalPayer } = await moduleUnderTest();
    const keyFile = await walletKeyFile();
    const first = await externalPartyClient();
    const base = {
      keyFile,
      partyHint: "sotto-external-payer",
      signal: new AbortController().signal,
      synchronizerId: "global-domain::1220sync",
    } as const;
    const dryRun = await runFiveNorthExternalPayer(
      { ...base, mode: "dry-run" },
      { createExternalParty: first.createExternalParty },
    );
    const live = await externalPartyClient();

    const result = await runFiveNorthExternalPayer(
      {
        ...base,
        expectedFingerprint: dryRun.fingerprint,
        mode: "live",
      },
      { createExternalParty: live.createExternalParty },
    );

    expect(live.execute).toHaveBeenCalledOnce();
    expect(live.execute).toHaveBeenCalledWith(expect.any(String), {
      grantUserRights: false,
    });
    expect(result).toMatchObject({
      fingerprint: dryRun.fingerprint,
      mode: "live",
      mutationSubmitted: true,
    });

    const rejected = await externalPartyClient();
    await expect(
      runFiveNorthExternalPayer(
        {
          ...base,
          expectedFingerprint: `1220${"0".repeat(64)}`,
          mode: "live",
        },
        { createExternalParty: rejected.createExternalParty },
      ),
    ).rejects.toThrow(/fingerprint/iu);
    expect(rejected.topology).not.toHaveBeenCalled();
    expect(rejected.execute).not.toHaveBeenCalled();
  });
});
