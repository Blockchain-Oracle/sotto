import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { externalPayerOfflineSdk } from "./five-north-external-payer.fixtures.js";

const cleanups: Array<() => Promise<void>> = [];

async function keyFile(): Promise<string> {
  const parent = await realpath(
    await mkdtemp(join(tmpdir(), "sotto-external-payer-cli-")),
  );
  cleanups.push(() => rm(parent, { force: true, recursive: true }));
  const directory = join(parent, "wallet-owned");
  await mkdir(directory, { mode: 0o700 });
  return join(directory, "payer.key");
}

function environment(privateSecret = "private-client-secret") {
  return {
    FIVE_NORTH_LEDGER_URL: "https://ledger.example",
    FIVE_NORTH_OIDC_AUDIENCE: "ledger-audience",
    FIVE_NORTH_OIDC_CLIENT_ID: "wallet-client",
    FIVE_NORTH_OIDC_CLIENT_SECRET: privateSecret,
    FIVE_NORTH_OIDC_ISSUER_URL: "https://auth.example/issuer",
    FIVE_NORTH_OIDC_SCOPE: "daml_ledger_api",
  };
}

async function dryRunArguments(): Promise<string[]> {
  return [
    "--key-file",
    await keyFile(),
    "--party-hint",
    "sotto-external-payer",
    "--synchronizer-id",
    "global-domain::1220sync",
  ];
}

export function registerFiveNorthExternalPayerCliCases(): void {
  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  describe("Five North external payer CLI", () => {
    it("defaults to a silent redacted dry run from environment config", async () => {
      const { runFiveNorthExternalPayerCli } =
        await import("../src/five-north-external-payer-cli.js");
      const offline = externalPayerOfflineSdk;
      const transactions = ["AA=="];
      const multiHash =
        await offline.utils.hash.topologyTransaction(transactions);
      let publicKey = "";
      const execute = vi.fn();
      const create = vi.fn((candidate: string) => {
        publicKey = candidate;
        return {
          execute,
          topology: async () => {
            const fingerprint = await offline.keys.fingerprint(publicKey);
            return {
              multiHash,
              partyId: `sotto-external-payer::${fingerprint}`,
              publicKeyFingerprint: fingerprint,
              topologyTransactions: transactions,
            };
          },
        };
      });
      const createSdk = vi.fn(async () => ({
        party: { external: { create } },
      }));
      const privateSecret = "private-client-secret";

      const result = await runFiveNorthExternalPayerCli(
        {
          arguments: [
            "--key-file",
            await keyFile(),
            "--party-hint",
            "sotto-external-payer",
            "--synchronizer-id",
            "global-domain::1220sync",
          ],
          environment: environment(privateSecret),
          signal: new AbortController().signal,
        },
        { createSdk },
      );

      expect(createSdk).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: expect.objectContaining({
            configUrl:
              "https://auth.example/issuer/.well-known/openid-configuration",
            method: "client_credentials",
          }),
          ledgerClientUrl: "https://ledger.example/",
          logAdapter: expect.any(Object),
        }),
      );
      expect(execute).not.toHaveBeenCalled();
      expect(result.mode).toBe("dry-run");
      expect(JSON.stringify(result)).not.toContain(privateSecret);
    });

    it("rejects invalid or cancelled intent before SDK creation", async () => {
      const { runFiveNorthExternalPayerCli } =
        await import("../src/five-north-external-payer-cli.js");
      const base = await dryRunArguments();
      const invalid = [
        [...base, "--live-onboard"],
        [...base, "--expected-fingerprint", `1220${"0".repeat(64)}`],
        [
          ...base,
          "--live-onboard",
          "--expected-fingerprint",
          "not-a-fingerprint",
        ],
        [...base, "--unknown"],
      ];
      for (const arguments_ of invalid) {
        const createSdk = vi.fn();
        await expect(
          runFiveNorthExternalPayerCli(
            {
              arguments: arguments_,
              environment: environment(),
              signal: new AbortController().signal,
            },
            { createSdk },
          ),
        ).rejects.toThrow();
        expect(createSdk).not.toHaveBeenCalled();
      }

      const controller = new AbortController();
      controller.abort();
      const createSdk = vi.fn();
      await expect(
        runFiveNorthExternalPayerCli(
          {
            arguments: base,
            environment: environment(),
            signal: controller.signal,
          },
          { createSdk },
        ),
      ).rejects.toThrow(/cancelled/iu);
      expect(createSdk).not.toHaveBeenCalled();
    });

    it("redacts SDK initialization failures", async () => {
      const { runFiveNorthExternalPayerCli } =
        await import("../src/five-north-external-payer-cli.js");
      const privateValue = "private-token-response";
      let error: unknown;
      try {
        await runFiveNorthExternalPayerCli(
          {
            arguments: await dryRunArguments(),
            environment: environment(),
            signal: new AbortController().signal,
          },
          {
            createSdk: async () => {
              throw new Error(privateValue);
            },
          },
        );
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/SDK initialization failed/iu);
      expect((error as Error).message).not.toContain(privateValue);
    });
  });
}
