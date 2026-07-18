import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateHumanPurchaseProviderSettlement } from "../src/index.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  child,
  HUMAN_PROVIDER_HOLDING,
  humanProviderSettlementFixture,
  setSettlementValue,
} from "./human-provider-settlement.fixtures.js";
import { HUMAN_PROVIDER_SETTLEMENT_MUTATIONS } from "./human-provider-settlement-mutations.js";

function reject(
  response: unknown,
  proof: Parameters<typeof authenticateHumanPurchaseProviderSettlement>[1],
  expected: Parameters<typeof authenticateHumanPurchaseProviderSettlement>[2],
): void {
  expect(() =>
    authenticateHumanPurchaseProviderSettlement(response, proof, expected),
  ).toThrow(new Error("human provider settlement did not reconcile"));
}

describe("human provider settlement security", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it.each(HUMAN_PROVIDER_SETTLEMENT_MUTATIONS)(
    "rejects a %s mutation",
    async (_label, path, replacement) => {
      const { expected, proof, response } =
        await humanProviderSettlementFixture();
      const candidate = structuredClone(response);
      setSettlementValue(candidate, path, replacement);
      reject(candidate, proof, expected);
    },
  );

  it("rejects malformed and relabeled proof envelopes", async () => {
    const { expected, proof, response } =
      await humanProviderSettlementFixture();
    for (const key of [
      "attemptId",
      "challengeId",
      "requestCommitment",
      "purchaseCommitment",
    ] as const) {
      reject(
        response,
        { ...proof, [key]: `sha256:${"e".repeat(64)}` },
        expected,
      );
    }
    for (const candidate of [
      null,
      [],
      { ...proof, extra: true },
      { ...proof, attemptId: "SHA256:wrong" },
      { ...proof, updateId: `1220${"A".repeat(64)}` },
    ]) {
      reject(response, candidate as never, expected);
    }
    const missing = { ...proof } as Record<string, unknown>;
    delete missing.challengeId;
    reject(response, missing as never, expected);
  });

  it("rejects sparse, ambiguous, duplicate, and oversized event sets", async () => {
    const { expected, proof, response } =
      await humanProviderSettlementFixture();
    const sparse = structuredClone(response);
    const sparseEvents = child(
      child(sparse, "transaction"),
      "events",
    ) as unknown[];
    sparseEvents.length = 3;
    delete sparseEvents[1];
    reject(sparse, proof, expected);

    const ambiguous = structuredClone(response);
    const ambiguousEvents = child(
      child(ambiguous, "transaction"),
      "events",
    ) as Array<Record<string, unknown>>;
    ambiguousEvents[0]!.CreatedEvent = structuredClone(
      ambiguousEvents[1]!.CreatedEvent,
    );
    ambiguousEvents.pop();
    ambiguousEvents.push({ ExercisedEvent: { choice: "unrelated" } });
    reject(ambiguous, proof, expected);

    for (const index of [0, 1]) {
      const duplicate = structuredClone(response);
      const events = child(
        child(duplicate, "transaction"),
        "events",
      ) as unknown[];
      events.push(structuredClone(events[index]));
      reject(duplicate, proof, expected);
    }

    const oversized = structuredClone(response);
    const events = child(
      child(oversized, "transaction"),
      "events",
    ) as unknown[];
    while (events.length < 129) {
      events.push({ ExercisedEvent: { choice: "unrelated" } });
    }
    reject(oversized, proof, expected);
  });

  it("rejects sparse inputs and malformed or colliding provider holding IDs", async () => {
    const { expected, proof, response } =
      await humanProviderSettlementFixture();
    const sparse = structuredClone(response);
    const inputs = child(
      child(
        child(child(child(sparse, "transaction"), "events"), 0),
        "ExercisedEvent",
      ),
      "choiceArgument",
    ) as { inputs: unknown[] };
    inputs.inputs.length += 1;
    reject(sparse, proof, expected);

    for (const contractId of [
      " ",
      "bad\ncontract",
      "bad\ud800contract",
      "not-a-contract",
      expected.providerParty,
      expected.inputHoldingContractIds[0],
      "x".repeat(2_049),
    ]) {
      const candidate = structuredClone(response);
      setSettlementValue(
        candidate,
        ["transaction", "events", 1, "CreatedEvent", "contractId"],
        contractId,
      );
      setSettlementValue(
        candidate,
        [
          "transaction",
          "events",
          0,
          "ExercisedEvent",
          "exerciseResult",
          "result",
          "createdAmulets",
          0,
          "value",
        ],
        contractId,
      );
      reject(candidate, proof, expected);
    }
    expect(HUMAN_PROVIDER_HOLDING).not.toContain(" ");
  });

  it("fails closed for cyclic acting-party data", async () => {
    const { expected, proof, response } =
      await humanProviderSettlementFixture();
    const candidate = structuredClone(response);
    const acting: unknown[] = [];
    acting.push(acting);
    setSettlementValue(
      candidate,
      ["transaction", "events", 0, "ExercisedEvent", "actingParties"],
      acting,
    );
    reject(candidate, proof, expected);
  });
});
