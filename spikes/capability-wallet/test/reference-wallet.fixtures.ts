import { PreparedTransaction } from "@canton-network/core-ledger-proto";
import {
  buildBoundedCapabilityBootstrap,
  APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID,
  createPreparedCapabilityBootstrapObserver,
  type HashVerifiedPreparedCapabilityBootstrap,
  verifyPreparedCapabilityBootstrapHash,
} from "../../../packages/x402-canton/src/index.js";
import {
  CAPABILITY_BOOTSTRAP_INPUT,
  validPreparedCapabilityBootstrap,
} from "../../../packages/x402-canton/test/prepared-capability-bootstrap.fixtures.js";
import { SDK } from "../src/index.js";
import {
  CONNECTOR_CAPABILITIES,
  CONNECTOR_ID,
  CONNECTOR_ORIGIN,
} from "../../../packages/x402-canton/test/capability-wallet-connector.fixtures.js";

const VALID_CONTRACT_ID = `00${"c".repeat(64)}`;
const VALID_TRANSFER_FACTORY_ID = `00${"f".repeat(64)}`;
const OFFLINE_SDK = SDK.createOffline();

export async function walletSdkVerifiedCapabilityBootstrap(): Promise<HashVerifiedPreparedCapabilityBootstrap> {
  const request = buildBoundedCapabilityBootstrap({
    ...CAPABILITY_BOOTSTRAP_INPUT,
    transferFactoryContractId: VALID_TRANSFER_FACTORY_ID,
  });
  const prepared = validPreparedCapabilityBootstrap(request);
  const root = prepared.transaction?.nodes[0]?.versionedNode;
  if (root?.oneofKind !== "v1") throw new Error("test root is absent");
  const value = root.v1.nodeType;
  if (value.oneofKind !== "create") throw new Error("test root is invalid");
  value.create.contractId = VALID_CONTRACT_ID;
  const transaction = PreparedTransaction.toBinary(prepared, {
    writeUnknownFields: false,
  });
  const official = await OFFLINE_SDK.utils.hash.preparedTransaction(
    Buffer.from(transaction).toString("base64"),
  );
  const digest = Buffer.from(official.toHex(), "hex");
  const observation = await createPreparedCapabilityBootstrapObserver(
    async () =>
      new TextEncoder().encode(
        JSON.stringify({
          costEstimation: null,
          hashingDetails: null,
          hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
          preparedTransaction: Buffer.from(transaction).toString("base64"),
          preparedTransactionHash: digest.toString("base64"),
        }),
      ),
  )(request);
  return verifyPreparedCapabilityBootstrapHash(observation, {
    recomputeOfficialHash: async () => new Uint8Array(digest),
  });
}

export function referenceWalletPolicy(signingFingerprint: string) {
  return Object.freeze({
    agentParty: CAPABILITY_BOOTSTRAP_INPUT.agentParty,
    connectorId: CONNECTOR_ID,
    connectorOrigin: CONNECTOR_ORIGIN,
    instrumentAdmin: CAPABILITY_BOOTSTRAP_INPUT.instrument.admin,
    instrumentId: CAPABILITY_BOOTSTRAP_INPUT.instrument.id,
    network: CONNECTOR_CAPABILITIES.networks[0]!,
    packageId: CONNECTOR_CAPABILITIES.packageIds[0]!,
    payerParty: CONNECTOR_CAPABILITIES.payerParty,
    signingFingerprint,
    synchronizerId: CAPABILITY_BOOTSTRAP_INPUT.synchronizerId,
    templateId: APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID,
    transferFactoryContractId: VALID_TRANSFER_FACTORY_ID,
  });
}
