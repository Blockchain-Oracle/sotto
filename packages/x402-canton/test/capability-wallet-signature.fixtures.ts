import {
  createHash,
  generateKeyPairSync,
  sign as signBytes,
} from "node:crypto";
import {
  createCapabilityWalletSigningSession,
  type CapabilityWalletConnector,
} from "../src/index.js";
import {
  CONNECTOR_CAPABILITIES,
  CONNECTOR_ID,
  CONNECTOR_ORIGIN,
  verifiedCapabilityBootstrap,
} from "./capability-wallet-connector.fixtures.js";
import { CAPABILITY_BOOTSTRAP_INPUT } from "./prepared-capability-bootstrap.fixtures.js";

export type SignatureProfile = "ecdsa" | "ed25519";

const profiles = {
  ecdsa: {
    publicKeyFormat: "PUBLIC_KEY_FORMAT_DER_SPKI",
    signatureFormat: "SIGNATURE_FORMAT_DER",
    signingAlgorithm: "SIGNING_ALGORITHM_SPEC_EC_DSA_SHA_256",
  },
  ed25519: {
    publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
    signatureFormat: "SIGNATURE_FORMAT_CONCAT",
    signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519",
  },
} as const;

function fingerprint(publicKey: Uint8Array): string {
  const digest = createHash("sha256")
    .update(Buffer.from([0, 0, 0, 12]))
    .update(publicKey)
    .digest("hex");
  return `1220${digest}`;
}

function signer(profile: SignatureProfile) {
  if (profile === "ed25519") {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const rawPublicKey = Buffer.from(
      publicKey.export({ format: "jwk" }).x!,
      "base64url",
    );
    return {
      publicKey: rawPublicKey,
      sign: (digest: Uint8Array) => signBytes(null, digest, privateKey),
    };
  }
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  return {
    publicKey: publicKey.export({ format: "der", type: "spki" }),
    sign: (digest: Uint8Array) => signBytes("sha256", digest, privateKey),
  };
}

export async function signedCapabilitySession(
  profile: SignatureProfile,
  mutateResponse?: (signature: Record<string, string>) => void,
) {
  const prepared = await verifiedCapabilityBootstrap();
  const scheme = profiles[profile];
  const key = signer(profile);
  const signedBy = fingerprint(key.publicKey);
  const connector: CapabilityWalletConnector = {
    discover: async () => ({
      ...CONNECTOR_CAPABILITIES,
      signatureFormats: [scheme.signatureFormat],
      signingAlgorithms: [scheme.signingAlgorithm],
    }),
    requestApproval: async (request) => {
      const digest = Buffer.from(
        request.preparedTransactionHash.slice("sha256:".length),
        "hex",
      );
      const signature: Record<string, string> = {
        party: request.approval.payerParty,
        signature: key.sign(digest).toString("base64"),
        signatureFormat: scheme.signatureFormat,
        signedBy,
        signingAlgorithm: scheme.signingAlgorithm,
      };
      mutateResponse?.(signature);
      return { outcome: "approved", signature };
    },
  };
  const session = await createCapabilityWalletSigningSession({
    connector,
    connectorId: CONNECTOR_ID,
    connectorOrigin: CONNECTOR_ORIGIN,
    prepared,
    timeoutMilliseconds: 1_000,
  });
  if (session.outcome !== "approved") {
    throw new Error("test wallet did not approve");
  }
  return {
    payerParty: CAPABILITY_BOOTSTRAP_INPUT.payerParty,
    registeredKey: {
      fingerprint: signedBy,
      publicKey: key.publicKey.toString("base64"),
      publicKeyFormat: scheme.publicKeyFormat,
    },
    scheme,
    session,
  };
}
