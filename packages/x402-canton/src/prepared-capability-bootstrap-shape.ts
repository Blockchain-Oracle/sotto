import { PreparedTransaction } from "@canton-network/core-ledger-proto";
import type { BoundedCapabilityBootstrapRequest } from "./bounded-capability-bootstrap.js";
import { validatePreparedCapabilityBootstrapMetadata } from "./prepared-capability-bootstrap-metadata.js";
import { validatePreparedCapabilityBootstrapValue } from "./prepared-capability-bootstrap-values.js";
import {
  preparedIdentifier,
  preparedParties,
} from "./prepared-purchase-effect-values.js";
import { identifier } from "./purchase-commitment-primitives.js";

export function validatePreparedCapabilityBootstrapShape(
  bytes: Uint8Array,
  request: BoundedCapabilityBootstrapRequest,
): void {
  let prepared: ReturnType<typeof PreparedTransaction.fromBinary>;
  try {
    prepared = PreparedTransaction.fromBinary(bytes, {
      readUnknownField: "throw",
    });
  } catch (cause) {
    throw new Error("prepared capability protobuf is invalid", { cause });
  }
  const canonical = PreparedTransaction.toBinary(prepared, {
    writeUnknownFields: false,
  });
  if (!Buffer.from(canonical).equals(Buffer.from(bytes))) {
    throw new Error("prepared capability encoding is not canonical");
  }
  const transaction = prepared.transaction;
  const metadata = prepared.metadata;
  if (transaction === undefined || metadata === undefined) {
    throw new Error("prepared capability transaction or metadata is absent");
  }
  if (
    transaction.version !== "2.1" ||
    JSON.stringify(transaction.roots) !== JSON.stringify(["0"]) ||
    transaction.nodes.length !== 1 ||
    transaction.nodes[0]!.nodeId !== "0" ||
    transaction.nodeSeeds.length !== 1 ||
    transaction.nodeSeeds[0]!.nodeId !== 0 ||
    transaction.nodeSeeds[0]!.seed.byteLength !== 32
  ) {
    throw new Error("prepared capability must have one exact create root");
  }
  const wrapper = transaction.nodes[0]!.versionedNode;
  if (wrapper.oneofKind !== "v1") {
    throw new Error("prepared capability node version is unsupported");
  }
  const root = wrapper.v1.nodeType;
  if (root.oneofKind !== "create") {
    throw new Error("prepared capability root must be a create");
  }
  const create = root.create;
  const expected = request.commands[0]!.CreateCommand;
  if (create.lfVersion !== "2.1" || create.packageName !== "sotto-control") {
    throw new Error("prepared capability root package does not match");
  }
  identifier(create.contractId, "prepared capability contract ID", 512);
  preparedIdentifier(
    create.templateId,
    expected.templateId,
    "capability bootstrap root",
  );
  preparedParties(
    create.signatories,
    [expected.createArguments.payer],
    "capability bootstrap signatories",
  );
  preparedParties(
    create.stakeholders,
    [expected.createArguments.payer, expected.createArguments.agent],
    "capability bootstrap stakeholders",
  );
  validatePreparedCapabilityBootstrapValue(create.argument, request);
  validatePreparedCapabilityBootstrapMetadata(metadata, request);
}
