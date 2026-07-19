import { PreparedTransaction } from "@canton-network/core-ledger-proto";
import {
  buildBoundedCapabilityBootstrap,
  createPreparedCapabilityBootstrapObserver,
  recomputeWalletPreparedHashPrecheck,
  verifyPreparedCapabilityBootstrapHash,
  type CapabilityWalletConnector,
  type HashVerifiedPreparedCapabilityBootstrap,
} from "../src/index.js";
import {
  CAPABILITY_BOOTSTRAP_INPUT,
  preparedCapabilityBootstrapResponse,
  validPreparedCapabilityBootstrap,
} from "./prepared-capability-bootstrap.fixtures.js";

export const CONNECTOR_ID = "wallet-sdk-reference";
export const CONNECTOR_ORIGIN = "wallet://sotto-reference";
export const SIGNATURE = Buffer.alloc(64, 9).toString("base64");
export const SIGNED_BY = `1220${"b".repeat(64)}`;

export const CONNECTOR_CAPABILITIES = Object.freeze({
  connectorId: CONNECTOR_ID,
  connectorKind: "wallet-sdk" as const,
  explicitApproval: true,
  hashingSchemeVersions: Object.freeze(["HASHING_SCHEME_VERSION_V2" as const]),
  networks: Object.freeze([CAPABILITY_BOOTSTRAP_INPUT.network]),
  origin: CONNECTOR_ORIGIN,
  packageIds: Object.freeze([
    "4d614496ec9b30b22545fd350ecb9ec999164cfb0b5953f46dbbf937f8918f57",
  ]),
  payerParty: CAPABILITY_BOOTSTRAP_INPUT.payerParty,
  preparedTransactionSigning: true,
  signatureFormats: Object.freeze(["SIGNATURE_FORMAT_CONCAT" as const]),
  signingAlgorithms: Object.freeze(["SIGNING_ALGORITHM_SPEC_ED25519" as const]),
  version: "sotto-capability-wallet-capabilities-v1" as const,
});

export const APPROVED_SIGNATURE = Object.freeze({
  outcome: "approved" as const,
  signature: Object.freeze({
    party: CAPABILITY_BOOTSTRAP_INPUT.payerParty,
    signature: SIGNATURE,
    signatureFormat: "SIGNATURE_FORMAT_CONCAT" as const,
    signedBy: SIGNED_BY,
    signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519" as const,
  }),
});

export async function verifiedCapabilityBootstrap(
  afterRequest: () => void = () => undefined,
): Promise<HashVerifiedPreparedCapabilityBootstrap> {
  const request = buildBoundedCapabilityBootstrap(CAPABILITY_BOOTSTRAP_INPUT);
  afterRequest();
  const transaction = PreparedTransaction.toBinary(
    validPreparedCapabilityBootstrap(request),
    { writeUnknownFields: false },
  );
  const digest = await recomputeWalletPreparedHashPrecheck(transaction);
  const observation = await createPreparedCapabilityBootstrapObserver(
    async () =>
      preparedCapabilityBootstrapResponse(request, (response) => {
        response.preparedTransactionHash =
          Buffer.from(digest).toString("base64");
      }),
  )(request);
  return verifyPreparedCapabilityBootstrapHash(observation, {
    recomputeOfficialHash: async () => digest,
  });
}

export function recordingConnector(
  response: unknown = APPROVED_SIGNATURE,
): CapabilityWalletConnector {
  return {
    discover: async () => CONNECTOR_CAPABILITIES,
    requestApproval: async () => response,
  } as CapabilityWalletConnector;
}
