import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PreparedTransaction } from "@canton-network/core-ledger-proto";
import { SDK } from "@canton-network/wallet-sdk";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HUMAN_PURCHASE_NOW } from "../../../packages/x402-canton/test/human-purchase-commitment.fixtures.js";
import { recomputeReferenceWalletPreparedHash } from "../src/reference-wallet-public-identity.js";
import { runReferenceHumanWalletApproval } from "../src/reference-human-wallet-runner.js";
import { serializeReferenceHumanWalletRequest } from "../src/reference-human-wallet-request.js";
import { createWalletHandoffStorage } from "../src/wallet-handoff-storage.js";
import { sdkCompatibleReferenceHumanWalletRequest } from "./reference-human-wallet.fixtures.js";

const cleanups: Array<() => Promise<void>> = [];

async function fixture(
  suppliedRequest?: Awaited<
    ReturnType<typeof sdkCompatibleReferenceHumanWalletRequest>
  >,
) {
  const parent = await realpath(
    await mkdtemp(join(tmpdir(), "sotto-human-runner-security-")),
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

it("rejects a recomputed semantic forgery before presentation", async () => {
  const value = await fixture();
  const payload = structuredClone(
    serializeReferenceHumanWalletRequest(value.request),
  );
  const prepared = PreparedTransaction.fromBinary(
    Buffer.from(payload.request.preparedTransaction, "base64"),
    { readUnknownField: "throw" },
  );
  prepared.metadata!.submitterInfo!.actAs = ["sotto-attacker::1220attacker"];
  const bytes = PreparedTransaction.toBinary(prepared, {
    writeUnknownFields: false,
  });
  const digest = await recomputeReferenceWalletPreparedHash(bytes);
  const hash = `sha256:${Buffer.from(digest).toString("hex")}`;
  Reflect.set(
    payload.request,
    "preparedTransaction",
    Buffer.from(bytes).toString("base64"),
  );
  Reflect.set(payload.request, "preparedTransactionHash", hash);
  Reflect.set(payload.request.approval, "preparedTransactionHash", hash);
  await value.storage.create({
    expiresAt: value.request.expiresAt,
    id: value.handoffId,
    kind: "request",
    payload,
  });
  const presentSummary = vi.fn();

  await expect(
    runReferenceHumanWalletApproval({
      approved: true,
      handoffId: value.handoffId,
      keyFile: join(value.parent, "missing.key"),
      presentSummary,
      rootDirectory: value.rootDirectory,
    }),
  ).rejects.toThrow(/prepared.*does not match/iu);
  expect(presentSummary).not.toHaveBeenCalled();
  await expect(
    value.storage.read(value.handoffId, "response"),
  ).rejects.toThrow();
});

it("rejects the wrong local key without publishing a response", async () => {
  const sdk = SDK.createOffline();
  const expected = sdk.keys.generate();
  const fingerprint = (await sdk.keys.fingerprint(
    expected.publicKey,
  )) as `1220${string}`;
  const request = await sdkCompatibleReferenceHumanWalletRequest({
    payerParty: `sotto-human-payer::${fingerprint}`,
    signerFingerprint: fingerprint,
  });
  const value = await fixture(request);
  const wrong = sdk.keys.generate();
  const keyFile = join(value.parent, "wrong.key");
  await writeFile(keyFile, Buffer.from(wrong.privateKey, "base64"), {
    mode: 0o600,
  });
  await value.storage.create({
    expiresAt: request.expiresAt,
    id: value.handoffId,
    kind: "request",
    payload: serializeReferenceHumanWalletRequest(request),
  });

  await expect(
    runReferenceHumanWalletApproval({
      approved: true,
      handoffId: value.handoffId,
      keyFile,
      presentSummary: vi.fn(),
      rootDirectory: value.rootDirectory,
    }),
  ).rejects.toThrow(/key does not match/iu);
  await expect(
    value.storage.read(value.handoffId, "response"),
  ).rejects.toThrow();
});

it("cancels after presentation without opening a key", async () => {
  const value = await fixture();
  await value.storage.create({
    expiresAt: value.request.expiresAt,
    id: value.handoffId,
    kind: "request",
    payload: serializeReferenceHumanWalletRequest(value.request),
  });
  const controller = new AbortController();

  await expect(
    runReferenceHumanWalletApproval({
      approved: true,
      handoffId: value.handoffId,
      keyFile: join(value.parent, "missing.key"),
      presentSummary: () => controller.abort("private reason"),
      rootDirectory: value.rootDirectory,
      signal: controller.signal,
    }),
  ).rejects.toThrow(/cancelled/iu);
});

it("allows exactly one concurrent claim", async () => {
  const value = await fixture();
  await value.storage.create({
    expiresAt: value.request.expiresAt,
    id: value.handoffId,
    kind: "request",
    payload: serializeReferenceHumanWalletRequest(value.request),
  });
  const run = () =>
    runReferenceHumanWalletApproval({
      approved: false,
      handoffId: value.handoffId,
      presentSummary: vi.fn(),
      rootDirectory: value.rootDirectory,
    });

  const outcomes = await Promise.allSettled([run(), run()]);

  expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(
    1,
  );
  expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(
    1,
  );
  await expect(
    value.storage.read(value.handoffId, "response"),
  ).resolves.toBeDefined();
});
