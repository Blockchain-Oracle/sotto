import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SDK } from "@canton-network/wallet-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyCapabilityWalletSignatureBytes } from "../../../packages/x402-canton/src/capability-wallet-signature-crypto.js";
import { HUMAN_PURCHASE_NOW } from "../../../packages/x402-canton/test/human-purchase-commitment.fixtures.js";
import { runReferenceHumanWalletApproval } from "../src/reference-human-wallet-runner.js";
import { serializeReferenceHumanWalletRequest } from "../src/reference-human-wallet-request.js";
import { createWalletHandoffStorage } from "../src/wallet-handoff-storage.js";
import { sdkCompatibleReferenceHumanWalletRequest } from "./reference-human-wallet.fixtures.js";

const cleanups: Array<() => Promise<void>> = [];

async function handoffFixture(
  suppliedRequest?: Awaited<
    ReturnType<typeof sdkCompatibleReferenceHumanWalletRequest>
  >,
) {
  const parent = await realpath(
    await mkdtemp(join(tmpdir(), "sotto-reference-human-wallet-")),
  );
  cleanups.push(() => rm(parent, { force: true, recursive: true }));
  const rootDirectory = join(parent, ".capability-wallet");
  const storage = await createWalletHandoffStorage({ rootDirectory });
  const request =
    suppliedRequest ?? (await sdkCompatibleReferenceHumanWalletRequest());
  const handoffId = request.sessionId.slice("sha256:".length);
  return { handoffId, parent, request, rootDirectory, storage };
}

beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe("reference human wallet runner", () => {
  it("rejects a forged digest before presentation or key access", async () => {
    const { handoffId, parent, request, rootDirectory, storage } =
      await handoffFixture();
    const payload = structuredClone(
      serializeReferenceHumanWalletRequest(request),
    );
    const forgedHash = `sha256:${"0".repeat(64)}`;
    Reflect.set(payload.request, "preparedTransactionHash", forgedHash);
    Reflect.set(
      payload.request.approval,
      "preparedTransactionHash",
      forgedHash,
    );
    await storage.create({
      expiresAt: request.expiresAt,
      id: handoffId,
      kind: "request",
      payload,
    });
    const presentSummary = vi.fn();

    await expect(
      runReferenceHumanWalletApproval({
        approved: true,
        handoffId,
        keyFile: join(parent, "missing.key"),
        presentSummary,
        rootDirectory,
      }),
    ).rejects.toThrow(/prepared transaction hash mismatch/iu);
    expect(presentSummary).not.toHaveBeenCalled();
    await expect(storage.read(handoffId, "response")).rejects.toThrow();
  });

  it("presents once and rejects explicitly without a key", async () => {
    const { handoffId, request, rootDirectory, storage } =
      await handoffFixture();
    await storage.create({
      expiresAt: request.expiresAt,
      id: handoffId,
      kind: "request",
      payload: serializeReferenceHumanWalletRequest(request),
    });
    const presentSummary = vi.fn();

    const response = await runReferenceHumanWalletApproval({
      approved: false,
      handoffId,
      presentSummary,
      rootDirectory,
    });

    expect(response).toEqual({
      version: "sotto-human-wallet-response-v1",
      outcome: "rejected",
      reason: "user-rejected",
      sessionId: request.sessionId,
    });
    expect(presentSummary).toHaveBeenCalledOnce();
    expect(presentSummary).toHaveBeenCalledWith(
      JSON.stringify(request.approval, null, 2),
    );
    expect((await storage.read(handoffId, "response")).payload).toEqual(
      response,
    );
  });

  it("signs with the exact registered Wallet SDK key", async () => {
    const sdk = SDK.createOffline();
    const keys = sdk.keys.generate();
    const fingerprint = (await sdk.keys.fingerprint(
      keys.publicKey,
    )) as `1220${string}`;
    const payerParty = `sotto-human-payer::${fingerprint}`;
    const request = await sdkCompatibleReferenceHumanWalletRequest({
      payerParty,
      signerFingerprint: fingerprint,
    });
    const { handoffId, parent, rootDirectory, storage } =
      await handoffFixture(request);
    const keyFile = join(parent, "payer.key");
    await writeFile(keyFile, Buffer.from(keys.privateKey, "base64"), {
      mode: 0o600,
    });
    await storage.create({
      expiresAt: request.expiresAt,
      id: handoffId,
      kind: "request",
      payload: serializeReferenceHumanWalletRequest(request),
    });

    const response = await runReferenceHumanWalletApproval({
      approved: true,
      handoffId,
      keyFile,
      presentSummary: vi.fn(),
      rootDirectory,
    });

    expect(response).toMatchObject({
      version: "sotto-human-wallet-response-v1",
      outcome: "approved",
      preparedTransactionHash: request.preparedTransactionHash,
      sessionId: request.sessionId,
    });
    if (response.outcome !== "approved") {
      throw new Error("reference wallet test signature is absent");
    }
    expect(response.signature).toMatchObject({
      party: payerParty,
      signatureFormat: "SIGNATURE_FORMAT_CONCAT",
      signedBy: fingerprint,
      signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519",
    });
    verifyCapabilityWalletSignatureBytes(
      response.signature,
      Buffer.from(response.signature.signature, "base64"),
      Buffer.from(request.preparedTransactionHash.slice(7), "hex"),
      {
        publicKey: Buffer.from(keys.publicKey, "base64"),
        publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
      },
    );
    expect((await storage.read(handoffId, "response")).payload).toEqual(
      response,
    );
  });
});
