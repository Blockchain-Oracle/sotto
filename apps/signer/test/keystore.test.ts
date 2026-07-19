import { createPublicKey, verify as verifySignature } from "node:crypto";
import { lstatSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { signReferenceWalletPreparedHash } from "@sotto/capability-wallet";
import { createSignerKeystore } from "../src/keystore.js";
import { temporaryKeyDirectory } from "./fixtures.js";

const cleanups: string[] = [];
afterEach(() => {
  for (const path of cleanups.splice(0)) {
    rmSync(path, { force: true, recursive: true });
  }
});

describe("signer keystore", () => {
  it("creates reference-format Ed25519 key files with owner-only modes", async () => {
    const directory = temporaryKeyDirectory();
    cleanups.push(directory);
    const keystore = await createSignerKeystore(directory);
    const created = await keystore.createWalletKey();

    const keysDirectory = join(directory, "keys");
    expect(lstatSync(keysDirectory).mode & 0o777).toBe(0o700);
    const keyPath = keystore.keyFilePath(created.walletId);
    const status = lstatSync(keyPath);
    expect(status.mode & 0o777).toBe(0o600);
    expect(status.size).toBe(64);
    expect(created.identity.fingerprint).toMatch(/^1220[0-9a-f]{64}$/u);
    expect(created.identity.publicKeyFormat).toBe("PUBLIC_KEY_FORMAT_RAW");
    // The stored public half must match the derived identity public key.
    const material = readFileSync(keyPath);
    expect(material.subarray(32).toString("base64")).toBe(
      created.identity.publicKey,
    );
  });

  it("signs a prepared hash that verifies against the wallet public key", async () => {
    const directory = temporaryKeyDirectory();
    cleanups.push(directory);
    const keystore = await createSignerKeystore(directory);
    const created = await keystore.createWalletKey();
    const hashHex = "ab".repeat(32);
    const signature = await signReferenceWalletPreparedHash(
      keystore.keyFilePath(created.walletId),
      `sha256:${hashHex}`,
      created.identity.fingerprint,
    );
    expect(signature.signatureFormat).toBe("SIGNATURE_FORMAT_CONCAT");
    expect(signature.signingAlgorithm).toBe("SIGNING_ALGORITHM_SPEC_ED25519");
    expect(signature.signedBy).toBe(created.identity.fingerprint);
    const publicKey = createPublicKey({
      format: "jwk",
      key: {
        crv: "Ed25519",
        kty: "OKP",
        x: Buffer.from(created.identity.publicKey, "base64").toString(
          "base64url",
        ),
      },
    });
    expect(
      verifySignature(
        null,
        Buffer.from(hashHex, "hex"),
        publicKey,
        Buffer.from(signature.signatureBase64, "base64"),
      ),
    ).toBe(true);
  });

  it("refuses signing with a mismatched expected fingerprint", async () => {
    const directory = temporaryKeyDirectory();
    cleanups.push(directory);
    const keystore = await createSignerKeystore(directory);
    const created = await keystore.createWalletKey();
    await expect(
      signReferenceWalletPreparedHash(
        keystore.keyFilePath(created.walletId),
        `sha256:${"ab".repeat(32)}`,
        `1220${"00".repeat(32)}`,
      ),
    ).rejects.toThrow(/does not match/);
  });
});
