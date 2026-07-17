import { createHash } from "node:crypto";
import {
  HUMAN_WALLET_SIGNING_REQUEST_VERSION,
  projectHumanPreparedPurchaseApproval,
  verifyHumanPreparedPurchaseHash,
  type HumanPreparedPurchaseApproval,
  type HumanWalletApprovalRequest,
} from "../../../packages/x402-canton/src/index.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  humanPreparedCreate,
  humanPreparedReplaceField,
} from "../../../packages/x402-canton/test/human-prepared-purchase-effect-test-support.js";
import { humanPreparedHashInputs } from "../../../packages/x402-canton/test/human-prepared-purchase-hash.fixtures.js";
import { humanPreparedPurchaseBytes } from "../../../packages/x402-canton/test/human-prepared-purchase.fixtures.js";
import { HUMAN_PURCHASE_NOW } from "../../../packages/x402-canton/test/human-purchase-commitment.fixtures.js";
import { fixtureScalar } from "../../../packages/x402-canton/test/prepared-purchase-value.fixtures.js";
import { verifyReferenceHumanWalletPreparedApproval } from "../src/reference-human-wallet-prepared.js";

async function approvalRequest(
  preparedTransaction: Uint8Array,
  approval: HumanPreparedPurchaseApproval,
): Promise<HumanWalletApprovalRequest> {
  const digest = createHash("sha256").update(preparedTransaction).digest("hex");
  const preparedTransactionHash = `sha256:${digest}` as const;
  return Object.freeze({
    version: HUMAN_WALLET_SIGNING_REQUEST_VERSION,
    approval: Object.freeze({ ...approval, preparedTransactionHash }),
    connectorId: "wallet-sdk-reference",
    connectorKind: "wallet-sdk",
    connectorOrigin: "wallet://sotto-reference",
    createdAt: HUMAN_PURCHASE_NOW,
    expiresAt: "2026-07-16T15:10:00.000Z",
    hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
    preparedTransaction: new Uint8Array(preparedTransaction),
    preparedTransactionHash,
    sessionId: `sha256:${"a".repeat(64)}`,
  });
}

async function exactInputs() {
  const input = await humanPreparedHashInputs();
  const verified = await verifyHumanPreparedPurchaseHash(input.observation, {
    recomputeOfficialHash: async () => input.digest,
  });
  return {
    ...input,
    approval: projectHumanPreparedPurchaseApproval(verified),
  };
}

describe("reference human wallet prepared-transfer verification", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("independently accepts only the exact verified human transfer graph", async () => {
    const input = await exactInputs();
    const valid = await approvalRequest(input.transaction, input.approval);
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
    const mutated = await approvalRequest(mutatedBytes, input.approval);

    expect(() => verifyReferenceHumanWalletPreparedApproval(mutated)).toThrow(
      /reference human wallet prepared/iu,
    );
  });
});
