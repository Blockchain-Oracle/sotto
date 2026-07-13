import { describe, expect, it, vi } from "vitest";
import {
  commitBoundedPurchase,
  readBoundedPurchaseLedgerIntent,
} from "../src/index.js";
import { readPurchaseCapabilityObservation } from "../src/purchase-capability-observation.js";
import { readAuthenticatedBoundedPurchaseLedgerIntent } from "../src/purchase-ledger-intent.js";
import {
  AGENT,
  CAPABILITY_TEMPLATE_ID,
  DSO,
  PAYER,
  PROVIDER,
  RESOURCE_URL,
  createPurchaseInput,
  mutateChallenge,
  replaceBoundRequest,
  routeHash,
} from "./purchase-commitment.fixtures.js";

describe("bounded purchase Ledger intent", () => {
  it("projects the complete agent-only Ledger intent", () => {
    const input = createPurchaseInput();
    const purchase = commitBoundedPurchase(input);

    expect(readBoundedPurchaseLedgerIntent(purchase)).toEqual({
      version: "sotto-purchase-v2",
      authorizationMode: "bounded-capability",
      actAs: [AGENT],
      attemptId: purchase.attemptId,
      purchaseCommitment: purchase.commitment,
      request: {
        bindingVersion: input.binding.version,
        requestCommitment: input.binding.commitment,
        bodyHash: `sha256:${input.binding.bodySha256}`,
      },
      challenge: {
        x402Version: 2,
        challengeId: purchase.challengeId,
        requestedAt: "2026-07-13T10:00:00.000Z",
        executeBefore: "2026-07-13T10:00:45.000Z",
        network: "canton:devnet",
        scheme: "exact",
        transferMethod: "transfer-factory",
        payerParty: PAYER,
        recipientParty: PROVIDER,
        amountAtomic: "2500000000",
        asset: "CC",
        feePayerParty: PAYER,
        instrument: { admin: DSO, id: "Amulet" },
        synchronizerId: "global-domain::1220sync",
      },
      capability: {
        agentParty: AGENT,
        contractId: "00capability7",
        templateId: CAPABILITY_TEMPLATE_ID,
        expectedRevision: "7",
        resourceBindingVersion: "sotto-resource-v1",
        resourceHash: routeHash(RESOURCE_URL),
        recipientParty: PROVIDER,
        perCallLimitAtomic: "3000000000",
        remainingAllowanceAtomic: "10000000000",
        maximumTotalDebitAtomic: "3250000000",
        expiresAt: "2026-07-13T11:00:00.000Z",
      },
      tokenFactory: {
        interfaceId: input.tokenFactory.interfaceId,
        contractId: input.tokenFactory.contractId,
        creationTemplateId: input.tokenFactory.creationTemplateId,
        expectedAdmin: input.tokenFactory.expectedAdmin,
      },
    });
  });

  it("rejects a structurally perfect commitment clone", () => {
    const purchase = commitBoundedPurchase(createPurchaseInput());

    expect(() => readBoundedPurchaseLedgerIntent({ ...purchase })).toThrow(
      "not authenticated",
    );
  });

  it("rejects mutated canonical commitment bytes", () => {
    const purchase = commitBoundedPurchase(createPurchaseInput());
    purchase.canonicalBytes[0] = purchase.canonicalBytes[0]! ^ 1;

    expect(() => readBoundedPurchaseLedgerIntent(purchase)).toThrow("mutated");
  });

  it("rejects an empty Canton network identifier", () => {
    const input = mutateChallenge(createPurchaseInput(), (challenge) => {
      challenge.accepts[0]!.network = "canton:";
    });
    const purchase = commitBoundedPurchase({
      ...input,
      expectedNetwork: "canton:",
    });

    expect(() => readBoundedPurchaseLedgerIntent(purchase)).toThrow("network");
  });

  it("returns a deeply frozen authenticated intent", () => {
    const intent = readBoundedPurchaseLedgerIntent(
      commitBoundedPurchase(createPurchaseInput()),
    );

    expect(Object.isFrozen(intent)).toBe(true);
    expect(Object.isFrozen(intent.actAs)).toBe(true);
    expect(Object.isFrozen(intent.request)).toBe(true);
    expect(Object.isFrozen(intent.challenge)).toBe(true);
    expect(Object.isFrozen(intent.challenge.instrument)).toBe(true);
    expect(Object.isFrozen(intent.capability)).toBe(true);
    expect(Object.isFrozen(intent.tokenFactory)).toBe(true);
    expect(() =>
      readAuthenticatedBoundedPurchaseLedgerIntent(structuredClone(intent)),
    ).toThrow("not authenticated");
  });

  it("does not expose canonical bytes, observations, or request material", () => {
    const bodySecret = "private-body-secret";
    const headerSecret = "private-header-secret";
    const querySecret = "private-query-secret";
    const input = replaceBoundRequest(createPurchaseInput(), {
      body: new TextEncoder().encode(bodySecret),
      headers: [
        ["content-type", "application/json"],
        ["idempotency-key", headerSecret],
      ],
      method: "POST",
      url: `https://provider.example/paid/weather?token=${querySecret}`,
    });
    const intent = readBoundedPurchaseLedgerIntent(
      commitBoundedPurchase(input),
    );
    const serialized = JSON.stringify(intent);

    expect(serialized).not.toContain("authorization-7");
    expect(serialized).not.toContain("canonicalBytes");
    expect(serialized).not.toContain("observationId");
    expect(serialized).not.toContain("created-event-blob");
    expect(serialized).not.toContain(bodySecret);
    expect(serialized).not.toContain(headerSecret);
    expect(serialized).not.toContain(querySecret);
  });

  it("remains readable after its source observation expires", () => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:00.000Z") });
    try {
      const input = mutateChallenge(createPurchaseInput(), (challenge) => {
        challenge.accepts[0]!.maxTimeoutSeconds = 120;
        challenge.accepts[0]!.extra.executeBeforeSeconds = 120;
      });
      const purchase = commitBoundedPurchase(input);
      const expected = readBoundedPurchaseLedgerIntent(purchase);
      vi.advanceTimersByTime(60_001);

      expect(() => readPurchaseCapabilityObservation(input.capability)).toThrow(
        "stale",
      );
      expect(readBoundedPurchaseLedgerIntent(purchase)).toEqual(expected);
    } finally {
      vi.useRealTimers();
    }
  });
});
