import type { Metadata } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateHumanPreparedPurchaseMetadata } from "../src/human-prepared-purchase-metadata.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  humanPreparedRootInputs,
  type HumanPreparedRootInputs,
} from "./human-prepared-purchase-root.fixtures.js";

function exactMetadata({ intent, request }: HumanPreparedRootInputs): Metadata {
  const requestedAt = BigInt(Date.parse(intent.challenge.requestedAt)) * 1_000n;
  const executeBefore = BigInt(Date.parse(request.maxRecordTime)) * 1_000n;
  return {
    submitterInfo: { actAs: [...request.actAs], commandId: request.commandId },
    synchronizerId: request.synchronizerId,
    mediatorGroup: 0,
    transactionUuid: "00000000-0000-4000-8000-000000000002",
    preparationTime: requestedAt + 1_000n,
    inputContracts: [],
    globalKeyMapping: [],
    minLedgerEffectiveTime: requestedAt + 1n,
    maxLedgerEffectiveTime: executeBefore - 1n,
    maxRecordTime: executeBefore,
  };
}

describe("human prepared transaction metadata", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("validates exact payer submission and bounded ledger times", async () => {
    const input = await humanPreparedRootInputs();
    const budget = { items: 0 };
    const metadata = validateHumanPreparedPurchaseMetadata(
      exactMetadata(input),
      input.intent,
      input.request,
      budget,
    );
    expect(metadata.inputContracts.size).toBe(0);
    expect(metadata.inputEventBlobs.size).toBe(0);
  });

  it("accepts an inclusive requestedAt ledger-time bound", async () => {
    const input = await humanPreparedRootInputs();
    const metadata = exactMetadata(input);
    metadata.minLedgerEffectiveTime =
      BigInt(Date.parse(input.intent.challenge.requestedAt)) * 1_000n;

    expect(() =>
      validateHumanPreparedPurchaseMetadata(
        metadata,
        input.intent,
        input.request,
        { items: 0 },
      ),
    ).not.toThrow();
  });

  it("rejects a ledger-time bound before requestedAt", async () => {
    const input = await humanPreparedRootInputs();
    const metadata = exactMetadata(input);
    metadata.minLedgerEffectiveTime =
      BigInt(Date.parse(input.intent.challenge.requestedAt)) * 1_000n - 1n;

    expect(() =>
      validateHumanPreparedPurchaseMetadata(
        metadata,
        input.intent,
        input.request,
        { items: 0 },
      ),
    ).toThrow(/ledger-time bounds/iu);
  });

  it.each([
    ["at requestedAt", 0n],
    ["at executeBefore", 600_000_000n],
  ])("rejects preparation time %s", async (_label, offset) => {
    const input = await humanPreparedRootInputs();
    const metadata = exactMetadata(input);
    const requestedAt =
      BigInt(Date.parse(input.intent.challenge.requestedAt)) * 1_000n;
    metadata.minLedgerEffectiveTime = requestedAt;
    metadata.preparationTime = requestedAt + offset;

    expect(() =>
      validateHumanPreparedPurchaseMetadata(
        metadata,
        input.intent,
        input.request,
        { items: 0 },
      ),
    ).toThrow(/ledger-time bounds/iu);
  });

  it.each([
    [
      "payer authority",
      (metadata: Metadata) =>
        (metadata.submitterInfo!.actAs = ["agent::1220agent"]),
    ],
    [
      "command identity",
      (metadata: Metadata) => (metadata.submitterInfo!.commandId = "other"),
    ],
    [
      "synchronizer",
      (metadata: Metadata) => (metadata.synchronizerId = "other::1220sync"),
    ],
    [
      "record deadline",
      (metadata: Metadata) => (metadata.maxRecordTime! -= 1n),
    ],
    [
      "global key mapping",
      (metadata: Metadata) => metadata.globalKeyMapping.push({}),
    ],
  ])("rejects changed %s", async (_label, mutate) => {
    const input = await humanPreparedRootInputs();
    const metadata = exactMetadata(input);
    mutate(metadata);
    expect(() =>
      validateHumanPreparedPurchaseMetadata(
        metadata,
        input.intent,
        input.request,
        { items: 0 },
      ),
    ).toThrow(/prepared/iu);
  });
});
