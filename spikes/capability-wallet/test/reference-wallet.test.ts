import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCapabilityWalletSigningSession,
  verifyCapabilityWalletSignature,
} from "../../../packages/x402-canton/src/index.js";
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
import { registerReferenceWalletSecurityCases } from "./reference-wallet-security.cases.js";
import { registerReferenceWalletRequestSecurityCases } from "./reference-wallet-request-security.cases.js";
import { registerReferenceWalletKeyCases } from "./reference-wallet-key.cases.js";
import { registerReferenceWalletCliCases } from "./reference-wallet-cli.cases.js";
import { registerCapabilityWalletConnectorContract } from "../../../packages/x402-canton/test/capability-wallet-connector.contract.js";
import { referenceWalletConnectorHarness } from "./reference-wallet-conformance.js";
import { registerReferenceWalletReplayCases } from "./reference-wallet-replay.cases.js";

registerReferenceWalletSecurityCases();
registerReferenceWalletRequestSecurityCases();
registerReferenceWalletKeyCases();
registerReferenceWalletCliCases();
registerReferenceWalletReplayCases();
registerCapabilityWalletConnectorContract(referenceWalletConnectorHarness);

const cleanups: Array<() => Promise<void>> = [];

async function fixture() {
  const parent = await realpath(
    await mkdtemp(join(tmpdir(), "sotto-reference-wallet-")),
  );
  cleanups.push(() => rm(parent, { force: true, recursive: true }));
  const handoffRoot = join(parent, ".capability-wallet");
  const walletRoot = join(parent, "wallet-owned");
  await mkdir(walletRoot, { mode: 0o700 });
  const storage = await createWalletHandoffStorage({
    rootDirectory: handoffRoot,
  });
  const sdk = SDK.createOffline();
  const keys = sdk.keys.generate();
  const keyFile = join(walletRoot, "payer.key");
  await writeFile(keyFile, Buffer.from(keys.privateKey, "base64"), {
    mode: 0o600,
  });
  return { handoffRoot, keyFile, keys, sdk, storage };
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-07-15T10:00:00.000Z") });
});

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe("Wallet SDK reference connector", () => {
  it("rejects explicitly without any key access", async () => {
    const prepared = await walletSdkVerifiedCapabilityBootstrap();
    const { handoffRoot, keyFile, keys, sdk, storage } = await fixture();
    const fingerprint = await sdk.keys.fingerprint(keys.publicKey);
    await rm(keyFile);
    let summary = "";
    const connector = createReferenceWalletConnector({
      capabilities: CONNECTOR_CAPABILITIES,
      exchange: async (id, { signal }) => {
        await runReferenceWalletApproval({
          approved: false,
          handoffId: id,
          presentSummary: (value) => {
            summary = value;
          },
          rootDirectory: handoffRoot,
          signal,
          walletPolicy: referenceWalletPolicy(fingerprint),
        });
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
    ).resolves.toMatchObject({
      outcome: "rejected",
      reason: "user-rejected",
    });
    expect(summary).toContain(CONNECTOR_CAPABILITIES.payerParty);
  });

  it("recomputes, presents, explicitly approves, and really signs", async () => {
    const prepared = await walletSdkVerifiedCapabilityBootstrap();
    const { handoffRoot, keyFile, keys, sdk, storage } = await fixture();
    const fingerprint = await sdk.keys.fingerprint(keys.publicKey);
    let approvalSummary = "";
    let handoffId = "";
    const connector = createReferenceWalletConnector({
      capabilities: CONNECTOR_CAPABILITIES,
      exchange: async (id, { signal }) => {
        expect(signal.aborted).toBe(false);
        handoffId = id;
        await runReferenceWalletApproval({
          approved: true,
          handoffId: id,
          keyFile,
          presentSummary: (summary) => {
            approvalSummary = summary;
          },
          rootDirectory: handoffRoot,
          signal,
          walletPolicy: referenceWalletPolicy(fingerprint),
        });
      },
      storage,
    });

    const session = await createCapabilityWalletSigningSession({
      connector,
      connectorId: CONNECTOR_ID,
      connectorOrigin: CONNECTOR_ORIGIN,
      prepared,
      timeoutMilliseconds: 1_000,
    });
    const verified = await verifyCapabilityWalletSignature(session, {
      resolveRegisteredPublicKey: async () => ({
        fingerprint,
        publicKey: keys.publicKey,
        publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
      }),
    });

    expect(verified).toMatchObject({
      outcome: "verified",
      signedBy: fingerprint,
    });
    expect(approvalSummary).toContain(CONNECTOR_CAPABILITIES.payerParty);
    expect(approvalSummary).toContain("create-purchase-capability");
    expect(approvalSummary).not.toContain(keys.privateKey);
    expect((await lstat(keyFile)).mode & 0o777).toBe(0o600);
    const handoffFiles = (await readdir(handoffRoot)).filter((name) =>
      name.endsWith(".json"),
    );
    expect(handoffFiles).toEqual([
      `${handoffId}.request.json`,
      `${handoffId}.response.json`,
    ]);
    const requestArtifact = JSON.parse(
      await readFile(join(handoffRoot, `${handoffId}.request.json`), "utf8"),
    ) as { payload: { request: { preparedTransaction: string } } };
    const rawPrepared = requestArtifact.payload.request.preparedTransaction;
    expect(approvalSummary).not.toContain(rawPrepared);
    expect(JSON.stringify(session)).not.toContain(rawPrepared);
    expect(JSON.stringify(verified)).not.toContain(rawPrepared);
    for (const name of handoffFiles) {
      expect(await readFile(join(handoffRoot, name), "utf8")).not.toContain(
        keys.privateKey,
      );
    }
  });
});
