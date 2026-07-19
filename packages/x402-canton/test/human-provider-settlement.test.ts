import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as publicApi from "../src/index.js";
import {
  authenticateHumanPurchaseProviderSettlement,
  readAuthenticatedHumanPurchaseProviderSettlement,
} from "../src/index.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  child,
  humanProviderSettlementFixture,
  setSettlementValue,
} from "./human-provider-settlement.fixtures.js";

describe("human provider settlement", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("authenticates the exact provider-visible settlement and its offset", async () => {
    const { expected, proof, response } =
      await humanProviderSettlementFixture();
    const settlement = authenticateHumanPurchaseProviderSettlement(
      response,
      proof,
      expected,
    );

    expect(
      readAuthenticatedHumanPurchaseProviderSettlement(settlement),
    ).toEqual({
      ...proof,
      transactionOffset: 42,
    });
    expect(Object.isFrozen(settlement)).toBe(true);
    expect(JSON.stringify(settlement)).toBe(
      '{"version":"sotto-authenticated-human-provider-settlement-v1"}',
    );
  });

  it("accepts only an exact, redacted, or omitted provider command ID", async () => {
    const { expected, proof, response } =
      await humanProviderSettlementFixture();
    for (const commandId of [expected.commandId, ""] as const) {
      const candidate = structuredClone(response);
      setSettlementValue(candidate, ["transaction", "commandId"], commandId);
      expect(() =>
        authenticateHumanPurchaseProviderSettlement(candidate, proof, expected),
      ).not.toThrow();
    }
    const omitted = structuredClone(response);
    const transaction = child(omitted, "transaction") as Record<
      string,
      unknown
    >;
    delete transaction.commandId;
    expect(() =>
      authenticateHumanPurchaseProviderSettlement(omitted, proof, expected),
    ).not.toThrow();
    for (const invalid of [undefined, null, " ", "wrong-command"]) {
      const candidate = structuredClone(response);
      setSettlementValue(candidate, ["transaction", "commandId"], invalid);
      expect(() =>
        authenticateHumanPurchaseProviderSettlement(candidate, proof, expected),
      ).toThrow(/did not reconcile/iu);
    }
  });

  it("tolerates bounded unrelated Ledger events without weakening the exact pair", async () => {
    const { expected, proof, response } =
      await humanProviderSettlementFixture();
    const candidate = structuredClone(response) as Record<string, unknown>;
    candidate.traceContext = { ignored: true };
    const events = child(
      child(candidate, "transaction"),
      "events",
    ) as unknown[];
    events.push({
      CreatedEvent: {
        contractId: "00unrelated-created-contract",
        createArgument: { ignored: true },
        templateId: `${"0".repeat(64)}:Example:Unrelated`,
      },
    });

    expect(() =>
      authenticateHumanPurchaseProviderSettlement(candidate, proof, expected),
    ).not.toThrow();
  });

  it("snapshots proof data and rejects structural authority clones", async () => {
    const { expected, proof, response } =
      await humanProviderSettlementFixture();
    const mutable = { ...proof };
    const settlement = authenticateHumanPurchaseProviderSettlement(
      response,
      mutable,
      expected,
    );
    mutable.updateId = `1220${"e".repeat(64)}`;
    const first = readAuthenticatedHumanPurchaseProviderSettlement(settlement);

    expect(first.updateId).toBe(proof.updateId);
    expect(Object.isFrozen(first)).toBe(true);
    expect(readAuthenticatedHumanPurchaseProviderSettlement(settlement)).toBe(
      first,
    );
    expect(() =>
      readAuthenticatedHumanPurchaseProviderSettlement({ ...settlement }),
    ).toThrow(/not authenticated/iu);
    expect(() =>
      authenticateHumanPurchaseProviderSettlement(response, proof, {
        ...expected,
      } as never),
    ).toThrow(/did not reconcile/iu);
  });

  it("does not expose low-level event matchers or registration state", () => {
    expect(publicApi).not.toHaveProperty("exactHumanSendV2CreatesHolding");
    expect(publicApi).not.toHaveProperty(
      "registerAuthenticatedHumanPurchaseProviderSettlement",
    );
    expect(publicApi).not.toHaveProperty(
      "reconcileHumanPurchaseProviderTransaction",
    );
  });
});
