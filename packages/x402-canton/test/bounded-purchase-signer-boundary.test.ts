import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signBoundedPurchase } from "../src/index.js";
import {
  SIGNER_BOUNDARY_DIGEST,
  signerBoundaryFixture,
} from "./bounded-purchase-signer-boundary.fixtures.js";
import { registerSignerBoundaryMutationCases } from "./bounded-purchase-signer-boundary-mutations.cases.js";
import { registerSignerBoundarySecurityCases } from "./bounded-purchase-signer-boundary-security.cases.js";

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-07-13T10:00:02.000Z") });
});

afterEach(() => vi.useRealTimers());

registerSignerBoundaryMutationCases();
registerSignerBoundarySecurityCases();

describe("bounded Purchase zero-signing boundary", () => {
  it("claims and signs one semantically verified official digest", async () => {
    const { dependencies, events, intent, request } =
      await signerBoundaryFixture();

    const receipt = await signBoundedPurchase(request, dependencies);

    expect(events).toEqual(["prepare", "hash", "claim", "sign"]);
    const preparedTransactionHash = Buffer.from(
      SIGNER_BOUNDARY_DIGEST,
    ).toString("base64");
    expect(dependencies.claimAttempt).toHaveBeenCalledWith({
      attemptId: intent.attemptId,
      executeBefore: intent.challenge.executeBefore,
      preparedTransactionHash,
      purchaseCommitment: intent.purchaseCommitment,
    });
    expect(dependencies.claimAttempt).toHaveBeenCalledOnce();
    expect(
      Object.isFrozen(dependencies.claimAttempt.mock.calls[0]![0] as object),
    ).toBe(true);
    expect(receipt).toEqual({
      attemptId: intent.attemptId,
      preparedTransactionHash,
      purchaseCommitment: intent.purchaseCommitment,
      signingReference: "signing:opaque-reference",
    });
    expect(dependencies.signOpaque).toHaveBeenCalledWith({
      attemptId: intent.attemptId,
      preparedTransactionHash,
    });
    expect(dependencies.signOpaque).toHaveBeenCalledOnce();
    expect(
      Object.isFrozen(dependencies.signOpaque.mock.calls[0]![0] as object),
    ).toBe(true);
    expect(receipt).not.toHaveProperty("preparedTransaction");
  });

  it("rejects a forged prepare request with zero signing calls", async () => {
    const { dependencies, request } = await signerBoundaryFixture();

    await expect(
      signBoundedPurchase(structuredClone(request), dependencies),
    ).rejects.toThrow(/authenticated/iu);
    expect(dependencies.claimAttempt).not.toHaveBeenCalled();
    expect(dependencies.signOpaque).not.toHaveBeenCalled();
  });
});
