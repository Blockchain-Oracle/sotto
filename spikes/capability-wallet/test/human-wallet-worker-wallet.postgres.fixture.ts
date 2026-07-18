import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SDK } from "@canton-network/wallet-sdk";
import {
  createHumanPayerIdentityObserver,
  createHumanWalletConnectorPreflight,
  HUMAN_PURCHASE_APPROVAL_VERSION,
  type AuthenticatedHumanWalletConnectorPreflight,
} from "@sotto/x402-canton";
import { SYNCHRONIZER } from "../../../packages/database/test/purchase-authenticated-intent.fixture.js";
import {
  createReferenceHumanWalletConnector,
  createWalletHandoffStorage,
} from "../src/index.js";
import {
  REFERENCE_HUMAN_WALLET_CONNECTOR_ID,
  REFERENCE_HUMAN_WALLET_CONNECTOR_ORIGIN,
} from "../src/reference-human-wallet-request.js";
import { runCompiledReferenceWallet } from "./reference-human-wallet-process.fixture.js";

export async function createRealWalletProcessFixture() {
  const parent = await realpath(
    await mkdtemp(join(tmpdir(), "sotto-worker-wallet-process-")),
  );
  const rootDirectory = join(parent, ".capability-wallet");
  const keyDirectory = join(parent, "wallet-owned");
  await mkdir(keyDirectory, { mode: 0o700 });
  const keyFile = join(keyDirectory, "payer.key");
  const clockFile = join(parent, "wallet-clock.mjs");
  await writeFile(
    clockFile,
    "// The process intentionally uses the real clock.\n",
    { mode: 0o600 },
  );
  const sdk = SDK.createOffline();
  const keys = sdk.keys.generate();
  const fingerprint = (await sdk.keys.fingerprint(
    keys.publicKey,
  )) as `1220${string}`;
  const payerParty = `sotto-human-payer::${fingerprint}`;
  await writeFile(keyFile, Buffer.from(keys.privateKey, "base64"), {
    mode: 0o600,
  });
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const storage = await createWalletHandoffStorage({ rootDirectory });
  let approvalCalls = 0;
  let approvedSignature = "";
  let processOutput = "";

  const createPreflight = async (
    packageId: string,
  ): Promise<AuthenticatedHumanWalletConnectorPreflight> => {
    const capabilities = Object.freeze({
      version: "sotto-human-wallet-capabilities-v1" as const,
      approvalVersions: Object.freeze([HUMAN_PURCHASE_APPROVAL_VERSION]),
      connectorId: REFERENCE_HUMAN_WALLET_CONNECTOR_ID,
      connectorKind: "wallet-sdk" as const,
      explicitApproval: true as const,
      hashingSchemeVersions: Object.freeze(["HASHING_SCHEME_VERSION_V2"]),
      networks: Object.freeze(["canton:devnet" as const]),
      origin: REFERENCE_HUMAN_WALLET_CONNECTOR_ORIGIN,
      packageIds: Object.freeze([packageId]),
      payerParty,
      preparedTransactionSigning: true as const,
      signingKey: Object.freeze({
        fingerprint,
        publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW" as const,
        purpose: "SIGNING" as const,
        signatureFormat: "SIGNATURE_FORMAT_CONCAT" as const,
        signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519" as const,
      }),
      synchronizerIds: Object.freeze([SYNCHRONIZER]),
    });
    const connector = createReferenceHumanWalletConnector({
      capabilities,
      storage,
      exchange: async (handoffId) => {
        approvalCalls += 1;
        const result = await runCompiledReferenceWallet({
          cliPath: resolve(packageRoot, "dist/reference-human-wallet-cli.js"),
          clockModuleUrl: pathToFileURL(clockFile).href,
          handoffId,
          keyFile,
          rootDirectory,
        });
        processOutput += `${result.stdout}${result.stderr}`;
        const response = (await storage.read(handoffId, "response")).payload;
        if (
          typeof response === "object" &&
          response !== null &&
          "outcome" in response &&
          response.outcome === "approved" &&
          "signature" in response &&
          typeof response.signature === "object" &&
          response.signature !== null &&
          "signature" in response.signature &&
          typeof response.signature.signature === "string"
        ) {
          approvedSignature = response.signature.signature;
        }
      },
    });
    const observePayerIdentity = createHumanPayerIdentityObserver({
      readAuthenticatedSubject: async () => "validator-devnet-m2m",
      readPayerIdentity: async () => ({
        keyPurpose: "SIGNING",
        network: "canton:devnet",
        party: payerParty,
        publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
        publicKeyFingerprint: fingerprint,
        signatureFormat: "SIGNATURE_FORMAT_CONCAT",
        signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519",
        synchronizerId: SYNCHRONIZER,
        topologyHash: `1220${"c".repeat(64)}`,
      }),
    });
    const result = await createHumanWalletConnectorPreflight({
      connector,
      connectorId: REFERENCE_HUMAN_WALLET_CONNECTOR_ID,
      connectorKind: "wallet-sdk",
      connectorOrigin: REFERENCE_HUMAN_WALLET_CONNECTOR_ORIGIN,
      expectedPackageId: packageId,
      observePayerIdentity,
    });
    if (result.outcome !== "compatible") {
      throw new Error("real reference wallet preflight is incompatible");
    }
    return result;
  };

  return Object.freeze({
    approvalCalls: () => approvalCalls,
    cleanup: () => rm(parent, { force: true, recursive: true }),
    createPreflight,
    fingerprint,
    payerParty,
    processOutput: () => processOutput,
    processOutputIsRedacted: () =>
      approvedSignature.length > 0 &&
      !processOutput.includes(approvedSignature) &&
      !processOutput.includes(keys.privateKey) &&
      !processOutput.includes(keys.publicKey),
    registeredKey: Object.freeze({
      fingerprint,
      publicKey: keys.publicKey,
      publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW" as const,
    }),
  });
}

export type RealWalletProcessFixture = Awaited<
  ReturnType<typeof createRealWalletProcessFixture>
>;
