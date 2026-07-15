import { PreparedTransaction } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBoundedCapabilityBootstrap,
  claimHashVerifiedPreparedCapabilityBootstrap,
  createPreparedCapabilityBootstrapObserver,
  recomputeWalletPreparedHashPrecheck,
} from "../src/index.js";
import { projectPreparedCapabilityBootstrapApproval } from "../src/prepared-capability-bootstrap-approval.js";
import { verifyPreparedCapabilityBootstrapHash } from "../src/prepared-capability-bootstrap-hash.js";
import {
  CAPABILITY_BOOTSTRAP_INPUT,
  preparedCapabilityBootstrapResponse,
  validPreparedCapabilityBootstrap,
} from "./prepared-capability-bootstrap.fixtures.js";

const NOW = Date.parse("2026-07-15T10:00:00.000Z");

async function approvalFor(userId: string = CAPABILITY_BOOTSTRAP_INPUT.userId) {
  const request = buildBoundedCapabilityBootstrap({
    ...CAPABILITY_BOOTSTRAP_INPUT,
    userId,
  });
  const prepared = PreparedTransaction.toBinary(
    validPreparedCapabilityBootstrap(request),
    { writeUnknownFields: false },
  );
  const digest = await recomputeWalletPreparedHashPrecheck(prepared);
  const observe = createPreparedCapabilityBootstrapObserver(async () =>
    preparedCapabilityBootstrapResponse(request, (response) => {
      response.preparedTransactionHash = Buffer.from(digest).toString("base64");
    }),
  );
  const observation = await observe(request);
  const verified = await verifyPreparedCapabilityBootstrapHash(observation, {
    recomputeOfficialHash: async () => digest,
  });
  return {
    approval: projectPreparedCapabilityBootstrapApproval(verified),
    digest,
    verified,
  };
}

describe("prepared capability wallet approval", () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());

  it("projects the exact deeply frozen approval", async () => {
    const { approval, digest } = await approvalFor();

    expect(approval).toEqual({
      action: "create-purchase-capability",
      agentParty: CAPABILITY_BOOTSTRAP_INPUT.agentParty,
      expiresAt: CAPABILITY_BOOTSTRAP_INPUT.expiresAt,
      instrument: CAPABILITY_BOOTSTRAP_INPUT.instrument,
      limits: {
        maximumTotalDebitAtomic:
          CAPABILITY_BOOTSTRAP_INPUT.maximumTotalDebitAtomic,
        perCallLimitAtomic: CAPABILITY_BOOTSTRAP_INPUT.perCallLimitAtomic,
        remainingAllowanceAtomic:
          CAPABILITY_BOOTSTRAP_INPUT.remainingAllowanceAtomic,
      },
      network: CAPABILITY_BOOTSTRAP_INPUT.network,
      packageId:
        "4d614496ec9b30b22545fd350ecb9ec999164cfb0b5953f46dbbf937f8918f57",
      payerParty: CAPABILITY_BOOTSTRAP_INPUT.payerParty,
      preparedTransactionHash: `sha256:${Buffer.from(digest).toString("hex")}`,
      recipientParty: CAPABILITY_BOOTSTRAP_INPUT.allowedRecipient,
      resourceHash: CAPABILITY_BOOTSTRAP_INPUT.allowedResourceHash,
      revision: "0",
      synchronizerId: CAPABILITY_BOOTSTRAP_INPUT.synchronizerId,
      templateId:
        "4d614496ec9b30b22545fd350ecb9ec999164cfb0b5953f46dbbf937f8918f57:Sotto.Control.PurchaseCapability:BoundedPurchaseCapability",
      transferFactoryContractId:
        CAPABILITY_BOOTSTRAP_INPUT.transferFactoryContractId,
      version: "sotto-capability-approval-v1",
    });
    expect(Object.isFrozen(approval)).toBe(true);
    expect(Object.isFrozen(approval.instrument)).toBe(true);
    expect(Object.isFrozen(approval.limits)).toBe(true);
  });

  it("excludes credentials, private authorization, and raw signing material", async () => {
    const secret = "wallet-user-secret-do-not-display";
    const { approval } = await approvalFor(secret);
    const serialized = JSON.stringify(approval);

    expect(serialized).not.toContain(secret);
    for (const field of [
      "userId",
      "commandId",
      "readAs",
      "actAs",
      "observationId",
      "preparedTransaction",
      "signature",
    ]) {
      expect(approval).not.toHaveProperty(field);
    }
    expect(Object.keys(approval).sort()).toEqual(
      [
        "action",
        "agentParty",
        "expiresAt",
        "instrument",
        "limits",
        "network",
        "packageId",
        "payerParty",
        "preparedTransactionHash",
        "recipientParty",
        "resourceHash",
        "revision",
        "synchronizerId",
        "templateId",
        "transferFactoryContractId",
        "version",
      ].sort(),
    );
  });

  it("keeps the connector claim free of request authority", async () => {
    const secret = "wallet-user-secret-do-not-forward";
    const { verified } = await approvalFor(secret);
    const claim = claimHashVerifiedPreparedCapabilityBootstrap(verified);
    const serialized = JSON.stringify(claim);

    expect(serialized).not.toContain(secret);
    expect(Object.keys(claim).sort()).toEqual(
      ["capturedAt", "preparedTransaction", "preparedTransactionHash"].sort(),
    );
    for (const field of ["request", "userId", "actAs", "commandId"]) {
      expect(claim).not.toHaveProperty(field);
    }
  });

  it("rejects a forged hash-verified result", async () => {
    const { verified } = await approvalFor();

    expect(() =>
      projectPreparedCapabilityBootstrapApproval({ ...verified }),
    ).toThrow(/hash-verified.*not authenticated/iu);
  });
});
