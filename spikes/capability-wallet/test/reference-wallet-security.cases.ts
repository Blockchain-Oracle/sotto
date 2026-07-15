import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCapabilityWalletSigningSession } from "../../../packages/x402-canton/src/index.js";
import {
  CONNECTOR_CAPABILITIES,
  CONNECTOR_ID,
  CONNECTOR_ORIGIN,
} from "../../../packages/x402-canton/test/capability-wallet-connector.fixtures.js";
import {
  createReferenceWalletConnector,
  runReferenceWalletApproval,
} from "../src/reference-wallet.js";
import { createWalletHandoffStorage } from "../src/wallet-handoff-storage.js";
import {
  referenceWalletPolicy,
  walletSdkVerifiedCapabilityBootstrap,
} from "./reference-wallet.fixtures.js";

export function registerReferenceWalletSecurityCases(): void {
  const cleanups: Array<() => Promise<void>> = [];
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-15T10:00:00.000Z") });
  });
  afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  describe("reference wallet independent verification", () => {
    it("cancels during presentation before key access", async () => {
      const prepared = await walletSdkVerifiedCapabilityBootstrap();
      const parent = await realpath(
        await mkdtemp(join(tmpdir(), "sotto-reference-wallet-cancel-")),
      );
      cleanups.push(() => rm(parent, { force: true, recursive: true }));
      const rootDirectory = join(parent, ".capability-wallet");
      const storage = await createWalletHandoffStorage({ rootDirectory });
      const controller = new AbortController();
      let release!: () => void;
      const presentation = new Promise<void>((resolve) => (release = resolve));
      let presentationStarted!: () => void;
      const started = new Promise<void>(
        (resolve) => (presentationStarted = resolve),
      );
      let wallet!: Promise<unknown>;
      const connector = createReferenceWalletConnector({
        capabilities: CONNECTOR_CAPABILITIES,
        exchange: async (id, { signal }) => {
          wallet = runReferenceWalletApproval({
            approved: true,
            handoffId: id,
            keyFile: join(parent, "missing.key"),
            presentSummary: async () => {
              presentationStarted();
              await presentation;
            },
            rootDirectory,
            signal,
            walletPolicy: referenceWalletPolicy(`1220${"b".repeat(64)}`),
          });
          await wallet;
        },
        storage,
      });
      const signing = createCapabilityWalletSigningSession({
        connector,
        connectorId: CONNECTOR_ID,
        connectorOrigin: CONNECTOR_ORIGIN,
        prepared,
        signal: controller.signal,
        timeoutMilliseconds: 1_000,
      });

      await started;
      controller.abort();
      await expect(signing).rejects.toThrow(/cancelled/iu);
      release();
      await expect(wallet).rejects.toThrow(/cancelled/iu);
    });

    it("expires during presentation before key access", async () => {
      const prepared = await walletSdkVerifiedCapabilityBootstrap();
      const parent = await realpath(
        await mkdtemp(join(tmpdir(), "sotto-reference-wallet-expiry-")),
      );
      cleanups.push(() => rm(parent, { force: true, recursive: true }));
      const rootDirectory = join(parent, ".capability-wallet");
      const storage = await createWalletHandoffStorage({ rootDirectory });
      let wallet!: Promise<unknown>;
      const connector = createReferenceWalletConnector({
        capabilities: CONNECTOR_CAPABILITIES,
        exchange: async (id) => {
          wallet = runReferenceWalletApproval({
            approved: true,
            handoffId: id,
            keyFile: join(parent, "missing.key"),
            presentSummary: async () => {
              vi.advanceTimersByTime(1_001);
            },
            rootDirectory,
            walletPolicy: referenceWalletPolicy(`1220${"b".repeat(64)}`),
          });
          await wallet;
        },
        storage,
      });

      await expect(
        createCapabilityWalletSigningSession({
          connector,
          connectorId: CONNECTOR_ID,
          connectorOrigin: CONNECTOR_ORIGIN,
          prepared,
          timeoutMilliseconds: 1_000,
        }),
      ).rejects.toThrow(/timed out/iu);
      await expect(wallet).rejects.toThrow(/no longer active/iu);
    });

    it("rejects a wallet-owned policy mismatch before presentation", async () => {
      const prepared = await walletSdkVerifiedCapabilityBootstrap();
      const parent = await realpath(
        await mkdtemp(join(tmpdir(), "sotto-reference-wallet-policy-")),
      );
      cleanups.push(() => rm(parent, { force: true, recursive: true }));
      const rootDirectory = join(parent, ".capability-wallet");
      const storage = await createWalletHandoffStorage({ rootDirectory });
      const presentSummary = vi.fn();
      const connector = createReferenceWalletConnector({
        capabilities: CONNECTOR_CAPABILITIES,
        exchange: async (id) => {
          await runReferenceWalletApproval({
            approved: false,
            handoffId: id,
            presentSummary,
            rootDirectory,
            walletPolicy: {
              ...referenceWalletPolicy(`1220${"b".repeat(64)}`),
              network: "canton:wrong-network",
            },
          } as never);
        },
        storage,
      });

      await expect(
        createCapabilityWalletSigningSession({
          connector,
          connectorId: CONNECTOR_ID,
          connectorOrigin: CONNECTOR_ORIGIN,
          prepared,
          timeoutMilliseconds: 1_000,
        }),
      ).rejects.toThrow(/wallet.*policy/iu);
      expect(presentSummary).not.toHaveBeenCalled();
    });
  });
}
