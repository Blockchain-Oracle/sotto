import {
  claimBoundedPurchaseSigningAuthorization,
  type BoundedPurchaseSigningAuthorization,
} from "@sotto/x402-canton";
import {
  getPublicKeyFromPrivate,
  SDK,
  signTransactionHash,
} from "@canton-network/wallet-sdk";
import { isAbsolute } from "node:path";
import { withReferenceWalletPrivateKey } from "./reference-wallet-key.js";

const FINGERPRINT = /^1220[0-9a-f]{64}$/u;
const PARTY = /^sotto-[^\s:]+::(1220[0-9a-f]{64})$/u;
const CONFIG_KEYS = ["expectedFingerprint", "keyFile", "signal"] as const;

type Config = Readonly<{
  expectedFingerprint: string;
  keyFile: string;
  signal: AbortSignal;
}>;

export type ExternalPartyTransactionSignature = Readonly<{
  party: string;
  signatures: readonly [
    Readonly<{
      format: "SIGNATURE_FORMAT_CONCAT";
      signature: string;
      signedBy: string;
      signingAlgorithmSpec: "SIGNING_ALGORITHM_SPEC_ED25519";
    }>,
  ];
}>;

function requireConfig(candidate: Config): Config {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate) ||
    JSON.stringify(Object.keys(candidate).sort()) !==
      JSON.stringify([...CONFIG_KEYS].sort()) ||
    !FINGERPRINT.test(candidate.expectedFingerprint) ||
    !isAbsolute(candidate.keyFile) ||
    !(candidate.signal instanceof AbortSignal)
  ) {
    throw new Error("external Party bounded signer configuration is invalid");
  }
  return Object.freeze({ ...candidate });
}

export function createExternalPartyBoundedPurchaseSigner(candidate: Config) {
  const config = requireConfig(candidate);
  return async (
    authorization: BoundedPurchaseSigningAuthorization,
  ): Promise<ExternalPartyTransactionSignature> => {
    const material = claimBoundedPurchaseSigningAuthorization(authorization);
    try {
      const match = PARTY.exec(material.party);
      if (match?.[1] !== config.expectedFingerprint) {
        throw new Error(
          "external Party does not match the signing fingerprint",
        );
      }
      if (config.signal.aborted) {
        throw new Error("external Party transaction signing cancelled");
      }
      const signature = await withReferenceWalletPrivateKey(
        config.keyFile,
        async (key) => {
          if (config.signal.aborted) {
            throw new Error("external Party transaction signing cancelled");
          }
          const privateKey = key.toString("base64");
          const publicKey = getPublicKeyFromPrivate(privateKey);
          const signedBy =
            await SDK.createOffline().keys.fingerprint(publicKey);
          if (signedBy !== config.expectedFingerprint) {
            throw new Error("external Party signing key does not match");
          }
          if (config.signal.aborted) {
            throw new Error("external Party transaction signing cancelled");
          }
          return signTransactionHash(
            Buffer.from(material.preparedTransactionHash).toString("base64"),
            privateKey,
          );
        },
      );
      const envelope = Object.freeze({
        format: "SIGNATURE_FORMAT_CONCAT" as const,
        signature,
        signedBy: config.expectedFingerprint,
        signingAlgorithmSpec: "SIGNING_ALGORITHM_SPEC_ED25519" as const,
      });
      return Object.freeze({
        party: material.party,
        signatures: Object.freeze([envelope]) as readonly [typeof envelope],
      });
    } finally {
      material.preparedTransactionHash.fill(0);
    }
  };
}
