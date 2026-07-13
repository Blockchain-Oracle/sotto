import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBoundedPurchasePrepareRequest,
  createPreparedPurchaseObserver,
} from "../src/index.js";
import {
  preparedPurchaseBytes,
  type PreparedPurchaseFixture,
} from "./prepared-purchase.fixtures.js";
import { purchaseCommandInputs } from "./transfer-factory-observation.fixtures.js";

const preparedHash = Buffer.alloc(32, 7).toString("base64");

function response(transaction: Uint8Array): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      preparedTransaction: Buffer.from(transaction).toString("base64"),
      preparedTransactionHash: preparedHash,
      hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
      hashingDetails: null,
      costEstimation: null,
    }),
  );
}

function rootExercise(prepared: PreparedPurchaseFixture) {
  const versioned = prepared.transaction?.nodes[0]?.versionedNode;
  if (versioned?.oneofKind !== "v1") throw new Error("missing test root");
  const node = versioned.v1.nodeType;
  if (node.oneofKind !== "exercise")
    throw new Error("test root is not exercise");
  return node.exercise;
}

async function observeMutatedBytes(
  mutateBytes: (
    bytes: Uint8Array,
    prepared: PreparedPurchaseFixture,
  ) => Uint8Array = (bytes) => bytes,
) {
  const { intent, holdings, registry } = await purchaseCommandInputs();
  const request = buildBoundedPurchasePrepareRequest(
    intent,
    holdings,
    registry,
  );
  let fixture: PreparedPurchaseFixture | undefined;
  const bytes = preparedPurchaseBytes(intent, request, (prepared) => {
    fixture = prepared;
  });
  const candidate = mutateBytes(bytes, fixture!);
  const observe = createPreparedPurchaseObserver(async () =>
    response(candidate),
  );
  return observe(request);
}

describe("prepared Purchase semantic gate", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:02.000Z") });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [
      "actAs",
      (p: PreparedPurchaseFixture) => {
        p.metadata!.submitterInfo!.actAs = ["other::1220"];
      },
    ],
    [
      "command ID",
      (p: PreparedPurchaseFixture) => {
        p.metadata!.submitterInfo!.commandId = "other-command";
      },
    ],
    [
      "synchronizer",
      (p: PreparedPurchaseFixture) => {
        p.metadata!.synchronizerId = "other::synchronizer";
      },
    ],
    [
      "record-time bound",
      (p: PreparedPurchaseFixture) => {
        p.metadata!.maxRecordTime! += 1n;
      },
    ],
    [
      "root contract",
      (p: PreparedPurchaseFixture) => {
        rootExercise(p).contractId = "00other-capability";
      },
    ],
    [
      "root choice",
      (p: PreparedPurchaseFixture) => {
        rootExercise(p).choiceId = "Archive";
      },
    ],
    [
      "root controller",
      (p: PreparedPurchaseFixture) => {
        rootExercise(p).actingParties = ["other::1220"];
      },
    ],
    [
      "non-consuming root",
      (p: PreparedPurchaseFixture) => {
        rootExercise(p).consuming = false;
      },
    ],
  ])("rejects a mismatched %s", async (_label, mutate) => {
    const { intent, holdings, registry } = await purchaseCommandInputs();
    const request = buildBoundedPurchasePrepareRequest(
      intent,
      holdings,
      registry,
    );
    const transaction = preparedPurchaseBytes(intent, request, mutate);
    const observe = createPreparedPurchaseObserver(async () =>
      response(transaction),
    );

    await expect(observe(request)).rejects.toThrow();
  });

  it("rejects unknown protobuf fields", async () => {
    await expect(
      observeMutatedBytes((bytes) =>
        Uint8Array.from([...bytes, 0x98, 0x06, 0x01]),
      ),
    ).rejects.toThrow(/unknown field/i);
  });

  it("rejects noncanonical duplicate protobuf fields", async () => {
    await expect(
      observeMutatedBytes((bytes) => Uint8Array.from([...bytes, 0x12, 0x00])),
    ).rejects.toThrow(/canonical/i);
  });

  it.each([
    [
      "more than one root",
      (p: PreparedPurchaseFixture) => {
        p.transaction!.roots.push("1");
      },
    ],
    [
      "duplicate node ID",
      (p: PreparedPurchaseFixture) => {
        p.transaction!.nodes.push(structuredClone(p.transaction!.nodes[0]!));
      },
    ],
    [
      "missing seed",
      (p: PreparedPurchaseFixture) => {
        p.transaction!.nodeSeeds = [];
      },
    ],
    [
      "rollback",
      (p: PreparedPurchaseFixture) => {
        p.transaction!.nodes[0]!.versionedNode = {
          oneofKind: "v1",
          v1: {
            nodeType: { oneofKind: "rollback", rollback: { children: [] } },
          },
        };
      },
    ],
  ])("rejects a graph with %s", async (_label, mutate) => {
    const { intent, holdings, registry } = await purchaseCommandInputs();
    const request = buildBoundedPurchasePrepareRequest(
      intent,
      holdings,
      registry,
    );
    const transaction = preparedPurchaseBytes(intent, request, mutate);
    const observe = createPreparedPurchaseObserver(async () =>
      response(transaction),
    );

    await expect(observe(request)).rejects.toThrow();
  });
});
