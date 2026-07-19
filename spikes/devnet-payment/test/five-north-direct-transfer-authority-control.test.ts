import { describe, expect, it, vi } from "vitest";
import type { DirectTransferAuthorityControl } from "@sotto/x402-canton";
import { FiveNorthRequestFailure } from "../src/five-north-response.js";
import { runFiveNorthDirectTransferAuthorityControl } from "../src/five-north-direct-transfer-authority-control.js";

const commandId = `sotto-direct-authority-control-v1-${"a".repeat(64)}`;
const control = Object.freeze({
  agentRequest: Object.freeze({
    actAs: Object.freeze(["sotto-agent::1220agent"]),
    commandId,
  }),
  payerRequest: Object.freeze({
    actAs: Object.freeze(["sotto-payer::1220payer"]),
    commandId,
  }),
}) as unknown as DirectTransferAuthorityControl;

function preparedResponse(): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      costEstimation: null,
      hashingDetails: null,
      hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
      preparedTransaction: Buffer.from([1, 2, 3]).toString("base64"),
      preparedTransactionHash: Buffer.alloc(32, 7).toString("base64"),
    }),
  );
}

describe("Five North direct transfer authority control", () => {
  it("requires agent rejection then payer preparation without execution", async () => {
    const readPrepare = vi
      .fn()
      .mockRejectedValueOnce(
        new FiveNorthRequestFailure(
          "safe",
          400,
          "MISSING_REQUIRED_AUTHORIZERS",
        ),
      )
      .mockResolvedValueOnce(preparedResponse());

    await expect(
      runFiveNorthDirectTransferAuthorityControl(control, readPrepare),
    ).resolves.toEqual({
      agent: "MISSING_PAYER_AUTHORITY",
      commandId,
      executeCalls: 0,
      payer: "PREPARED",
    });
    expect(readPrepare).toHaveBeenNthCalledWith(1, control.agentRequest);
    expect(readPrepare).toHaveBeenNthCalledWith(2, control.payerRequest);
  });

  it.each([
    new FiveNorthRequestFailure("safe", 400, "INVALID_ARGUMENT"),
    new FiveNorthRequestFailure("safe", 400, "AUTHORIZATION_REJECTED"),
    new FiveNorthRequestFailure("safe", 403, "AUTHORIZATION_REJECTED"),
    new Error("transport failed"),
  ])("rejects a nonspecific agent failure", async (error) => {
    const readPrepare = vi.fn().mockRejectedValueOnce(error);

    await expect(
      runFiveNorthDirectTransferAuthorityControl(control, readPrepare),
    ).rejects.toThrow("direct transfer agent rejection is not authoritative");
    expect(readPrepare).toHaveBeenCalledOnce();
  });

  it("treats unexpected agent preparation as a security failure", async () => {
    const readPrepare = vi.fn(async () => preparedResponse());

    await expect(
      runFiveNorthDirectTransferAuthorityControl(control, readPrepare),
    ).rejects.toThrow("direct transfer unexpectedly prepared for the agent");
    expect(readPrepare).toHaveBeenCalledOnce();
  });
});
