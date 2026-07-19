import { describe, expect, it } from "vitest";
import { projectLiveFiveNorthHumanPurchaseOutput } from "../src/live-five-north-human-purchase-cli-output.js";

const SOURCE_COMMIT = "a".repeat(40);
const OPERATION = `sha256:${"b".repeat(64)}`;
const UPDATE = `1220${"c".repeat(64)}`;
const BODY_HASH = `sha256:${"d".repeat(64)}`;

function delivered() {
  return {
    completion: {
      classification: "SUCCEEDED",
      completionOffset: 42,
      updateId: UPDATE,
    },
    delivery: {
      bodyByteCount: 2_000_000,
      bodySha256: BODY_HASH,
      status: 200,
    },
    operationId: OPERATION,
    priorStage: "settlement-reconciled",
    status: "delivered",
  };
}

describe("human purchase CLI output limits", () => {
  it("accepts the exact delivery-size and rejection-code boundaries", () => {
    expect(
      projectLiveFiveNorthHumanPurchaseOutput(SOURCE_COMMIT, delivered()),
    ).toMatchObject({ delivery: { bodyByteCount: 2_000_000 } });
    expect(
      projectLiveFiveNorthHumanPurchaseOutput(SOURCE_COMMIT, {
        completion: {
          classification: "REJECTED",
          completionOffset: 42,
          statusCode: 16,
        },
        operationId: OPERATION,
        priorStage: "execution-started",
        status: "rejected",
      }),
    ).toMatchObject({ completion: { statusCode: 16 } });
  });

  it.each([
    [
      "non-Canton update ID",
      () => {
        const value = delivered();
        value.completion.updateId = "update-1";
        return value;
      },
    ],
    [
      "over-limit body",
      () => {
        const value = delivered();
        value.delivery.bodyByteCount = 2_000_001;
        return value;
      },
    ],
    [
      "out-of-range rejection code",
      () => ({
        completion: {
          classification: "REJECTED",
          completionOffset: 42,
          statusCode: 17,
        },
        operationId: OPERATION,
        priorStage: "execution-started",
        status: "rejected",
      }),
    ],
  ] as const)("rejects %s", (_name, candidate) => {
    expect(() =>
      projectLiveFiveNorthHumanPurchaseOutput(SOURCE_COMMIT, candidate()),
    ).toThrow();
  });

  it("rejects a non-journal recovery stage", () => {
    const value = delivered();
    value.priorStage = "private-wallet-stage";

    expect(() =>
      projectLiveFiveNorthHumanPurchaseOutput(SOURCE_COMMIT, value),
    ).toThrow(/journal|stage/iu);
  });
});
