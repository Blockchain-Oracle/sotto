import { describe, expect, it, vi } from "vitest";
import {
  commitHttpRequest,
  createPaymentAuthorization,
  verifyAndSignPayment,
  type CantonPaymentRequirement,
  type PreparedPayment,
} from "../src/index.js";

const requirement = {
  amount: "12500000000",
  asset: "CC",
  extra: {
    assetTransferMethod: "transfer-factory",
    executeBeforeSeconds: 45,
    feePayer: "facilitator::1220fee",
    instrumentId: { admin: "DSO::1220dso", id: "Amulet" },
    synchronizerId: "global-domain::1220sync",
  },
  maxTimeoutSeconds: 60,
  network: "canton:devnet",
  payTo: "provider::1220abc",
  scheme: "exact",
} as const satisfies CantonPaymentRequirement;
const binding = commitHttpRequest({
  body: new TextEncoder().encode('{"task":"private"}'),
  headers: [["content-type", "application/json"]],
  method: "POST",
  url: "https://provider.example/resource",
});
const authorization = createPaymentAuthorization({
  authorizationInstanceId: "authorization-1",
  binding,
  carriedRequestCommitment: binding.commitment,
  observedAt: "2026-07-12T15:59:00.000Z",
  payerParty: "sotto-payer::1220payer",
  requirement,
});
const prepared: PreparedPayment = {
  intent: {
    amount: requirement.amount,
    asset: requirement.asset,
    expiresAt: authorization.expiresAt,
    instrumentId: requirement.extra.instrumentId,
    network: requirement.network,
    payerParty: authorization.payerParty,
    recipient: requirement.payTo,
    requestCommitment: authorization.requestCommitment,
    scheme: requirement.scheme,
    synchronizerId: requirement.extra.synchronizerId,
    transferMethod: requirement.extra.assetTransferMethod,
  },
  preparedTransaction: new TextEncoder().encode("prepared-canton-transaction"),
  preparedTransactionHash: "hash:prepared",
};

function dependencies(options: { claimed?: boolean; hash?: string } = {}) {
  return {
    claimAttempt: vi.fn(async () => options.claimed ?? true),
    recomputeHash: vi.fn(async () => options.hash ?? "hash:prepared"),
    signHash: vi.fn(async () => ({ paymentReference: "ref:opaque" })),
  };
}

describe("verifyAndSignPayment", () => {
  it("signs one locally recomputed, claimed, exact intent", async () => {
    const deps = dependencies();
    const result = await verifyAndSignPayment(
      {
        authorization,
        now: new Date("2026-07-12T15:59:30.000Z"),
        prepared,
      },
      deps,
    );

    expect(deps.recomputeHash).toHaveBeenCalledOnce();
    expect(deps.claimAttempt).toHaveBeenCalledWith(authorization.attemptId);
    expect(deps.signHash).toHaveBeenCalledWith("hash:prepared");
    expect(result).toEqual({
      attemptId: authorization.attemptId,
      paymentReference: "ref:opaque",
      preparedTransactionHash: "hash:prepared",
    });
  });

  it.each([
    ["method", { requestCommitment: `sha256:${"1".repeat(64)}` }],
    ["URL", { requestCommitment: `sha256:${"2".repeat(64)}` }],
    ["authoritative header", { requestCommitment: `sha256:${"3".repeat(64)}` }],
    ["body", { requestCommitment: `sha256:${"4".repeat(64)}` }],
    ["amount", { amount: "1" }],
    ["asset", { asset: "OTHER" }],
    ["expiry", { expiresAt: "2026-07-12T16:00:00.000Z" }],
    ["instrument", { instrumentId: { admin: "OTHER", id: "Token" } }],
    ["network", { network: "canton:mainnet" }],
    ["payer", { payerParty: "attacker::1220bad" }],
    ["recipient", { recipient: "attacker::1220bad" }],
    ["scheme", { scheme: "other" }],
    ["synchronizer", { synchronizerId: "global-domain::other" }],
    ["transfer method", { transferMethod: "lock" }],
  ] as const)("never signs after a %s mutation", async (_name, mutation) => {
    const deps = dependencies();

    await expect(
      verifyAndSignPayment(
        {
          authorization,
          now: new Date("2026-07-12T15:59:30.000Z"),
          prepared: {
            ...prepared,
            intent: { ...prepared.intent, ...mutation },
          },
        },
        deps,
      ),
    ).rejects.toThrow("changed");
    expect(deps.signHash).not.toHaveBeenCalled();
  });

  it.each([
    [
      "stale authorization",
      new Date("2026-07-12T15:59:45.000Z"),
      dependencies(),
    ],
    [
      "duplicate claim",
      new Date("2026-07-12T15:59:30.000Z"),
      dependencies({ claimed: false }),
    ],
    [
      "hash mismatch",
      new Date("2026-07-12T15:59:30.000Z"),
      dependencies({ hash: "hash:other" }),
    ],
  ] as const)("never signs after %s", async (_name, now, deps) => {
    await expect(
      verifyAndSignPayment({ authorization, now, prepared }, deps),
    ).rejects.toThrow();
    expect(deps.signHash).not.toHaveBeenCalled();
  });

  it("never signs without local hash recomputation", async () => {
    const deps = { ...dependencies(), recomputeHash: undefined };

    await expect(
      verifyAndSignPayment(
        { authorization, now: new Date("2026-07-12T15:59:30.000Z"), prepared },
        deps as never,
      ),
    ).rejects.toThrow("recompute");
    expect(deps.signHash).not.toHaveBeenCalled();
  });
});
