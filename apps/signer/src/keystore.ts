import { generateKeyPairSync, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { open, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  readReferenceWalletPublicIdentity,
  type ReferenceWalletPublicIdentity,
} from "@sotto/capability-wallet";
import { ensureOwnerOnlyDirectory, RECORD_ID_PATTERN } from "./store.js";

const KEY_FLAGS =
  constants.O_WRONLY |
  constants.O_CREAT |
  constants.O_EXCL |
  constants.O_NOFOLLOW;

export type SignerKeystore = Readonly<{
  createWalletKey: () => Promise<
    Readonly<{ identity: ReferenceWalletPublicIdentity; walletId: string }>
  >;
  keyFilePath: (walletId: string) => string;
}>;

function requireWalletId(walletId: string): string {
  if (!RECORD_ID_PATTERN.test(walletId)) {
    throw new Error("signer wallet ID is invalid");
  }
  return walletId;
}

/**
 * Generates a fresh Ed25519 key with node:crypto in the reference wallet key
 * file format: 64 raw bytes (32-byte seed followed by the 32-byte public
 * key), mode 0600, exactly one link. The private bytes are zeroed after the
 * write and are never returned, logged, or sent over HTTP.
 */
function generateReferenceWalletKeyBytes(): Readonly<{
  material: Buffer;
  publicKeyBase64: string;
}> {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const secretJwk = privateKey.export({ format: "jwk" });
  const publicJwk = publicKey.export({ format: "jwk" });
  if (typeof secretJwk.d !== "string" || typeof publicJwk.x !== "string") {
    throw new Error("signer key generation produced no Ed25519 material");
  }
  const seed = Buffer.from(secretJwk.d, "base64url");
  const publicBytes = Buffer.from(publicJwk.x, "base64url");
  if (seed.byteLength !== 32 || publicBytes.byteLength !== 32) {
    seed.fill(0);
    throw new Error("signer key generation produced invalid Ed25519 material");
  }
  const material = Buffer.concat([seed, publicBytes]);
  seed.fill(0);
  return {
    material,
    publicKeyBase64: publicBytes.toString("base64"),
  };
}

async function writeKeyFile(path: string, material: Buffer): Promise<void> {
  const handle = await open(path, KEY_FLAGS, 0o600);
  try {
    await handle.writeFile(material);
    await handle.chmod(0o600);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function createSignerKeystore(
  keyDirectory: string,
): Promise<SignerKeystore> {
  const keysDirectory = await ensureOwnerOnlyDirectory(
    join(keyDirectory, "keys"),
  );
  const keyFilePath = (walletId: string) =>
    join(keysDirectory, `${requireWalletId(walletId)}.key`);

  const createWalletKey = async () => {
    const walletId = randomBytes(16).toString("hex");
    const path = keyFilePath(walletId);
    const generated = generateReferenceWalletKeyBytes();
    try {
      await writeKeyFile(path, generated.material);
    } finally {
      generated.material.fill(0);
    }
    let identity: ReferenceWalletPublicIdentity;
    try {
      identity = await readReferenceWalletPublicIdentity(path);
      if (identity.publicKey !== generated.publicKeyBase64) {
        throw new Error(
          "signer key file does not match the reference wallet format",
        );
      }
    } catch (error) {
      await unlink(path);
      throw error;
    }
    return Object.freeze({ identity, walletId });
  };

  return Object.freeze({ createWalletKey, keyFilePath });
}
