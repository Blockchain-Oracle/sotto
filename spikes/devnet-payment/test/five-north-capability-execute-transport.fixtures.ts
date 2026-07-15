import { PreparedTransaction } from "@canton-network/core-ledger-proto";
import {
  buildBoundedCapabilityBootstrap,
  createCapabilityWalletSigningSession,
  createPreparedCapabilityBootstrapObserver,
  recomputeWalletPreparedHashPrecheck,
  verifyCapabilityWalletSignature,
  verifyPreparedCapabilityBootstrapHash,
  type CapabilityWalletConnector,
  type CapabilityWalletSignatureEnvelope,
  type VerifiedCapabilityWalletSignature,
} from "@sotto/x402-canton";
import { buildBoundedCapabilityBootstrapPrepareRequest } from "@sotto/x402-canton/internal/bounded-capability-bootstrap-prepare";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  CAPABILITY_BOOTSTRAP_INPUT,
  validPreparedCapabilityBootstrapFromPrepare,
} from "../../../packages/x402-canton/test/prepared-capability-bootstrap.fixtures.js";

const CONNECTOR_ID = "execute-test-wallet";
const CONNECTOR_ORIGIN = "wallet://execute-test";

type VerifiedExecuteSignatureFixture = Readonly<{
  approved: Readonly<{
    payerParty: string;
    preparedTransaction: Uint8Array;
    preparedTransactionHash: `sha256:${string}`;
    sessionId: `sha256:${string}`;
    signature: CapabilityWalletSignatureEnvelope;
  }>;
  verified: VerifiedCapabilityWalletSignature;
}>;

function fingerprint(publicKey: Uint8Array): string {
  const digest = createHash("sha256")
    .update(Buffer.from([0, 0, 0, 12]))
    .update(publicKey)
    .digest("hex");
  return `1220${digest}`;
}

export async function verifiedExecuteSignature(): Promise<VerifiedExecuteSignatureFixture> {
  const request = buildBoundedCapabilityBootstrap(CAPABILITY_BOOTSTRAP_INPUT);
  const prepareRequest = buildBoundedCapabilityBootstrapPrepareRequest(request);
  const transaction = PreparedTransaction.toBinary(
    validPreparedCapabilityBootstrapFromPrepare(prepareRequest),
    { writeUnknownFields: false },
  );
  const digest = await recomputeWalletPreparedHashPrecheck(transaction);
  const observation = await createPreparedCapabilityBootstrapObserver(
    async () =>
      new TextEncoder().encode(
        JSON.stringify({
          costEstimation: null,
          hashingDetails: null,
          hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
          preparedTransaction: Buffer.from(transaction).toString("base64"),
          preparedTransactionHash: Buffer.from(digest).toString("base64"),
        }),
      ),
  )(request);
  const prepared = await verifyPreparedCapabilityBootstrapHash(observation, {
    recomputeOfficialHash: async () => digest,
  });
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const rawPublicKey = Buffer.from(
    publicKey.export({ format: "jwk" }).x!,
    "base64url",
  );
  const signedBy = fingerprint(rawPublicKey);
  const signature = sign(null, digest, privateKey).toString("base64");
  const connector: CapabilityWalletConnector = {
    discover: async () => ({
      connectorId: CONNECTOR_ID,
      connectorKind: "wallet-sdk",
      explicitApproval: true,
      hashingSchemeVersions: ["HASHING_SCHEME_VERSION_V2"],
      networks: [CAPABILITY_BOOTSTRAP_INPUT.network],
      origin: CONNECTOR_ORIGIN,
      packageIds: [
        "4d614496ec9b30b22545fd350ecb9ec999164cfb0b5953f46dbbf937f8918f57",
      ],
      payerParty: CAPABILITY_BOOTSTRAP_INPUT.payerParty,
      preparedTransactionSigning: true,
      signatureFormats: ["SIGNATURE_FORMAT_CONCAT"],
      signingAlgorithms: ["SIGNING_ALGORITHM_SPEC_ED25519"],
      version: "sotto-capability-wallet-capabilities-v1",
    }),
    requestApproval: async () => ({
      outcome: "approved",
      signature: {
        party: CAPABILITY_BOOTSTRAP_INPUT.payerParty,
        signature,
        signatureFormat: "SIGNATURE_FORMAT_CONCAT",
        signedBy,
        signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519",
      },
    }),
  };
  const session = await createCapabilityWalletSigningSession({
    connector,
    connectorId: CONNECTOR_ID,
    connectorOrigin: CONNECTOR_ORIGIN,
    prepared,
    timeoutMilliseconds: 1_000,
  });
  if (session.outcome !== "approved") throw new Error("test wallet failed");
  const verified = await verifyCapabilityWalletSignature(session, {
    resolveRegisteredPublicKey: async () => ({
      fingerprint: signedBy,
      publicKey: rawPublicKey.toString("base64"),
      publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
    }),
  });
  return {
    approved: {
      payerParty: CAPABILITY_BOOTSTRAP_INPUT.payerParty,
      preparedTransaction: transaction,
      preparedTransactionHash:
        `sha256:${Buffer.from(digest).toString("hex")}` as const,
      sessionId: session.sessionId,
      signature: session.signature,
    },
    verified,
  };
}
