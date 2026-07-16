import { getPublicKeyFromPrivate, SDK } from "@canton-network/wallet-sdk";

const PRIVATE_KEY_BYTES = 64;
const PUBLIC_KEY_BYTES = 32;

export type ExternalPartyPreflightIdentity = Readonly<{
  fingerprint: `1220${string}`;
  hashTopology: (transactions: readonly string[]) => Promise<string>;
  publicKey: string;
}>;

export async function createEphemeralExternalPartyPreflightIdentity(): Promise<ExternalPartyPreflightIdentity> {
  const offline = SDK.createOffline();
  const generated = offline.keys.generate();
  const privateKey = Buffer.from(generated.privateKey, "base64");
  if (privateKey.length !== PRIVATE_KEY_BYTES) {
    privateKey.fill(0);
    throw new Error("ephemeral external Party private key is invalid");
  }
  try {
    const publicKey = getPublicKeyFromPrivate(privateKey.toString("base64"));
    if (Buffer.from(publicKey, "base64").length !== PUBLIC_KEY_BYTES) {
      throw new Error("ephemeral external Party public key is invalid");
    }
    const fingerprint = await offline.keys.fingerprint(publicKey);
    if (!/^1220[0-9a-f]{64}$/u.test(fingerprint)) {
      throw new Error("ephemeral external Party fingerprint is invalid");
    }
    return Object.freeze({
      fingerprint: fingerprint as `1220${string}`,
      hashTopology: (transactions) =>
        offline.utils.hash.topologyTransaction([...transactions]),
      publicKey,
    });
  } finally {
    privateKey.fill(0);
  }
}
