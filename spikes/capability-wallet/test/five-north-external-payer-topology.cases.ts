import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SDK } from "@canton-network/wallet-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runFiveNorthExternalPayer } from "../src/five-north-external-payer.js";

const cleanups: Array<() => Promise<void>> = [];

async function keyFile(): Promise<string> {
  const parent = await realpath(
    await mkdtemp(join(tmpdir(), "sotto-external-payer-topology-")),
  );
  cleanups.push(() => rm(parent, { force: true, recursive: true }));
  const directory = join(parent, "wallet-owned");
  await mkdir(directory, { mode: 0o700 });
  return join(directory, "payer.key");
}

function input(path: string) {
  return {
    keyFile: path,
    mode: "dry-run" as const,
    partyHint: "sotto-external-payer",
    signal: new AbortController().signal,
    synchronizerId: "global-domain::1220sync",
  };
}

export function registerFiveNorthExternalPayerTopologyCases(): void {
  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  describe("Five North external payer topology verification", () => {
    it("rejects noncanonical base64 even when its hash agrees", async () => {
      const offline = SDK.createOffline();
      const topologyTransactions = ["AB=="];
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
            return {
              multiHash,
              partyId: `sotto-external-payer::${fingerprint}`,
              publicKeyFingerprint: fingerprint,
              topologyTransactions,
            };
          },
        };
      });

      await expect(
        runFiveNorthExternalPayer(input(await keyFile()), {
          createExternalParty,
        }),
      ).rejects.toThrow(/topology.*invalid/iu);
      expect(execute).not.toHaveBeenCalled();
    });

    it("rejects substituted fingerprints and topology hashes", async () => {
      const offline = SDK.createOffline();
      const transactions = ["AA=="];
      const validHash =
        await offline.utils.hash.topologyTransaction(transactions);
      for (const mutation of ["fingerprint", "hash"] as const) {
        let publicKey = "";
        const execute = vi.fn();
        const createExternalParty = vi.fn((candidate: string) => {
          publicKey = candidate;
          return {
            execute,
            topology: async () => {
              const fingerprint = await offline.keys.fingerprint(publicKey);
              return {
                multiHash:
                  mutation === "hash" ? `1220${"0".repeat(64)}` : validHash,
                partyId: `sotto-external-payer::${fingerprint}`,
                publicKeyFingerprint:
                  mutation === "fingerprint"
                    ? `1220${"0".repeat(64)}`
                    : fingerprint,
                topologyTransactions: transactions,
              };
            },
          };
        });

        await expect(
          runFiveNorthExternalPayer(input(await keyFile()), {
            createExternalParty,
          }),
        ).rejects.toThrow(/fingerprint|topology/iu);
        expect(execute).not.toHaveBeenCalled();
      }
    });

    it("redacts upstream topology failures", async () => {
      const privateValue = "private-topology-token";
      const createExternalParty = vi.fn(() => ({
        execute: vi.fn(),
        topology: async () => {
          throw new Error(privateValue);
        },
      }));

      let error: unknown;
      try {
        await runFiveNorthExternalPayer(input(await keyFile()), {
          createExternalParty,
        });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/topology.*failed/iu);
      expect((error as Error).message).not.toContain(privateValue);
    });
  });
}
