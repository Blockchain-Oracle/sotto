import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SDK, signTransactionHash } from "@canton-network/wallet-sdk";
import { afterEach, expect, it, vi } from "vitest";
import { verifyCapabilityWalletSignatureBytes } from "../../../packages/x402-canton/src/capability-wallet-signature-crypto.js";
import type { HumanWalletSignatureEnvelope } from "../../../packages/x402-canton/src/index.js";
import { HUMAN_PURCHASE_NOW } from "../../../packages/x402-canton/test/human-purchase-commitment.fixtures.js";
import { serializeReferenceHumanWalletRequest } from "../src/reference-human-wallet-request.js";
import { createWalletHandoffStorage } from "../src/wallet-handoff-storage.js";
import { sdkCompatibleReferenceHumanWalletRequest } from "./reference-human-wallet.fixtures.js";
import { runCompiledReferenceWallet } from "./reference-human-wallet-process.fixture.js";

const cleanups: Array<() => Promise<void>> = [];
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = resolve(packageRoot, "dist/reference-human-wallet-cli.js");
const walletNow = Date.parse(HUMAN_PURCHASE_NOW) + 1_000;

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

it("approves through the compiled Wallet SDK reference-wallet process", async () => {
  const parent = await realpath(
    await mkdtemp(join(tmpdir(), "sotto-reference-wallet-process-")),
  );
  cleanups.push(() => rm(parent, { force: true, recursive: true }));
  const rootDirectory = join(parent, ".capability-wallet");
  const keyDirectory = join(parent, "wallet-owned");
  await mkdir(keyDirectory, { mode: 0o700 });
  const keyFile = join(keyDirectory, "payer.key");
  const clockFile = join(parent, "wallet-test-clock.mjs");
  await writeFile(clockFile, `Date.now = () => ${walletNow};\n`, {
    mode: 0o600,
  });

  const sdk = SDK.createOffline();
  const keys = sdk.keys.generate();
  const fingerprint = (await sdk.keys.fingerprint(
    keys.publicKey,
  )) as `1220${string}`;
  const payerParty = `sotto-human-payer::${fingerprint}`;
  await writeFile(keyFile, Buffer.from(keys.privateKey, "base64"), {
    mode: 0o600,
  });
  vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) });
  const request = await sdkCompatibleReferenceHumanWalletRequest({
    payerParty,
    signerFingerprint: fingerprint,
  });
  const payload = serializeReferenceHumanWalletRequest(request);
  vi.useRealTimers();
  const handoffId = request.sessionId.slice("sha256:".length);
  const storage = await createWalletHandoffStorage({
    now: () => walletNow,
    rootDirectory,
  });
  await storage.create({
    expiresAt: request.expiresAt,
    id: handoffId,
    kind: "request",
    payload,
  });

  const processResult = await runCompiledReferenceWallet({
    cliPath,
    clockModuleUrl: pathToFileURL(clockFile).href,
    handoffId,
    keyFile,
    rootDirectory,
  });

  expect(processResult.stderr).toBe("");
  expect(processResult.stdout).toContain(
    `Type the exact handoff ID ${handoffId} to approve:`,
  );
  expect(processResult.stdout).toMatch(/\{"outcome":"approved"\}\s*$/u);
  const response = (await storage.read(handoffId, "response")).payload;
  expect(response).toMatchObject({
    version: "sotto-human-wallet-response-v1",
    outcome: "approved",
    preparedTransactionHash: request.preparedTransactionHash,
    sessionId: request.sessionId,
    signature: {
      party: payerParty,
      signedBy: fingerprint,
      signatureFormat: "SIGNATURE_FORMAT_CONCAT",
      signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519",
    },
  });
  if (
    typeof response !== "object" ||
    response === null ||
    !("outcome" in response) ||
    response.outcome !== "approved" ||
    !("signature" in response) ||
    typeof response.signature !== "object" ||
    response.signature === null ||
    !("signature" in response.signature) ||
    typeof response.signature.signature !== "string"
  ) {
    throw new Error("reference wallet process signature is absent");
  }
  const sdkDigest = await sdk.utils.hash.preparedTransaction(
    Buffer.from(request.preparedTransaction).toString("base64"),
  );
  expect(`sha256:${sdkDigest.toHex()}`).toBe(request.preparedTransactionHash);
  const digest = Buffer.from(sdkDigest.toHex(), "hex");
  expect(response.signature.signature).toBe(
    signTransactionHash(digest.toString("base64"), keys.privateKey),
  );
  verifyCapabilityWalletSignatureBytes(
    response.signature as HumanWalletSignatureEnvelope,
    Buffer.from(response.signature.signature, "base64"),
    digest,
    {
      publicKey: Buffer.from(keys.publicKey, "base64"),
      publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
    },
  );
  expect(processResult.stdout).not.toContain(response.signature.signature);
  expect(processResult.stdout).not.toContain(keys.privateKey);
  expect(processResult.stdout).not.toContain(keys.publicKey);

  expect((await lstat(rootDirectory)).mode & 0o777).toBe(0o700);
  expect((await lstat(keyDirectory)).mode & 0o777).toBe(0o700);
  expect((await lstat(keyFile)).mode & 0o777).toBe(0o600);
  for (const entry of await readdir(rootDirectory)) {
    const status = await lstat(join(rootDirectory, entry));
    expect(status.isFile()).toBe(true);
    expect(status.mode & 0o777).toBe(0o600);
  }
});

it("never copies failed wallet stderr into the parent error", async () => {
  const parent = await realpath(
    await mkdtemp(join(tmpdir(), "sotto-reference-wallet-failure-")),
  );
  cleanups.push(() => rm(parent, { force: true, recursive: true }));
  const failedCli = join(parent, "failed-wallet.mjs");
  const clockFile = join(parent, "clock.mjs");
  const keyFile = join(parent, "payer.key");
  const rootDirectory = join(parent, "handoff");
  const privateSentinel = "private-wallet-failure-sentinel";
  await mkdir(rootDirectory, { mode: 0o700 });
  await writeFile(clockFile, "// real clock\n", { mode: 0o600 });
  await writeFile(keyFile, "private test key", { mode: 0o600 });
  await writeFile(
    failedCli,
    `const index = process.argv.indexOf("--handoff-id");
const id = process.argv[index + 1];
process.stdout.write(\`Type the exact handoff ID \${id} to approve:\`);
process.stdin.once("data", () => {
  process.stderr.write(${JSON.stringify(privateSentinel)});
  process.exit(17);
});
`,
    { mode: 0o600 },
  );

  let failure: unknown;
  try {
    await runCompiledReferenceWallet({
      cliPath: failedCli,
      clockModuleUrl: pathToFileURL(clockFile).href,
      handoffId: "failure-handoff",
      keyFile,
      rootDirectory,
    });
  } catch (error) {
    failure = error;
  }

  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toBe(
    "reference wallet process failed (17/null)",
  );
  expect((failure as Error).message).not.toContain(privateSentinel);
});
