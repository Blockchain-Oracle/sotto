import { getPublicKeyFromPrivate, SDK } from "@canton-network/wallet-sdk";
import { withReferenceWalletPrivateKey } from "./reference-wallet-key.js";

const FINGERPRINT = /^1220[0-9a-f]{64}$/u;

export type ReferenceWalletPublicIdentity = Readonly<{
  fingerprint: `1220${string}`;
  publicKey: string;
  publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW";
}>;

export async function readReferenceWalletPublicIdentity(
  keyFile: string,
): Promise<ReferenceWalletPublicIdentity> {
  return withReferenceWalletPrivateKey(keyFile, async (key) => {
    const sdk = SDK.createOffline();
    const publicKey = getPublicKeyFromPrivate(key.toString("base64"));
    const fingerprint = await sdk.keys.fingerprint(publicKey);
    if (!FINGERPRINT.test(fingerprint)) {
      throw new Error("reference wallet public-key fingerprint is invalid");
    }
    return Object.freeze({
      fingerprint: fingerprint as `1220${string}`,
      publicKey,
      publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW" as const,
    });
  });
}

export async function recomputeReferenceWalletPreparedHash(
  preparedTransaction: Uint8Array,
): Promise<Uint8Array> {
  if (!(preparedTransaction instanceof Uint8Array)) {
    throw new Error("reference wallet prepared transaction is invalid");
  }
  const digest = await SDK.createOffline().utils.hash.preparedTransaction(
    Buffer.from(preparedTransaction).toString("base64"),
  );
  const bytes = Buffer.from(digest.toHex(), "hex");
  if (bytes.byteLength !== 32) {
    throw new Error("reference wallet prepared hash is invalid");
  }
  return new Uint8Array(bytes);
}
