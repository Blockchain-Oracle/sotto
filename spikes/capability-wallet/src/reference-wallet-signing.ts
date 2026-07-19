import {
  SDK,
  getPublicKeyFromPrivate,
  signTransactionHash,
} from "@canton-network/wallet-sdk";
import { withReferenceWalletPrivateKey } from "./reference-wallet-key.js";

const HASH = /^sha256:[0-9a-f]{64}$/u;
const FINGERPRINT = /^1220[0-9a-f]{64}$/u;

export type ReferenceWalletPreparedHashSignature = Readonly<{
  signatureBase64: string;
  signatureFormat: "SIGNATURE_FORMAT_CONCAT";
  signedBy: `1220${string}`;
  signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519";
}>;

/**
 * Signs one already-verified Canton V2 prepared-transaction hash with the
 * reference wallet key file. Extracted from the reference human wallet
 * runner's approved-signing path so a hosted wallet surface can reuse the
 * proven mechanics without going through the CLI handoff exchange. The key
 * bytes never leave this function.
 */
export async function signReferenceWalletPreparedHash(
  keyFile: string,
  preparedTransactionHash: string,
  expectedFingerprint: string,
): Promise<ReferenceWalletPreparedHashSignature> {
  if (!HASH.test(preparedTransactionHash)) {
    throw new Error("reference wallet prepared transaction hash is invalid");
  }
  if (!FINGERPRINT.test(expectedFingerprint)) {
    throw new Error("reference wallet expected fingerprint is invalid");
  }
  const sdk = SDK.createOffline();
  return await withReferenceWalletPrivateKey(keyFile, async (key) => {
    const privateKey = key.toString("base64");
    const publicKey = getPublicKeyFromPrivate(privateKey);
    const signedBy = await sdk.keys.fingerprint(publicKey);
    if (signedBy !== expectedFingerprint) {
      throw new Error(
        "reference wallet key does not match the registered payer",
      );
    }
    const digest = Buffer.from(
      preparedTransactionHash.slice("sha256:".length),
      "hex",
    ).toString("base64");
    return Object.freeze({
      signatureBase64: signTransactionHash(digest, privateKey),
      signatureFormat: "SIGNATURE_FORMAT_CONCAT" as const,
      signedBy: signedBy as `1220${string}`,
      signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519" as const,
    });
  });
}
