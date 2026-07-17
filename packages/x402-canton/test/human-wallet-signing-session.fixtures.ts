import { generateKeyPairSync, sign as signBytes } from "node:crypto";
import {
  createHumanPayerIdentityObserver,
  createHumanWalletConnectorPreflight,
  HUMAN_WALLET_SIGNING_RESPONSE_VERSION,
  type AuthenticatedHumanWalletConnectorPreflight,
  type HashVerifiedHumanPreparedPurchase,
  type HumanWalletApprovalRequest,
  type HumanWalletSignatureEnvelope,
} from "../src/index.js";
import { computeCantonPublicKeyFingerprint } from "../src/capability-wallet-signature-validation.js";
import { verifyHumanPreparedPurchaseHash } from "../src/human-prepared-purchase-hash.js";
import { humanPreparedHashInputsForPurchase } from "./human-prepared-purchase-hash.fixtures.js";
import {
  HUMAN_CONNECTOR_CAPABILITIES,
  HUMAN_PACKAGE_ID,
  humanPreflightInput,
} from "./human-wallet-connector-preflight.fixtures.js";

export type HumanSignatureMutation = (
  signature: Record<string, string>,
  request: HumanWalletApprovalRequest,
) => void;

export type SignedHumanWalletOptions = Readonly<{
  approval?: (
    request: HumanWalletApprovalRequest,
    response: Readonly<Record<string, unknown>>,
  ) => unknown | Promise<unknown>;
  mutateSignature?: HumanSignatureMutation;
  mutateCapabilities?: (capabilities: Record<string, unknown>) => void;
  profile?: "ecdsa" | "ed25519";
  rediscover?: (capabilities: unknown) => unknown | Promise<unknown>;
}>;

export type SignedHumanWalletInputs = Readonly<{
  fingerprint: string;
  approvalCalls: () => number;
  capabilities: unknown;
  discoveryCalls: () => number;
  payerParty: string;
  preflight: AuthenticatedHumanWalletConnectorPreflight;
  prepared: HashVerifiedHumanPreparedPurchase;
  preparedInput: Awaited<ReturnType<typeof humanPreparedHashInputsForPurchase>>;
  presented: () => HumanWalletApprovalRequest | undefined;
  registeredKey: Readonly<{
    fingerprint: string;
    publicKey: string;
    publicKeyFormat: "PUBLIC_KEY_FORMAT_DER_SPKI" | "PUBLIC_KEY_FORMAT_RAW";
  }>;
}>;

function signingKey(profile: "ecdsa" | "ed25519") {
  if (profile === "ed25519") {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    return {
      publicKey: Buffer.from(
        publicKey.export({ format: "jwk" }).x!,
        "base64url",
      ),
      publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW" as const,
      signatureFormat: "SIGNATURE_FORMAT_CONCAT" as const,
      signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519" as const,
      sign: (digest: Uint8Array) => signBytes(null, digest, privateKey),
    };
  }
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  return {
    publicKey: publicKey.export({ format: "der", type: "spki" }),
    publicKeyFormat: "PUBLIC_KEY_FORMAT_DER_SPKI" as const,
    signatureFormat: "SIGNATURE_FORMAT_DER" as const,
    signingAlgorithm: "SIGNING_ALGORITHM_SPEC_EC_DSA_SHA_256" as const,
    sign: (digest: Uint8Array) => signBytes("sha256", digest, privateKey),
  };
}

export async function signedHumanWalletInputs(
  options: SignedHumanWalletOptions = {},
): Promise<SignedHumanWalletInputs> {
  const key = signingKey(options.profile ?? "ed25519");
  const fingerprint = computeCantonPublicKeyFingerprint(key.publicKey);
  const payerParty = `sotto-external-payer::${fingerprint}`;
  const capabilities: Record<string, unknown> = structuredClone({
    ...HUMAN_CONNECTOR_CAPABILITIES,
    payerParty,
    signingKey: {
      ...HUMAN_CONNECTOR_CAPABILITIES.signingKey,
      fingerprint,
      publicKeyFormat: key.publicKeyFormat,
      signatureFormat: key.signatureFormat,
      signingAlgorithm: key.signingAlgorithm,
    },
  });
  options.mutateCapabilities?.(capabilities);
  const observePayerIdentity = createHumanPayerIdentityObserver({
    readAuthenticatedSubject: async () => "validator-devnet-m2m",
    readPayerIdentity: async () => ({
      keyPurpose: "SIGNING",
      network: "canton:devnet",
      party: payerParty,
      publicKeyFormat: key.publicKeyFormat,
      publicKeyFingerprint: fingerprint,
      signatureFormat: key.signatureFormat,
      signingAlgorithm: key.signingAlgorithm,
      synchronizerId: (capabilities.synchronizerIds as string[])[0],
      topologyHash: `1220${"c".repeat(64)}`,
    }),
  });
  let approvalCalls = 0;
  let discoveryCalls = 0;
  let presented: HumanWalletApprovalRequest | undefined;
  const requestApproval = async (value: unknown) => {
    approvalCalls += 1;
    const request = value as HumanWalletApprovalRequest;
    presented = request;
    const digest = Buffer.from(
      request.preparedTransactionHash.slice("sha256:".length),
      "hex",
    );
    const signature: Record<string, string> = {
      party: request.approval.payerParty,
      signature: key.sign(digest).toString("base64"),
      signatureFormat: key.signatureFormat,
      signedBy: fingerprint,
      signingAlgorithm: key.signingAlgorithm,
    };
    options.mutateSignature?.(signature, request);
    const response = {
      version: HUMAN_WALLET_SIGNING_RESPONSE_VERSION,
      outcome: "approved",
      preparedTransactionHash: request.preparedTransactionHash,
      sessionId: request.sessionId,
      signature: signature as HumanWalletSignatureEnvelope,
    };
    return (await options.approval?.(request, response)) ?? response;
  };
  const discover = async () => {
    discoveryCalls += 1;
    if (discoveryCalls === 1 || options.rediscover === undefined) {
      return capabilities;
    }
    return await options.rediscover(capabilities);
  };
  const preflight = await createHumanWalletConnectorPreflight({
    ...humanPreflightInput(
      capabilities,
      HUMAN_PACKAGE_ID,
      observePayerIdentity,
    ),
    connector: { discover, requestApproval },
  });
  if (preflight.outcome !== "compatible") {
    throw new Error("test signing wallet must be compatible");
  }
  const preparedInput = await humanPreparedHashInputsForPurchase({
    walletPreflight: preflight,
    mutateChallenge: (challenge) => {
      challenge.accepts[0]!.extra.feePayer = payerParty;
    },
  });
  const prepared = await verifyHumanPreparedPurchaseHash(
    preparedInput.observation,
    { recomputeOfficialHash: async () => preparedInput.digest },
  );
  return {
    approvalCalls: () => approvalCalls,
    capabilities,
    discoveryCalls: () => discoveryCalls,
    fingerprint,
    payerParty,
    preflight,
    prepared,
    preparedInput,
    presented: () => presented,
    registeredKey: {
      fingerprint,
      publicKey: key.publicKey.toString("base64"),
      publicKeyFormat: key.publicKeyFormat,
    },
  };
}
