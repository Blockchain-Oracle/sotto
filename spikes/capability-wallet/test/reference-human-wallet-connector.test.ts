import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HumanWalletCapabilities } from "@sotto/x402-canton";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HUMAN_PURCHASE_NOW } from "../../../packages/x402-canton/test/human-purchase-commitment.fixtures.js";
import { createReferenceHumanWalletConnector } from "../src/reference-human-wallet.js";
import { runReferenceHumanWalletApproval } from "../src/reference-human-wallet-runner.js";
import { createWalletHandoffStorage } from "../src/wallet-handoff-storage.js";
import { sdkCompatibleReferenceHumanWalletRequest } from "./reference-human-wallet.fixtures.js";

const cleanups: Array<() => Promise<void>> = [];

beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

it("exchanges a human request through an isolated pluggable connector", async () => {
  const parent = await realpath(
    await mkdtemp(join(tmpdir(), "sotto-human-connector-")),
  );
  cleanups.push(() => rm(parent, { force: true, recursive: true }));
  const rootDirectory = join(parent, ".capability-wallet");
  const storage = await createWalletHandoffStorage({ rootDirectory });
  const request = await sdkCompatibleReferenceHumanWalletRequest();
  const capabilities = {
    version: "sotto-human-wallet-capabilities-v1",
    approvalVersions: [request.approval.version],
    connectorId: request.connectorId,
    connectorKind: "wallet-sdk",
    explicitApproval: true,
    hashingSchemeVersions: [request.hashingSchemeVersion],
    networks: [request.approval.network],
    origin: request.connectorOrigin,
    packageIds: [request.approval.selectedPackage.packageId],
    payerParty: request.approval.payerParty,
    preparedTransactionSigning: true,
    signingKey: {
      fingerprint: request.approval.signer.publicKeyFingerprint,
      publicKeyFormat: request.approval.signer.publicKeyFormat,
      purpose: "SIGNING",
      signatureFormat: request.approval.signer.signatureFormat,
      signingAlgorithm: request.approval.signer.signingAlgorithm,
    },
    synchronizerIds: [request.approval.synchronizerId],
  } as HumanWalletCapabilities;
  const presentSummary = vi.fn();
  const connector = createReferenceHumanWalletConnector({
    capabilities,
    exchange: async (handoffId, { signal }) => {
      await runReferenceHumanWalletApproval({
        approved: false,
        handoffId,
        presentSummary,
        rootDirectory,
        signal,
      });
    },
    storage,
  });
  const controller = new AbortController();

  await expect(
    connector.discover({ signal: controller.signal }),
  ).resolves.toEqual(capabilities);
  await expect(
    connector.requestApproval(request, { signal: controller.signal }),
  ).resolves.toEqual({
    version: "sotto-human-wallet-response-v1",
    outcome: "rejected",
    reason: "user-rejected",
    sessionId: request.sessionId,
  });
  expect(presentSummary).toHaveBeenCalledOnce();
});
