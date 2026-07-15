import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimVerifiedCapabilityWalletSignature,
  verifyCapabilityWalletSignature,
} from "../src/capability-wallet-signature.js";
import {
  signedCapabilitySession,
  type SignatureProfile,
} from "./capability-wallet-signature.fixtures.js";

const NOW = new Date("2026-07-15T10:00:00.000Z");

async function verifySession(profile: SignatureProfile) {
  const fixture = await signedCapabilitySession(profile);
  const resolveRegisteredPublicKey = vi.fn(async () => fixture.registeredKey);
  const verified = await verifyCapabilityWalletSignature(fixture.session, {
    resolveRegisteredPublicKey,
  });
  return { ...fixture, resolveRegisteredPublicKey, verified };
}

describe("capability wallet signature", () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());

  it.each(["ed25519", "ecdsa"] as const)(
    "cryptographically verifies the exact %s profile",
    async (profile) => {
      const result = await verifySession(profile);

      expect(result.resolveRegisteredPublicKey).toHaveBeenCalledOnce();
      expect(result.resolveRegisteredPublicKey).toHaveBeenCalledWith(
        {
          party: result.payerParty,
          signatureFormat: result.scheme.signatureFormat,
          signedBy: result.registeredKey.fingerprint,
          signingAlgorithm: result.scheme.signingAlgorithm,
        },
        { signal: expect.any(AbortSignal) },
      );
      expect(result.verified).toMatchObject({
        party: result.payerParty,
        sessionId: result.session.sessionId,
        signatureFormat: result.scheme.signatureFormat,
        signedBy: result.registeredKey.fingerprint,
        signingAlgorithm: result.scheme.signingAlgorithm,
      });
    },
  );

  it("rejects a signature for a different payer", async () => {
    const fixture = await signedCapabilitySession("ed25519", (signature) => {
      signature.party = "attacker::1220attacker";
    });

    await expect(
      verifyCapabilityWalletSignature(fixture.session, {
        resolveRegisteredPublicKey: async () => fixture.registeredKey,
      }),
    ).rejects.toThrow(/payer|party/iu);
  });

  it.each([
    ["noncanonical base64", (value: string) => value.replace(/=+$/u, "")],
    ["oversized bytes", () => Buffer.alloc(129, 7).toString("base64")],
    [
      "invalid cryptography",
      (value: string) => {
        const bytes = Buffer.from(value, "base64");
        bytes[0] = bytes[0]! ^ 0xff;
        return bytes.toString("base64");
      },
    ],
  ])("rejects %s", async (_label, mutate) => {
    const fixture = await signedCapabilitySession("ed25519", (signature) => {
      signature.signature = mutate(signature.signature!);
    });

    await expect(
      verifyCapabilityWalletSignature(fixture.session, {
        resolveRegisteredPublicKey: async () => fixture.registeredKey,
      }),
    ).rejects.toThrow(/signature|base64/iu);
  });

  it("rejects a registered key that does not match signedBy", async () => {
    const fixture = await signedCapabilitySession("ed25519");

    await expect(
      verifyCapabilityWalletSignature(fixture.session, {
        resolveRegisteredPublicKey: async () => ({
          ...fixture.registeredKey,
          publicKey: Buffer.alloc(32, 5).toString("base64"),
        }),
      }),
    ).rejects.toThrow(/fingerprint|public key/iu);
  });

  it("authenticates exactly one claim for execute transport", async () => {
    const { verified } = await verifySession("ed25519");

    expect(() =>
      claimVerifiedCapabilityWalletSignature({ ...verified }),
    ).toThrow(/not authenticated/iu);
    const claimed = claimVerifiedCapabilityWalletSignature(verified);
    expect(claimed.preparedTransaction).toBeInstanceOf(Uint8Array);
    expect(claimed.signature).toMatch(/^[A-Za-z0-9+/]+={0,2}$/u);
    expect(() => claimVerifiedCapabilityWalletSignature(verified)).toThrow(
      /already claimed/iu,
    );
  });
});
