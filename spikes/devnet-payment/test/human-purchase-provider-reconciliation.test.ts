import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HUMAN_PURCHASE_NOW } from "../../../packages/x402-canton/test/human-purchase-commitment.fixtures.js";
import { reconcileHumanPurchaseProviderTransaction } from "../src/human-purchase-provider-reconciliation.js";
import {
  HUMAN_SETTLEMENT_MUTATIONS,
  humanSettlementFixture,
} from "./human-purchase-provider-reconciliation.fixtures.js";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function child(value: unknown, key: string | number): unknown {
  if (typeof key === "number") {
    if (!Array.isArray(value)) throw new Error("test path is not an array");
    return value[key];
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("test path is not an object");
  }
  return (value as Record<string, unknown>)[key];
}

function setValue(
  value: unknown,
  path: readonly (string | number)[],
  replacement: unknown,
): void {
  const key = path.at(-1);
  if (key === undefined) throw new Error("test mutation path is empty");
  let parent = value;
  for (const entry of path.slice(0, -1)) parent = child(parent, entry);
  if (typeof key === "number") {
    if (!Array.isArray(parent)) throw new Error("test parent is not an array");
    parent[key] = replacement;
  } else {
    if (
      typeof parent !== "object" ||
      parent === null ||
      Array.isArray(parent)
    ) {
      throw new Error("test parent is not an object");
    }
    (parent as Record<string, unknown>)[key] = replacement;
  }
}

describe("human provider settlement reconciliation", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("accepts the exact payer-authorized SendV2 and linked provider Holding", async () => {
    const { expected, proof, response } = await humanSettlementFixture();

    expect(
      reconcileHumanPurchaseProviderTransaction(response, proof, expected),
    ).toBe(true);
    expect(
      reconcileHumanPurchaseProviderTransaction(response, proof, {
        ...expected,
      } as never),
    ).toBe(false);
  });

  it.each(HUMAN_SETTLEMENT_MUTATIONS)(
    "rejects a %s mutation",
    async (_label, path, value) => {
      const { expected, proof, response } = await humanSettlementFixture();
      const changed = clone(response);
      setValue(changed, path, value);

      expect(
        reconcileHumanPurchaseProviderTransaction(changed, proof, expected),
      ).toBe(false);
    },
  );

  it("rejects proof relabeling, extra metadata, and a second SendV2", async () => {
    const { expected, proof, response } = await humanSettlementFixture();
    const relabeled = {
      ...proof,
      requestCommitment: `sha256:${"e".repeat(64)}` as const,
    };
    expect(
      reconcileHumanPurchaseProviderTransaction(response, relabeled, expected),
    ).toBe(false);

    const extraMetadata = clone(response);
    setValue(
      extraMetadata,
      [
        "transaction",
        "events",
        0,
        "ExercisedEvent",
        "choiceArgument",
        "meta",
        "values",
        "extra",
      ],
      "forbidden",
    );
    expect(
      reconcileHumanPurchaseProviderTransaction(extraMetadata, proof, expected),
    ).toBe(false);

    const duplicate = clone(response);
    const events = child(child(duplicate, "transaction"), "events");
    if (!Array.isArray(events) || events[0] === undefined) {
      throw new Error("test transaction events are absent");
    }
    events.push(clone(events[0]));
    expect(
      reconcileHumanPurchaseProviderTransaction(duplicate, proof, expected),
    ).toBe(false);
  });
});
