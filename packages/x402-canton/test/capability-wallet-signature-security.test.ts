import { createHash, generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as publicApi from "../src/index.js";
import {
  claimVerifiedCapabilityWalletSignature,
  verifyCapabilityWalletSignature,
} from "../src/capability-wallet-signature.js";
import { signedCapabilitySession } from "./capability-wallet-signature.fixtures.js";

const NOW = new Date("2026-07-15T10:00:00.000Z");

describe("capability wallet signature security", () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());

  it.each([
    ["unexpected field", { unexpected: "authority" }],
    ["wrong format", { publicKeyFormat: "PUBLIC_KEY_FORMAT_DER_SPKI" }],
    ["noncanonical key bytes", { publicKey: "AQ" }],
    ["noncanonical fingerprint", { fingerprint: `1220${"A".repeat(64)}` }],
  ])("rejects registered key %s", async (_label, mutation) => {
    const fixture = await signedCapabilitySession("ed25519");

    await expect(
      verifyCapabilityWalletSignature(fixture.session, {
        resolveRegisteredPublicKey: async () => ({
          ...fixture.registeredKey,
          ...mutation,
        }),
      }),
    ).rejects.toThrow(/public.key|fingerprint|format|keys|base64/iu);
  });

  it("rejects a non-P-256 DER public key", async () => {
    const { publicKey } = generateKeyPairSync("ec", { namedCurve: "P-384" });
    const bytes = publicKey.export({ format: "der", type: "spki" });
    const fingerprint = `1220${createHash("sha256")
      .update(Buffer.from([0, 0, 0, 12]))
      .update(bytes)
      .digest("hex")}`;
    const fixture = await signedCapabilitySession("ecdsa", (signature) => {
      signature.signedBy = fingerprint;
    });

    await expect(
      verifyCapabilityWalletSignature(fixture.session, {
        resolveRegisteredPublicKey: async () => ({
          fingerprint,
          publicKey: bytes.toString("base64"),
          publicKeyFormat: "PUBLIC_KEY_FORMAT_DER_SPKI",
        }),
      }),
    ).rejects.toThrow(/public key|scheme/iu);
  });

  it("rejects noncanonical ECDSA DER", async () => {
    const fixture = await signedCapabilitySession("ecdsa", (signature) => {
      signature.signature = Buffer.from("300702020001020101", "hex").toString(
        "base64",
      );
    });

    await expect(
      verifyCapabilityWalletSignature(fixture.session, {
        resolveRegisteredPublicKey: async () => fixture.registeredKey,
      }),
    ).rejects.toThrow(/signature|DER/iu);
  });

  it("bounds a hung public-key lookup by the approved session", async () => {
    const fixture = await signedCapabilitySession("ed25519");
    let resolverSignal: AbortSignal | undefined;
    const verification = verifyCapabilityWalletSignature(fixture.session, {
      resolveRegisteredPublicKey: async (...args: unknown[]) => {
        resolverSignal = (
          args[1] as Readonly<{ signal?: AbortSignal }> | undefined
        )?.signal;
        return new Promise<never>(() => undefined);
      },
    });
    const expectation = expect(verification).rejects.toThrow(/timed out/iu);

    await vi.advanceTimersByTimeAsync(1_000);
    await expectation;
    expect(resolverSignal?.aborted).toBe(true);
  });

  it("rejects malformed signature bytes before registered-key lookup", async () => {
    const fixture = await signedCapabilitySession("ed25519", (signature) => {
      signature.signature = Buffer.alloc(65, 7).toString("base64");
    });
    const resolveRegisteredPublicKey = vi.fn(async () => fixture.registeredKey);

    await expect(
      verifyCapabilityWalletSignature(fixture.session, {
        resolveRegisteredPublicKey,
      }),
    ).rejects.toThrow(/signature/iu);
    expect(resolveRegisteredPublicKey).not.toHaveBeenCalled();
  });

  it("retries the same approval after a transient key-read failure", async () => {
    const fixture = await signedCapabilitySession("ed25519");
    await expect(
      verifyCapabilityWalletSignature(fixture.session, {
        resolveRegisteredPublicKey: async () => {
          throw new Error("transient topology read");
        },
      }),
    ).rejects.toThrow("transient topology read");

    await expect(
      verifyCapabilityWalletSignature(fixture.session, {
        resolveRegisteredPublicKey: async () => fixture.registeredKey,
      }),
    ).resolves.toMatchObject({ outcome: "verified" });
  });

  it("expires verified authority before execute claim", async () => {
    const fixture = await signedCapabilitySession("ed25519");
    const verified = await verifyCapabilityWalletSignature(fixture.session, {
      resolveRegisteredPublicKey: async () => fixture.registeredKey,
    });
    vi.advanceTimersByTime(1_000);

    expect(() => claimVerifiedCapabilityWalletSignature(verified)).toThrow(
      /expired/iu,
    );
  });

  it("keeps signature bytes and execute material outside the public result", async () => {
    const fixture = await signedCapabilitySession("ed25519");
    const verified = await verifyCapabilityWalletSignature(fixture.session, {
      resolveRegisteredPublicKey: async () => fixture.registeredKey,
    });

    expect(verified).not.toHaveProperty("signature");
    expect(verified).not.toHaveProperty("preparedTransaction");
    expect(publicApi).not.toHaveProperty(
      "claimVerifiedCapabilityWalletSignature",
    );
  });
});
