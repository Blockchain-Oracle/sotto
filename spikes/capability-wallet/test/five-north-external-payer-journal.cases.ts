import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runFiveNorthExternalPayer } from "../src/five-north-external-payer.js";
import { externalPayerOfflineSdk } from "./five-north-external-payer.fixtures.js";

const cleanups: Array<() => Promise<void>> = [];

async function keyFile(): Promise<string> {
  const parent = await realpath(
    await mkdtemp(join(tmpdir(), "sotto-external-payer-journal-")),
  );
  cleanups.push(() => rm(parent, { force: true, recursive: true }));
  const directory = join(parent, "wallet-owned");
  await mkdir(directory, { mode: 0o700 });
  return join(directory, "payer.key");
}

async function client(onExecute?: () => void | Promise<void>) {
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
  const execute = vi.fn(async () => {
    await onExecute?.();
    return response();
  });
  const createExternalParty = vi.fn((candidate: string) => {
    publicKey = candidate;
    return { execute, topology: response };
  });
  return { createExternalParty, execute, multiHash };
}

function base(path: string) {
  return {
    keyFile: path,
    partyHint: "sotto-external-payer",
    signal: new AbortController().signal,
    synchronizerId: "global-domain::1220sync",
  } as const;
}

export function registerFiveNorthExternalPayerJournalCases(): void {
  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  describe("Five North external payer execution journal", () => {
    it("persists before execute and blocks every later live attempt", async () => {
      const path = await keyFile();
      const journalPath = `${path}.onboarding.json`;
      const dryClient = await client();
      const dry = await runFiveNorthExternalPayer(
        { ...base(path), mode: "dry-run" },
        { createExternalParty: dryClient.createExternalParty },
      );
      await expect(readFile(journalPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
      const liveClient = await client(async () => {
        const status = await lstat(journalPath);
        expect(status.mode & 0o777).toBe(0o600);
        const record = JSON.parse(await readFile(journalPath, "utf8"));
        expect(record).toEqual({
          fingerprint: dry.fingerprint,
          partyId: `sotto-external-payer::${dry.fingerprint}`,
          schema: "sotto-external-payer-onboarding-v1",
          startedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/u),
          state: "execution-started",
          synchronizerId: "global-domain::1220sync",
          topologyHash: liveClient.multiHash,
        });
        expect(JSON.stringify(record)).not.toMatch(
          /private|publicKey|signature|topologyTransactions/iu,
        );
      });

      await runFiveNorthExternalPayer(
        {
          ...base(path),
          expectedFingerprint: dry.fingerprint,
          mode: "live",
        },
        { createExternalParty: liveClient.createExternalParty },
      );
      expect(liveClient.execute).toHaveBeenCalledOnce();

      const repeated = await client();
      await expect(
        runFiveNorthExternalPayer(
          {
            ...base(path),
            expectedFingerprint: dry.fingerprint,
            mode: "live",
          },
          { createExternalParty: repeated.createExternalParty },
        ),
      ).rejects.toThrow(/reconciliation/iu);
      expect(repeated.createExternalParty).not.toHaveBeenCalled();
      expect(repeated.execute).not.toHaveBeenCalled();
    });

    it("retains the blocker after an uncertain execute outcome", async () => {
      const path = await keyFile();
      const dryClient = await client();
      const dry = await runFiveNorthExternalPayer(
        { ...base(path), mode: "dry-run" },
        { createExternalParty: dryClient.createExternalParty },
      );
      const uncertain = await client(() => {
        throw new Error("private ambiguous response");
      });
      await expect(
        runFiveNorthExternalPayer(
          {
            ...base(path),
            expectedFingerprint: dry.fingerprint,
            mode: "live",
          },
          { createExternalParty: uncertain.createExternalParty },
        ),
      ).rejects.toThrow(/outcome is uncertain/iu);
      expect(uncertain.execute).toHaveBeenCalledOnce();

      const repeated = await client();
      await expect(
        runFiveNorthExternalPayer(
          {
            ...base(path),
            expectedFingerprint: dry.fingerprint,
            mode: "live",
          },
          { createExternalParty: repeated.createExternalParty },
        ),
      ).rejects.toThrow(/reconciliation/iu);
      expect(repeated.createExternalParty).not.toHaveBeenCalled();
    });
  });
}
