import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runFiveNorthExternalPayerCli } from "../src/five-north-external-payer-cli.js";

const cleanups: Array<() => Promise<void>> = [];

async function arguments_(): Promise<string[]> {
  const parent = await realpath(
    await mkdtemp(join(tmpdir(), "sotto-external-payer-cli-abort-")),
  );
  cleanups.push(() => rm(parent, { force: true, recursive: true }));
  const directory = join(parent, "wallet-owned");
  await mkdir(directory, { mode: 0o700 });
  return [
    "--key-file",
    join(directory, "payer.key"),
    "--party-hint",
    "sotto-external-payer",
    "--synchronizer-id",
    "global-domain::1220sync",
  ];
}

const environment = {
  FIVE_NORTH_LEDGER_URL: "https://ledger.example",
  FIVE_NORTH_OIDC_AUDIENCE: "ledger-audience",
  FIVE_NORTH_OIDC_CLIENT_ID: "wallet-client",
  FIVE_NORTH_OIDC_CLIENT_SECRET: "private-client-secret",
  FIVE_NORTH_OIDC_ISSUER_URL: "https://auth.example/issuer",
  FIVE_NORTH_OIDC_SCOPE: "daml_ledger_api",
};

export function registerFiveNorthExternalPayerCliSecurityCases(): void {
  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  describe("Five North external payer CLI cancellation", () => {
    it("cancels while SDK initialization is still pending", async () => {
      const controller = new AbortController();
      let started!: () => void;
      const initializationStarted = new Promise<void>((resolve) => {
        started = resolve;
      });
      const createSdk = vi.fn(async () => {
        started();
        return new Promise<never>(() => undefined);
      });
      const operation = runFiveNorthExternalPayerCli(
        {
          arguments: await arguments_(),
          environment,
          signal: controller.signal,
        },
        { createSdk },
      );
      await initializationStarted;
      controller.abort();

      await expect(
        Promise.race([
          operation,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("SDK cancellation hung")), 100),
          ),
        ]),
      ).rejects.toThrow(/onboarding cancelled/iu);
      expect(createSdk).toHaveBeenCalledOnce();
    });
  });
}
