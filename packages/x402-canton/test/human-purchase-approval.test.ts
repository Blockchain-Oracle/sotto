import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as publicApi from "../src/index.js";
import {
  HUMAN_PURCHASE_APPROVAL_VERSION,
  projectHumanPreparedPurchaseApproval,
} from "../src/human-purchase-approval.js";
import { verifyHumanPreparedPurchaseHash } from "../src/human-prepared-purchase-hash.js";
import { claimHashVerifiedHumanPreparedPurchase } from "../src/human-prepared-purchase-hash-state.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  humanPreparedHashInputs,
  humanPreparedHashInputsForPurchase,
} from "./human-prepared-purchase-hash.fixtures.js";

async function approvalInputs() {
  const input = await humanPreparedHashInputs();
  const verified = await verifyHumanPreparedPurchaseHash(input.observation, {
    recomputeOfficialHash: async () => input.digest,
  });
  return { ...input, verified };
}

function expectDeepFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeepFrozen(child);
}

describe("wallet-neutral human purchase approval", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("projects the exact human-visible purchase and signer identity", async () => {
    const { digest, intent, verified } = await approvalInputs();
    const selected = intent.packageSelection.references[0];
    const approval = projectHumanPreparedPurchaseApproval(verified);

    expect(approval).toEqual({
      version: HUMAN_PURCHASE_APPROVAL_VERSION,
      action: "pay-for-api-call",
      authorizationMode: "human-wallet",
      method: "GET",
      resourceOrigin: "https://provider.example",
      resourcePath: "/paid/weather",
      queryPresent: true,
      payerParty: intent.challenge.payerParty,
      providerParty: intent.challenge.recipientParty,
      amountAtomic: intent.challenge.amountAtomic,
      asset: "CC",
      maximumFeeAtomic: intent.limits.maximumFeeAtomic,
      maximumTotalDebitAtomic: intent.limits.maximumTotalDebitAtomic,
      instrument: intent.challenge.instrument,
      network: intent.challenge.network,
      synchronizerId: intent.challenge.synchronizerId,
      executeBefore: intent.challenge.executeBefore,
      attemptId: intent.attemptId,
      challengeId: intent.challenge.challengeId,
      requestCommitment: intent.request.requestCommitment,
      purchaseCommitment: intent.purchaseCommitment,
      bodyHash: intent.request.bodyHash,
      transferContextHash:
        "sha256:3dcaef2d24057b5f397ee058cd22da8377a56b836e9e607bb15d88856d90ce38",
      preparedTransactionHash: `sha256:${Buffer.from(digest).toString("hex")}`,
      selectedPackage: {
        packageId: selected.packageId,
        packageName: selected.packageName,
        packageVersion: selected.packageVersion,
      },
      tokenFactory: {
        contractId: intent.tokenFactory.contractId,
        expectedAdmin: intent.tokenFactory.expectedAdmin,
      },
      signer: {
        publicKeyFingerprint: intent.payerIdentity.publicKeyFingerprint,
        publicKeyFormat: intent.payerIdentity.publicKeyFormat,
        signatureFormat: intent.payerIdentity.signatureFormat,
        signingAlgorithm: intent.payerIdentity.signingAlgorithm,
      },
    });
    expectDeepFrozen(approval);
    expect(approval.version).toBe("sotto-human-purchase-approval-v2");
  });

  it("is public, rejects forgeries, and does not consume signing authority", async () => {
    expect(publicApi.projectHumanPreparedPurchaseApproval).toBe(
      projectHumanPreparedPurchaseApproval,
    );
    const { verified } = await approvalInputs();

    expect(() => projectHumanPreparedPurchaseApproval({ ...verified })).toThrow(
      /hash-verified.*not authenticated/iu,
    );
    expect(() => projectHumanPreparedPurchaseApproval(verified)).not.toThrow();
    expect(() =>
      claimHashVerifiedHumanPreparedPurchase(verified),
    ).not.toThrow();
    expect(() => projectHumanPreparedPurchaseApproval(verified)).toThrow(
      /already claimed/iu,
    );
  });

  it("exposes only the fixed redacted approval allowlist", async () => {
    const { verified } = await approvalInputs();
    const approval = projectHumanPreparedPurchaseApproval(verified);
    const serialized = JSON.stringify(approval);

    expect(Object.keys(approval).sort()).toEqual(
      [
        "action",
        "amountAtomic",
        "asset",
        "attemptId",
        "authorizationMode",
        "bodyHash",
        "challengeId",
        "executeBefore",
        "instrument",
        "maximumFeeAtomic",
        "maximumTotalDebitAtomic",
        "method",
        "network",
        "payerParty",
        "preparedTransactionHash",
        "providerParty",
        "purchaseCommitment",
        "queryPresent",
        "requestCommitment",
        "resourceOrigin",
        "resourcePath",
        "selectedPackage",
        "signer",
        "synchronizerId",
        "tokenFactory",
        "transferContextHash",
        "version",
      ].sort(),
    );
    expect(serialized).not.toContain("units=metric");
    expect(serialized).not.toMatch(
      /canonicalBytes|"preparedTransaction":|subjectHash|topologyHash|authorizationInstanceId|actAs|readAs|userId|capability|allowance|policy/iu,
    );
  });

  it("hides committed query, header, and body secrets", async () => {
    const privateUrl =
      "https://provider.example/paid/weather?access_token=private-query";
    const input = await humanPreparedHashInputsForPurchase({
      mutateChallenge: (challenge) => {
        challenge.resource.url = privateUrl;
      },
      request: {
        body: new TextEncoder().encode("private request body"),
        headers: [["idempotency-key", "private request header"]],
        method: "POST",
        url: privateUrl,
      },
    });
    const verified = await verifyHumanPreparedPurchaseHash(input.observation, {
      recomputeOfficialHash: async () => input.digest,
    });
    const approval = projectHumanPreparedPurchaseApproval(verified);
    const serialized = JSON.stringify(approval);

    expect(approval).toMatchObject({
      method: "POST",
      queryPresent: true,
      resourceOrigin: "https://provider.example",
      resourcePath: "/paid/weather",
    });
    for (const secret of [
      "private-query",
      "private request header",
      "private request body",
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(publicApi).not.toHaveProperty(
      "readHashVerifiedHumanPreparedPurchase",
    );
  });

  it("distinguishes a request with no hidden query", async () => {
    const publicUrl = "https://provider.example/paid/weather";
    const input = await humanPreparedHashInputsForPurchase({
      mutateChallenge: (challenge) => {
        challenge.resource.url = publicUrl;
      },
      request: { method: "GET", url: publicUrl },
    });
    const verified = await verifyHumanPreparedPurchaseHash(input.observation, {
      recomputeOfficialHash: async () => input.digest,
    });

    expect(projectHumanPreparedPurchaseApproval(verified).queryPresent).toBe(
      false,
    );
  });
});
