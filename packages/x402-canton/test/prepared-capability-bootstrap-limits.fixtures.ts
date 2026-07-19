import type { RecordField, Value } from "@canton-network/core-ledger-proto";
import {
  buildBoundedCapabilityBootstrap,
  createPreparedCapabilityBootstrapObserver,
  type PreparedCapabilityBootstrapObservation,
} from "../src/index.js";
import {
  CAPABILITY_BOOTSTRAP_INPUT,
  preparedCapabilityBootstrapResponse,
  type PreparedCapabilityBootstrapFixture,
} from "./prepared-capability-bootstrap.fixtures.js";

const participantHash = Buffer.alloc(32, 7).toString("base64");

type CapabilityArgumentRecord = { fields: RecordField[] };

export function rawCapabilityResponse(transaction: Uint8Array): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      preparedTransaction: Buffer.from(transaction).toString("base64"),
      preparedTransactionHash: participantHash,
      hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
      hashingDetails: null,
      costEstimation: null,
    }),
  );
}

export function capabilityRootCreate(
  prepared: PreparedCapabilityBootstrapFixture,
) {
  const wrapper = prepared.transaction?.nodes[0]?.versionedNode;
  if (wrapper?.oneofKind !== "v1") throw new Error("fixture root is absent");
  const root = wrapper.v1.nodeType;
  if (root.oneofKind !== "create") throw new Error("fixture root is invalid");
  return root.create;
}

export function capabilityArgumentRecord(
  prepared: PreparedCapabilityBootstrapFixture,
): CapabilityArgumentRecord {
  const argument = capabilityRootCreate(prepared).argument;
  if (argument?.sum.oneofKind !== "record") {
    throw new Error("fixture argument is absent");
  }
  return argument.sum.record;
}

export function preparedCapabilityValueDepth(root: Value | undefined): number {
  if (root === undefined) return 0;
  let maximum = 0;
  const pending: Array<readonly [Value, number]> = [[root, 1]];
  while (pending.length > 0) {
    const [value, depth] = pending.pop()!;
    maximum = Math.max(maximum, depth);
    const sum = value.sum;
    if (sum.oneofKind === "record") {
      for (const field of sum.record.fields) {
        if (field.value !== undefined) pending.push([field.value, depth + 1]);
      }
    } else if (sum.oneofKind === "optional" && sum.optional.value) {
      pending.push([sum.optional.value, depth + 1]);
    }
  }
  return maximum;
}

export async function observePreparedCapabilityLimit(
  mutate?: (prepared: PreparedCapabilityBootstrapFixture) => void,
  mutateBytes?: (bytes: Uint8Array) => Uint8Array,
): Promise<PreparedCapabilityBootstrapObservation> {
  const request = buildBoundedCapabilityBootstrap(CAPABILITY_BOOTSTRAP_INPUT);
  return createPreparedCapabilityBootstrapObserver(async () =>
    preparedCapabilityBootstrapResponse(
      request,
      undefined,
      mutate,
      mutateBytes,
    ),
  )(request);
}
