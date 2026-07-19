import { PreparedTransaction } from "@canton-network/core-ledger-proto";
import {
  requirePreparedIdentifier,
  requirePreparedParties,
} from "./reference-wallet-prepared-values.js";
import {
  referenceWalletCapabilityIntentHash,
  requireReferenceWalletCapabilityArgument,
} from "./reference-wallet-capability.js";
import type { SerializedReferenceWalletRequest } from "./reference-wallet-types.js";
import { verifyReferenceWalletPreparedMetadata } from "./reference-wallet-prepared-metadata.js";

export function verifyReferenceWalletPreparedApproval(
  request: SerializedReferenceWalletRequest,
): void {
  let prepared;
  const bytes = Buffer.from(request.preparedTransaction, "base64");
  try {
    prepared = PreparedTransaction.fromBinary(bytes, {
      readUnknownField: "throw",
    });
  } catch (cause) {
    throw new Error("reference wallet prepared transaction is invalid", {
      cause,
    });
  }
  const canonical = PreparedTransaction.toBinary(prepared, {
    writeUnknownFields: false,
  });
  if (!Buffer.from(canonical).equals(bytes))
    throw new Error("reference wallet prepared encoding is not canonical");
  const transaction = prepared.transaction;
  const metadata = prepared.metadata;
  if (transaction === undefined || metadata === undefined)
    throw new Error("reference wallet prepared approval is incomplete");
  if (
    transaction.version !== "2.1" ||
    JSON.stringify(transaction.roots) !== '["0"]' ||
    transaction.nodes.length !== 1 ||
    transaction.nodeSeeds.length !== 1 ||
    transaction.nodeSeeds[0]?.nodeId !== 0 ||
    transaction.nodeSeeds[0]?.seed.byteLength !== 32
  )
    throw new Error("reference wallet prepared approval effects do not match");
  const wrapper = transaction.nodes[0];
  if (
    wrapper?.nodeId !== "0" ||
    wrapper.versionedNode.oneofKind !== "v1" ||
    wrapper.versionedNode.v1.nodeType.oneofKind !== "create"
  )
    throw new Error("reference wallet prepared approval root does not match");
  const create = wrapper.versionedNode.v1.nodeType.create;
  const approval = request.approval;
  if (
    create.lfVersion !== "2.1" ||
    create.packageName !== "sotto-control" ||
    !/^00[0-9a-f]{64,510}$/u.test(create.contractId)
  )
    throw new Error("reference wallet prepared approval root is invalid");
  requirePreparedIdentifier(
    create.templateId,
    approval.templateId,
    "capability template",
  );
  requirePreparedParties(
    create.signatories,
    [approval.payerParty],
    "signatories",
  );
  requirePreparedParties(
    create.stakeholders,
    [approval.payerParty, approval.agentParty],
    "stakeholders",
  );
  requireReferenceWalletCapabilityArgument(request, create.argument);
  const digest = referenceWalletCapabilityIntentHash(request);
  if (request.capabilityIntentHash !== `sha256:${digest}`) {
    throw new Error("reference wallet capability intent does not match");
  }
  verifyReferenceWalletPreparedMetadata(metadata, request, digest);
}
