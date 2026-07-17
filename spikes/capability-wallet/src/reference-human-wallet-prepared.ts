import { PreparedTransaction } from "@canton-network/core-ledger-proto";
import type { HumanWalletApprovalRequest } from "@sotto/x402-canton";
import { referenceHumanWalletHoldingOwner } from "./reference-human-wallet-holdings.js";
import { validateReferenceHumanWalletGraph } from "./reference-human-wallet-graph.js";
import { validateReferenceHumanWalletRoot } from "./reference-human-wallet-root.js";
import { validateReferenceHumanWalletTransfer } from "./reference-human-wallet-transfer.js";
import { referenceHumanParties } from "./reference-human-wallet-values.js";

const MAX_PREPARED_BYTES = 2 * 1024 * 1024;

function fail(label: string): never {
  throw new Error(`reference human wallet prepared ${label} does not match`);
}

function decode(request: HumanWalletApprovalRequest) {
  if (
    request.version !== "sotto-human-wallet-request-v1" ||
    request.hashingSchemeVersion !== "HASHING_SCHEME_VERSION_V2" ||
    request.preparedTransactionHash !==
      request.approval.preparedTransactionHash ||
    !(request.preparedTransaction instanceof Uint8Array) ||
    request.preparedTransaction.byteLength === 0 ||
    request.preparedTransaction.byteLength > MAX_PREPARED_BYTES
  ) {
    fail("request");
  }
  let prepared;
  try {
    prepared = PreparedTransaction.fromBinary(request.preparedTransaction, {
      readUnknownField: "throw",
    });
  } catch (cause) {
    throw new Error("reference human wallet prepared bytes are invalid", {
      cause,
    });
  }
  const canonical = PreparedTransaction.toBinary(prepared, {
    writeUnknownFields: false,
  });
  if (
    !Buffer.from(canonical).equals(Buffer.from(request.preparedTransaction))
  ) {
    fail("encoding");
  }
  return prepared;
}

export function verifyReferenceHumanWalletPreparedApproval(
  request: HumanWalletApprovalRequest,
): void {
  const prepared = decode(request);
  const transaction = prepared.transaction;
  const metadata = prepared.metadata;
  if (transaction === undefined || metadata === undefined) {
    fail("graph");
  }
  const graph = validateReferenceHumanWalletGraph(transaction);
  validateReferenceHumanWalletRoot(graph.root, request);
  const transfer = validateReferenceHumanWalletTransfer(graph, request);
  const owners = transaction.nodes.flatMap(({ versionedNode }) =>
    versionedNode.oneofKind === "v1" &&
    versionedNode.v1.nodeType.oneofKind === "create"
      ? [
          referenceHumanWalletHoldingOwner(
            versionedNode.v1.nodeType.create,
            request,
            transfer.changeAmount,
          ),
        ]
      : [],
  );
  if (
    JSON.stringify(owners.sort()) !==
    JSON.stringify(
      [request.approval.payerParty, request.approval.providerParty].sort(),
    )
  ) {
    fail("Holding outputs");
  }
  referenceHumanParties(
    metadata.submitterInfo?.actAs ?? [],
    [request.approval.payerParty],
    "submitter",
  );
  if (
    metadata.submitterInfo?.commandId !==
      `sotto-human-purchase-v1-${request.approval.purchaseCommitment.slice(7)}` ||
    metadata.synchronizerId !== request.approval.synchronizerId ||
    metadata.maxRecordTime !==
      BigInt(Date.parse(request.approval.executeBefore)) * 1_000n
  ) {
    fail("metadata");
  }
}
