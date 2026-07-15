import {
  access,
  chmod,
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

async function absentKeyFile(): Promise<string> {
  const parent = await realpath(
    await mkdtemp(join(tmpdir(), "sotto-external-payer-live-")),
  );
  cleanups.push(() => rm(parent, { force: true, recursive: true }));
  const directory = join(parent, "wallet-owned");
  await mkdir(directory, { mode: 0o700 });
  return join(directory, "payer.key");
}

async function client(onTopology?: () => void) {
  const offline = externalPayerOfflineSdk;
  const topologyTransactions = ["AA=="];
  const multiHash =
    await offline.utils.hash.topologyTransaction(topologyTransactions);
  let publicKey = "";
  const execute = vi.fn();
  const createExternalParty = vi.fn((candidate: string) => {
    publicKey = candidate;
    return {
      execute,
      topology: async () => {
        const fingerprint = await offline.keys.fingerprint(publicKey);
        onTopology?.();
        return {
          multiHash,
          partyId: `sotto-external-payer::${fingerprint}`,
          publicKeyFingerprint: fingerprint,
          topologyTransactions,
        };
      },
    };
  });
  return { createExternalParty, execute };
}

function base(keyFile: string, signal = new AbortController().signal) {
  return {
    keyFile,
    partyHint: "sotto-external-payer",
    signal,
    synchronizerId: "global-domain::1220sync",
  } as const;
}

export function registerFiveNorthExternalPayerSecurityCases(): void {
  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  describe("Five North external payer security", () => {
    it("refuses live onboarding when no reviewed dry-run key exists", async () => {
      const keyFile = await absentKeyFile();
      const createExternalParty = vi.fn();

      await expect(
        runFiveNorthExternalPayer(
          {
            expectedFingerprint: `1220${"0".repeat(64)}`,
            keyFile,
            mode: "live",
            partyHint: "sotto-external-payer",
            signal: new AbortController().signal,
            synchronizerId: "global-domain::1220sync",
          },
          { createExternalParty },
        ),
      ).rejects.toThrow(/reviewed dry-run key/iu);

      await expect(access(keyFile)).rejects.toMatchObject({ code: "ENOENT" });
      expect(createExternalParty).not.toHaveBeenCalled();
    });

    it("reuses the same owner-only key without overwriting it", async () => {
      const keyFile = await absentKeyFile();
      const first = await client();
      const initial = await runFiveNorthExternalPayer(
        { ...base(keyFile), mode: "dry-run" },
        { createExternalParty: first.createExternalParty },
      );
      const originalBytes = await readFile(keyFile);
      const second = await client();

      const repeated = await runFiveNorthExternalPayer(
        { ...base(keyFile), mode: "dry-run" },
        { createExternalParty: second.createExternalParty },
      );

      expect(repeated.fingerprint).toBe(initial.fingerprint);
      expect(await readFile(keyFile)).toEqual(originalBytes);
    });

    it("rejects an existing key beneath a non-owner-only directory", async () => {
      const keyFile = await absentKeyFile();
      const valid = await client();
      await runFiveNorthExternalPayer(
        { ...base(keyFile), mode: "dry-run" },
        { createExternalParty: valid.createExternalParty },
      );
      await chmod(join(keyFile, ".."), 0o755);
      const rejected = await client();

      await expect(
        runFiveNorthExternalPayer(
          { ...base(keyFile), mode: "dry-run" },
          { createExternalParty: rejected.createExternalParty },
        ),
      ).rejects.toThrow(/directory.*owner-only/iu);
      expect(rejected.createExternalParty).not.toHaveBeenCalled();
    });

    it("cancels before key access or after topology without mutation", async () => {
      const missing = await absentKeyFile();
      const earlyController = new AbortController();
      earlyController.abort();
      const early = await client();
      await expect(
        runFiveNorthExternalPayer(
          { ...base(missing, earlyController.signal), mode: "dry-run" },
          { createExternalParty: early.createExternalParty },
        ),
      ).rejects.toThrow(/cancelled/iu);
      await expect(access(missing)).rejects.toMatchObject({ code: "ENOENT" });
      expect(early.createExternalParty).not.toHaveBeenCalled();

      const dry = await client();
      const prepared = await runFiveNorthExternalPayer(
        { ...base(missing), mode: "dry-run" },
        { createExternalParty: dry.createExternalParty },
      );
      const lateController = new AbortController();
      const late = await client(() => lateController.abort());
      await expect(
        runFiveNorthExternalPayer(
          {
            ...base(missing, lateController.signal),
            expectedFingerprint: prepared.fingerprint,
            mode: "live",
          },
          { createExternalParty: late.createExternalParty },
        ),
      ).rejects.toThrow(/cancelled/iu);
      expect(late.execute).not.toHaveBeenCalled();
    });
  });
}
