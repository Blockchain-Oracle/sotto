import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createHumanWalletConnectorPreflight,
  createHumanWalletSigningSession,
  HUMAN_WALLET_SIGNING_REQUEST_VERSION,
  HUMAN_WALLET_SIGNING_RESPONSE_VERSION,
  HUMAN_WALLET_SIGNING_SESSION_VERSION,
} from "../src/index.js";
import { verifyHumanPreparedPurchaseHash } from "../src/human-prepared-purchase-hash.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import { humanPreparedHashInputsForPurchase } from "./human-prepared-purchase-hash.fixtures.js";
import {
  HUMAN_CONNECTOR_CAPABILITIES,
  HUMAN_CONNECTOR_ID,
  HUMAN_CONNECTOR_ORIGIN,
  humanPreflightInput,
} from "./human-wallet-connector-preflight.fixtures.js";
import { signedHumanWalletInputs } from "./human-wallet-signing-session.fixtures.js";

async function rejectedSessionInputs() {
  let presented: Record<string, unknown> | undefined;
  const requestApproval = vi.fn(async (value: unknown) => {
    presented = value as Record<string, unknown>;
    return {
      version: HUMAN_WALLET_SIGNING_RESPONSE_VERSION,
      outcome: "rejected",
      reason: "user-rejected",
      sessionId: presented.sessionId,
    };
  });
  const preflight = await createHumanWalletConnectorPreflight({
    ...humanPreflightInput(),
    connector: {
      discover: async () => HUMAN_CONNECTOR_CAPABILITIES,
      requestApproval,
    },
  });
  if (preflight.outcome !== "compatible") {
    throw new Error("test wallet must be compatible");
  }
  const preparedInput = await humanPreparedHashInputsForPurchase({
    walletPreflight: preflight,
  });
  const prepared = await verifyHumanPreparedPurchaseHash(
    preparedInput.observation,
    { recomputeOfficialHash: async () => preparedInput.digest },
  );
  return {
    preflight,
    prepared,
    preparedInput,
    presented: () => presented,
    requestApproval,
  };
}

describe("policy-free human wallet signing session", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("presents one exact purchase and consumes an explicit rejection", async () => {
    const input = await rejectedSessionInputs();
    const resolveRegisteredPublicKey = vi.fn();

    const result = await createHumanWalletSigningSession(
      { preflight: input.preflight, prepared: input.prepared },
      { resolveRegisteredPublicKey },
      { timeoutMilliseconds: 600_000 },
    );

    expect(result).toEqual({
      version: HUMAN_WALLET_SIGNING_SESSION_VERSION,
      outcome: "rejected",
      reason: "user-rejected",
      sessionId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      connectorId: HUMAN_CONNECTOR_ID,
      connectorKind: "wallet-sdk",
      origin: HUMAN_CONNECTOR_ORIGIN,
    });
    expect(input.requestApproval).toHaveBeenCalledOnce();
    expect(resolveRegisteredPublicKey).not.toHaveBeenCalled();
    if (result.outcome !== "rejected") {
      throw new Error("test wallet rejection was not preserved");
    }
    expect(input.presented()).toMatchObject({
      version: HUMAN_WALLET_SIGNING_REQUEST_VERSION,
      approval: {
        action: "pay-for-api-call",
        authorizationMode: "human-wallet",
        purchaseCommitment: input.preparedInput.intent.purchaseCommitment,
      },
      connectorId: HUMAN_CONNECTOR_ID,
      connectorKind: "wallet-sdk",
      connectorOrigin: HUMAN_CONNECTOR_ORIGIN,
      createdAt: HUMAN_PURCHASE_NOW,
      expiresAt: "2026-07-16T15:10:00.000Z",
      preparedTransaction: expect.any(Uint8Array),
      preparedTransactionHash: `sha256:${Buffer.from(
        input.preparedInput.digest,
      ).toString("hex")}`,
      sessionId: result.sessionId,
    });
    await expect(
      createHumanWalletSigningSession(
        { preflight: input.preflight, prepared: input.prepared },
        { resolveRegisteredPublicKey },
        { timeoutMilliseconds: 600_000 },
      ),
    ).rejects.toThrow(/already claimed/iu);
    expect(input.requestApproval).toHaveBeenCalledOnce();
  });

  it("verifies one real payer signature against the trusted registered key", async () => {
    const input = await signedHumanWalletInputs();
    const resolveRegisteredPublicKey = vi.fn(async (query: unknown) => {
      expect(query).toEqual({
        keyPurpose: "SIGNING",
        network: "canton:devnet",
        party: input.payerParty,
        publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
        signatureFormat: "SIGNATURE_FORMAT_CONCAT",
        signedBy: input.fingerprint,
        signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519",
        subjectHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
        synchronizerId: expect.any(String),
        topologyHash: expect.any(String),
      });
      return input.registeredKey;
    });

    const result = await createHumanWalletSigningSession(
      { preflight: input.preflight, prepared: input.prepared },
      { resolveRegisteredPublicKey },
      { timeoutMilliseconds: 600_000 },
    );

    expect(result).toEqual({
      version: HUMAN_WALLET_SIGNING_SESSION_VERSION,
      outcome: "verified",
      sessionId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      connectorId: HUMAN_CONNECTOR_ID,
      connectorKind: "wallet-sdk",
      origin: HUMAN_CONNECTOR_ORIGIN,
      preparedTransactionHash: `sha256:${Buffer.from(
        input.preparedInput.digest,
      ).toString("hex")}`,
      verifiedAt: HUMAN_PURCHASE_NOW,
    });
    expect(resolveRegisteredPublicKey).toHaveBeenCalledOnce();
    expect(input.presented()?.approval.signer.publicKeyFingerprint).toBe(
      input.fingerprint,
    );
    expect(JSON.stringify(result)).not.toMatch(
      /signature|publicKey|topology|subject|preparedTransaction"/iu,
    );
  });

  it("verifies the negotiated P-256 signature profile", async () => {
    const input = await signedHumanWalletInputs({ profile: "ecdsa" });

    await expect(
      createHumanWalletSigningSession(
        { preflight: input.preflight, prepared: input.prepared },
        { resolveRegisteredPublicKey: async () => input.registeredKey },
      ),
    ).resolves.toMatchObject({ outcome: "verified" });
    expect(input.presented()?.approval.signer).toMatchObject({
      publicKeyFormat: "PUBLIC_KEY_FORMAT_DER_SPKI",
      signatureFormat: "SIGNATURE_FORMAT_DER",
      signingAlgorithm: "SIGNING_ALGORITHM_SPEC_EC_DSA_SHA_256",
    });
  });

  it("starts from verified preparation after its acquisition window", async () => {
    const input = await signedHumanWalletInputs();
    vi.advanceTimersByTime(10_001);

    await expect(
      createHumanWalletSigningSession(
        { preflight: input.preflight, prepared: input.prepared },
        { resolveRegisteredPublicKey: async () => input.registeredKey },
      ),
    ).resolves.toMatchObject({ outcome: "verified" });
  });
});
