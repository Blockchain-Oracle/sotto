import {
  HUMAN_WALLET_SIGNING_SESSION_VERSION,
  type HumanWalletSignatureEnvelope,
  type VerifiedHumanWalletSigningSession,
} from "@sotto/x402-canton";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { registerVerifiedHumanWalletSigningSession } from "../../../packages/x402-canton/dist/human-wallet-signing-session-state.js";

type VerifiedHumanExecuteFixture = Readonly<{
  approved: Readonly<{
    payerParty: string;
    preparedTransaction: Uint8Array;
    preparedTransactionHash: `sha256:${string}`;
    sessionId: `sha256:${string}`;
    signature: HumanWalletSignatureEnvelope;
  }>;
  verified: VerifiedHumanWalletSigningSession;
}>;

export async function verifiedHumanExecuteSession(): Promise<VerifiedHumanExecuteFixture> {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const rawPublicKey = Buffer.from(
    publicKey.export({ format: "jwk" }).x!,
    "base64url",
  );
  const signedBy = `1220${createHash("sha256")
    .update(Buffer.from([0, 0, 0, 12]))
    .update(rawPublicKey)
    .digest("hex")}`;
  const payerParty = `sotto-external-payer::${signedBy}`;
  const preparedTransaction = new Uint8Array([1, 2, 3, 4, 5]);
  const digest = createHash("sha256").update(preparedTransaction).digest();
  const preparedTransactionHash = `sha256:${digest.toString("hex")}` as const;
  const signature = Object.freeze({
    party: payerParty,
    signature: sign(null, digest, privateKey).toString("base64"),
    signatureFormat: "SIGNATURE_FORMAT_CONCAT" as const,
    signedBy,
    signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519" as const,
  });
  const sessionId = `sha256:${"7".repeat(64)}` as const;
  const verified = Object.freeze({
    version: HUMAN_WALLET_SIGNING_SESSION_VERSION,
    connectorId: "execute-test-human-wallet",
    connectorKind: "wallet-sdk" as const,
    origin: "wallet://execute-human-test",
    outcome: "verified" as const,
    preparedTransactionHash,
    sessionId,
    verifiedAt: new Date().toISOString(),
  }) as VerifiedHumanWalletSigningSession;
  registerVerifiedHumanWalletSigningSession(verified, {
    connectorId: verified.connectorId,
    connectorKind: verified.connectorKind,
    createdAt: Date.now(),
    expiresAt: Date.now() + 600_000,
    network: "canton:devnet",
    origin: verified.origin,
    packageId: "a".repeat(64),
    party: payerParty,
    preparedTransaction,
    preparedTransactionHash,
    purchaseCommitment: `sha256:${"8".repeat(64)}`,
    sessionId,
    signature,
    synchronizerId: `global-domain::1220${"b".repeat(64)}`,
  });
  return {
    approved: {
      payerParty,
      preparedTransaction,
      preparedTransactionHash,
      sessionId,
      signature,
    },
    verified,
  };
}
