import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreparedTransaction } from "@canton-network/core-ledger-proto";
import { SDK } from "../src/index.js";
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
import {
  decodeCanonicalWalletHandoffJson,
  encodeCanonicalWalletHandoffJson,
} from "../src/wallet-handoff-json.js";
import { createWalletHandoffStorage } from "../src/wallet-handoff-storage.js";
import {
  referenceWalletPolicy,
  walletSdkVerifiedCapabilityBootstrap,
} from "./reference-wallet.fixtures.js";

type MutateRequest = (request: Record<string, unknown>) => void | Promise<void>;

export function registerReferenceWalletRequestSecurityCases(): void {
  const cleanups: Array<() => Promise<void>> = [];
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-15T10:00:00.000Z") });
  });
  afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  async function attempt(mutate: MutateRequest) {
    const prepared = await walletSdkVerifiedCapabilityBootstrap();
    const parent = await realpath(
      await mkdtemp(join(tmpdir(), "sotto-reference-wallet-request-")),
    );
    cleanups.push(() => rm(parent, { force: true, recursive: true }));
    const rootDirectory = join(parent, ".capability-wallet");
    const storage = await createWalletHandoffStorage({ rootDirectory });
    const presentSummary = vi.fn();
    const connector = createReferenceWalletConnector({
      capabilities: CONNECTOR_CAPABILITIES,
      exchange: async (id) => {
        const path = join(rootDirectory, `${id}.request.json`);
        const record = decodeCanonicalWalletHandoffJson(
          await readFile(path),
        ) as { payload: { request: Record<string, unknown> } };
        await mutate(record.payload.request);
        await writeFile(path, encodeCanonicalWalletHandoffJson(record));
        await runReferenceWalletApproval({
          approved: false,
          handoffId: id,
          presentSummary,
          rootDirectory,
          walletPolicy: referenceWalletPolicy(`1220${"b".repeat(64)}`),
        });
      },
      storage,
    });
    return {
      presentSummary,
      signing: createCapabilityWalletSigningSession({
        connector,
        connectorId: CONNECTOR_ID,
        connectorOrigin: CONNECTOR_ORIGIN,
        prepared,
        timeoutMilliseconds: 1_000,
      }),
    };
  }

  describe("reference wallet request integrity", () => {
    it("rejects a forged recipient before presentation", async () => {
      const scenario = await attempt((request) => {
        const approval = request.approval as Record<string, unknown>;
        approval.recipientParty = "sotto-attacker::1220participant";
      });
      await expect(scenario.signing).rejects.toThrow(
        /prepared.*allowedRecipient/iu,
      );
      expect(scenario.presentSummary).not.toHaveBeenCalled();
    });

    it("rejects a changed prepared hash before presentation", async () => {
      const scenario = await attempt((request) => {
        request.preparedTransactionHash = `sha256:${"0".repeat(64)}`;
      });
      await expect(scenario.signing).rejects.toThrow(/prepared hash.*match/iu);
      expect(scenario.presentSummary).not.toHaveBeenCalled();
    });

    it("rejects a forged action before presentation", async () => {
      const scenario = await attempt((request) => {
        const approval = request.approval as Record<string, unknown>;
        approval.action = "transfer-everything";
      });
      await expect(scenario.signing).rejects.toThrow(/approval action/iu);
      expect(scenario.presentSummary).not.toHaveBeenCalled();
    });

    it("rejects an excessive prepared record-time window", async () => {
      const scenario = await attempt(async (request) => {
        const prepared = PreparedTransaction.fromBinary(
          Buffer.from(String(request.preparedTransaction), "base64"),
        );
        if (prepared.metadata === undefined) {
          throw new Error("test metadata is absent");
        }
        if (prepared.metadata.maxRecordTime === undefined) {
          throw new Error("test max record time is absent");
        }
        prepared.metadata.maxRecordTime += 60n * 60n * 1_000_000n;
        const bytes = PreparedTransaction.toBinary(prepared, {
          writeUnknownFields: false,
        });
        const digest = await SDK.createOffline().utils.hash.preparedTransaction(
          Buffer.from(bytes).toString("base64"),
        );
        const hash = `sha256:${digest.toHex()}`;
        request.preparedTransaction = Buffer.from(bytes).toString("base64");
        request.preparedTransactionHash = hash;
        (request.approval as Record<string, unknown>).preparedTransactionHash =
          hash;
      });
      await expect(scenario.signing).rejects.toThrow(/record-time|metadata/iu);
      expect(scenario.presentSummary).not.toHaveBeenCalled();
    });
  });
}
