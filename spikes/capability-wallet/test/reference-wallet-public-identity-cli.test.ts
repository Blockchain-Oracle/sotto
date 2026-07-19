import { expect, it, vi } from "vitest";
import { runReferenceWalletPublicIdentityCli } from "../src/reference-wallet-public-identity-cli.js";

const FINGERPRINT = `1220${"a".repeat(64)}` as const;

it("returns only the exact reviewed public identity", async () => {
  const readIdentity = vi.fn(async () =>
    Object.freeze({
      fingerprint: FINGERPRINT,
      publicKey: Buffer.alloc(32, 7).toString("base64"),
      publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW" as const,
    }),
  );

  await expect(
    runReferenceWalletPublicIdentityCli(
      [
        "--key-file",
        "/wallet/payer.key",
        "--expected-fingerprint",
        FINGERPRINT,
      ],
      { readIdentity },
    ),
  ).resolves.toMatchObject({ fingerprint: FINGERPRINT });
  expect(readIdentity).toHaveBeenCalledWith("/wallet/payer.key");
  await expect(
    runReferenceWalletPublicIdentityCli(
      [
        "--key-file",
        "/wallet/payer.key",
        "--expected-fingerprint",
        `1220${"b".repeat(64)}`,
      ],
      { readIdentity },
    ),
  ).rejects.toThrow(/fingerprint.*approval/iu);
});
