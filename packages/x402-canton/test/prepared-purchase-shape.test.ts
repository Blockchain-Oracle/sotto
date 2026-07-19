import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBoundedPurchasePrepareRequest,
  createPreparedPurchaseObserver,
  readPreparedPurchaseShape,
} from "../src/index.js";
import { preparedPurchaseBytes } from "./prepared-purchase.fixtures.js";
import { purchaseCommandInputs } from "./transfer-factory-observation.fixtures.js";

const preparedHash = Buffer.alloc(32, 7).toString("base64");

function response(transaction: Uint8Array): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      preparedTransaction: Buffer.from(transaction).toString("base64"),
      preparedTransactionHash: preparedHash,
      hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
      hashingDetails: "private-server-hashing-details",
      costEstimation: null,
    }),
  );
}

async function shapeFixture() {
  const { intent, holdings, packageSelection, registry } =
    await purchaseCommandInputs();
  const request = buildBoundedPurchasePrepareRequest(
    intent,
    holdings,
    registry,
    packageSelection,
  );
  const transaction = preparedPurchaseBytes(intent, request);
  const prepared = await createPreparedPurchaseObserver(async () =>
    response(transaction),
  )(request);
  return { intent, prepared, transaction };
}

describe("redacted prepared Purchase shape", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:02.000Z") });
  });

  afterEach(() => vi.useRealTimers());

  it("records reviewed identifiers counts flags hashes work and timing", async () => {
    const { prepared } = await shapeFixture();
    const shape = readPreparedPurchaseShape(prepared);

    expect(shape).toMatchObject({
      version: "sotto-prepared-purchase-shape-v1",
      nodeCount: 14,
      edgeCount: 13,
      inputContractCount: 6,
      nodeKinds: { create: 4, exercise: 6, fetch: 4 },
    });
    expect(shape.valueWorkUnits).toBeGreaterThan(0);
    expect(shape.verificationElapsedMicroseconds).toBeGreaterThanOrEqual(0);
    expect(shape.nodes).toHaveLength(14);
    expect(
      shape.nodes.find(({ choice }) => choice === "Purchase"),
    ).toMatchObject({ kind: "exercise", consuming: true, childCount: 5 });
    expect(
      shape.nodes.find(({ choice }) => choice === "TransferFactory_Transfer"),
    ).toMatchObject({ kind: "exercise", consuming: false, childCount: 1 });
    expect(
      shape.nodes.find(({ choice }) => choice === "TransferPreapproval_SendV2"),
    ).toMatchObject({ kind: "exercise", consuming: false, childCount: 7 });
    for (const node of shape.nodes) {
      for (const hash of node.valueShapeHashes) {
        expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/u);
      }
    }
  });

  it("contains no parties contract IDs raw values bytes or server body", async () => {
    const { intent, prepared, transaction } = await shapeFixture();
    const shape = readPreparedPurchaseShape(prepared);
    const serialized = JSON.stringify(shape);
    for (const prohibited of [
      "sotto-payer::1220payer",
      "sotto-agent::1220agent",
      "sotto-provider::1220provider",
      "00capability7",
      "00tokenfactory7",
      "00holding-a",
      "00effect-receiver-holding",
      "0.2500000000",
      intent.attemptId,
      intent.purchaseCommitment,
      Buffer.from(transaction).toString("base64"),
      preparedHash,
      "preparedTransaction",
      "private-server-hashing-details",
    ]) {
      expect(serialized).not.toContain(prohibited);
    }
  });

  it("rejects clones and returns deeply frozen shape data", async () => {
    const { prepared } = await shapeFixture();
    expect(() => readPreparedPurchaseShape(structuredClone(prepared))).toThrow(
      /authenticated/iu,
    );
    const shape = readPreparedPurchaseShape(prepared);
    expect(Object.isFrozen(shape)).toBe(true);
    expect(Object.isFrozen(shape.nodes)).toBe(true);
    expect(shape.nodes.every((node) => Object.isFrozen(node))).toBe(true);
  });
});
