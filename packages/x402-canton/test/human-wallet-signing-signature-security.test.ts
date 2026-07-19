import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHumanWalletSigningSession } from "../src/index.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  signedHumanWalletInputs,
  type HumanSignatureMutation,
} from "./human-wallet-signing-session.fixtures.js";

describe("policy-free human wallet signature security", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it.each<readonly [string, HumanSignatureMutation]>([
    [
      "Party",
      (signature) =>
        (signature.party = `sotto-attacker::1220${"f".repeat(64)}`),
    ],
    [
      "fingerprint",
      (signature) => (signature.signedBy = `1220${"f".repeat(64)}`),
    ],
    [
      "format",
      (signature) => (signature.signatureFormat = "SIGNATURE_FORMAT_DER"),
    ],
    [
      "algorithm",
      (signature) =>
        (signature.signingAlgorithm = "SIGNING_ALGORITHM_SPEC_EC_DSA_SHA_256"),
    ],
  ])(
    "rejects a wrong %s before key lookup",
    async (_label, mutateSignature) => {
      const input = await signedHumanWalletInputs({ mutateSignature });
      const resolveRegisteredPublicKey = vi.fn(async () => input.registeredKey);

      await expect(
        createHumanWalletSigningSession(
          { preflight: input.preflight, prepared: input.prepared },
          { resolveRegisteredPublicKey },
        ),
      ).rejects.toThrow(/signature.*(identity|scheme)/iu);
      expect(resolveRegisteredPublicKey).not.toHaveBeenCalled();
    },
  );

  it("rejects malformed signature bytes before key lookup", async () => {
    const input = await signedHumanWalletInputs({
      mutateSignature: (signature) => {
        signature.signature = "not-base64";
      },
    });
    const resolveRegisteredPublicKey = vi.fn(async () => input.registeredKey);

    await expect(
      createHumanWalletSigningSession(
        { preflight: input.preflight, prepared: input.prepared },
        { resolveRegisteredPublicKey },
      ),
    ).rejects.toThrow(/signature verification failed/iu);
    expect(resolveRegisteredPublicKey).not.toHaveBeenCalled();
  });

  it("rejects invalid cryptography after one trusted key lookup", async () => {
    const input = await signedHumanWalletInputs({
      mutateSignature: (signature) => {
        signature.signature = Buffer.alloc(64, 7).toString("base64");
      },
    });
    const resolveRegisteredPublicKey = vi.fn(async () => input.registeredKey);

    await expect(
      createHumanWalletSigningSession(
        { preflight: input.preflight, prepared: input.prepared },
        { resolveRegisteredPublicKey },
      ),
    ).rejects.toThrow(/signature verification failed/iu);
    expect(resolveRegisteredPublicKey).toHaveBeenCalledOnce();
    await expect(
      createHumanWalletSigningSession(
        { preflight: input.preflight, prepared: input.prepared },
        { resolveRegisteredPublicKey },
      ),
    ).rejects.toThrow(/already claimed/iu);
    expect(input.approvalCalls()).toBe(1);
  });

  it("sanitizes a trusted key lookup failure", async () => {
    const input = await signedHumanWalletInputs();
    const resolveRegisteredPublicKey = vi.fn(async () => {
      throw new Error("private upstream credential detail");
    });

    const failure = createHumanWalletSigningSession(
      { preflight: input.preflight, prepared: input.prepared },
      { resolveRegisteredPublicKey },
    );
    await expect(failure).rejects.toEqual(
      new Error("human wallet registered public-key lookup failed"),
    );
  });

  it("rejects accessor-backed registered keys without invocation", async () => {
    const input = await signedHumanWalletInputs();
    const readFingerprint = vi.fn(() => input.registeredKey.fingerprint);
    const registeredKey = { ...input.registeredKey };
    Object.defineProperty(registeredKey, "fingerprint", {
      enumerable: true,
      get: readFingerprint,
    });

    await expect(
      createHumanWalletSigningSession(
        { preflight: input.preflight, prepared: input.prepared },
        { resolveRegisteredPublicKey: async () => registeredKey },
      ),
    ).rejects.toThrow(/registered public key is invalid/iu);
    expect(readFingerprint).not.toHaveBeenCalled();
  });

  it("rejects proxied approval responses without invoking traps", async () => {
    const inspectResponse = vi.fn(Reflect.getOwnPropertyDescriptor);
    const input = await signedHumanWalletInputs({
      approval: async (_request, response) =>
        new Proxy(response, { getOwnPropertyDescriptor: inspectResponse }),
    });
    const resolveRegisteredPublicKey = vi.fn(async () => input.registeredKey);

    await expect(
      createHumanWalletSigningSession(
        { preflight: input.preflight, prepared: input.prepared },
        { resolveRegisteredPublicKey },
      ),
    ).rejects.toThrow(/approval response/iu);
    expect(inspectResponse).not.toHaveBeenCalled();
    expect(resolveRegisteredPublicKey).not.toHaveBeenCalled();
  });

  it("rejects a response for another session before key lookup", async () => {
    const input = await signedHumanWalletInputs({
      approval: async (_request, response) => ({
        ...response,
        sessionId: `sha256:${"f".repeat(64)}`,
      }),
    });
    const resolveRegisteredPublicKey = vi.fn(async () => input.registeredKey);

    await expect(
      createHumanWalletSigningSession(
        { preflight: input.preflight, prepared: input.prepared },
        { resolveRegisteredPublicKey },
      ),
    ).rejects.toThrow(/does not match the session/iu);
    expect(resolveRegisteredPublicKey).not.toHaveBeenCalled();
  });
});
