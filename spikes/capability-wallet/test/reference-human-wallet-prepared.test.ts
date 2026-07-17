import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  humanPreparedCreate,
  humanPreparedReplaceField,
} from "../../../packages/x402-canton/test/human-prepared-purchase-effect-test-support.js";
import { humanPreparedPurchaseBytes } from "../../../packages/x402-canton/test/human-prepared-purchase.fixtures.js";
import { HUMAN_PURCHASE_NOW } from "../../../packages/x402-canton/test/human-purchase-commitment.fixtures.js";
import { fixtureScalar } from "../../../packages/x402-canton/test/prepared-purchase-value.fixtures.js";
import { verifyReferenceHumanWalletPreparedApproval } from "../src/reference-human-wallet-prepared.js";
import {
  referenceHumanWalletApprovalRequest,
  referenceHumanWalletInputs,
} from "./reference-human-wallet.fixtures.js";

describe("reference human wallet prepared-transfer verification", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("independently accepts only the exact verified human transfer graph", async () => {
    const input = await referenceHumanWalletInputs();
    const valid = referenceHumanWalletApprovalRequest(
      input.transaction,
      input.approval,
    );
    expect(() =>
      verifyReferenceHumanWalletPreparedApproval(valid),
    ).not.toThrow();

    const mutatedBytes = humanPreparedPurchaseBytes(
      input.intent,
      input.request,
      (prepared) => {
        humanPreparedReplaceField(
          humanPreparedCreate(prepared, "3").argument,
          "owner",
          fixtureScalar("party", "wrong-owner::1220wrong"),
        );
      },
    );
    const mutated = referenceHumanWalletApprovalRequest(
      mutatedBytes,
      input.approval,
    );

    expect(() => verifyReferenceHumanWalletPreparedApproval(mutated)).toThrow(
      /reference human wallet prepared/iu,
    );
  });
});
