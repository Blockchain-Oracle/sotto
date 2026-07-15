import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCapabilityWalletSigningSession } from "../../../packages/x402-canton/src/index.js";
import {
  CONNECTOR_CAPABILITIES,
  CONNECTOR_ID,
  CONNECTOR_ORIGIN,
} from "../../../packages/x402-canton/test/capability-wallet-connector.fixtures.js";
import { SDK } from "../src/index.js";
import {
  createReferenceWalletConnector,
  runReferenceWalletApproval,
} from "../src/reference-wallet.js";
import { createWalletHandoffStorage } from "../src/wallet-handoff-storage.js";
import {
  referenceWalletPolicy,
  walletSdkVerifiedCapabilityBootstrap,
} from "./reference-wallet.fixtures.js";

export function registerReferenceWalletReplayCases(): void {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  describe("reference wallet request replay", () => {
    it("claims one request before presentation and key access", async () => {
      const parent = await realpath(
        await mkdtemp(join(tmpdir(), "sotto-reference-wallet-replay-")),
      );
      cleanups.push(() => rm(parent, { force: true, recursive: true }));
      const rootDirectory = join(parent, ".capability-wallet");
      const walletDirectory = join(parent, "wallet-owned");
      await mkdir(walletDirectory, { mode: 0o700 });
      const keyFile = join(walletDirectory, "payer.key");
      const sdk = SDK.createOffline();
      const keys = sdk.keys.generate();
      await writeFile(keyFile, Buffer.from(keys.privateKey, "base64"), {
        mode: 0o600,
      });
      const fingerprint = await sdk.keys.fingerprint(keys.publicKey);
      const storage = await createWalletHandoffStorage({ rootDirectory });
      const summaries: string[] = [];
      let replayFailure: unknown;
      const connector = createReferenceWalletConnector({
        capabilities: CONNECTOR_CAPABILITIES,
        exchange: async (id, { signal }) => {
          const approval = () =>
            runReferenceWalletApproval({
              approved: true,
              handoffId: id,
              keyFile,
              presentSummary: (summary) => {
                summaries.push(summary);
              },
              rootDirectory,
              signal,
              walletPolicy: referenceWalletPolicy(fingerprint),
            });
          await approval();
          await rm(keyFile);
          try {
            await approval();
          } catch (error) {
            replayFailure = error;
          }
        },
        storage,
      });

      await expect(
        createCapabilityWalletSigningSession({
          connector,
          connectorId: CONNECTOR_ID,
          connectorOrigin: CONNECTOR_ORIGIN,
          prepared: await walletSdkVerifiedCapabilityBootstrap(),
          timeoutMilliseconds: 1_000,
        }),
      ).resolves.toMatchObject({ outcome: "approved" });
      expect(replayFailure).toEqual(
        new Error("wallet handoff artifact is already claimed"),
      );
      expect(summaries).toHaveLength(1);
    });
  });
}
