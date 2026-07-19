import { describe, expect, it } from "vitest";
import { parsePreparedTransactionResponse } from "../src/prepared-transaction-response.js";

const transaction = new Uint8Array([1, 2, 3, 4]);
const preparedHash = Buffer.alloc(32, 7).toString("base64");

function response(overrides: Record<string, unknown> = {}): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      preparedTransaction: Buffer.from(transaction).toString("base64"),
      preparedTransactionHash: preparedHash,
      hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
      hashingDetails: null,
      costEstimation: null,
      ...overrides,
    }),
  );
}

describe("transaction-neutral prepared response", () => {
  it("parses one exact V2 envelope into bounded byte snapshots", () => {
    const parsed = parsePreparedTransactionResponse(response());

    expect(parsed).toEqual({
      preparedTransaction: transaction,
      preparedTransactionHash: preparedHash,
    });
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it.each([
    ["non-V2 hashing", { hashingSchemeVersion: "HASHING_SCHEME_VERSION_V1" }],
    [
      "short hash",
      { preparedTransactionHash: Buffer.alloc(31).toString("base64") },
    ],
    ["unknown field", { unexpected: true }],
  ])("rejects %s", (_name, mutation) => {
    expect(() =>
      parsePreparedTransactionResponse(response(mutation)),
    ).toThrow();
  });

  it("rejects a UTF-8 BOM before JSON parsing", () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), response()]);
    expect(() => parsePreparedTransactionResponse(bytes)).toThrow(/BOM/u);
  });
});
