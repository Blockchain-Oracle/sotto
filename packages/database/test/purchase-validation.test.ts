import { projectHumanPurchaseJournalIntent } from "@sotto/x402-canton";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateHumanPurchaseAttemptInitialization } from "../src/purchase-validation.js";
import {
  catalogHumanPurchaseIntent,
  humanPurchaseBinding,
  PURCHASE_SOURCE_COMMIT,
} from "./purchase-journal.fixtures.js";

describe("human purchase attempt initialization", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-18T03:30:00.000Z") });
  });

  afterEach(() => vi.useRealTimers());

  it("derives fixed human-only journal identities", async () => {
    const intent = projectHumanPurchaseJournalIntent(
      await catalogHumanPurchaseIntent(),
    );
    const validated = validateHumanPurchaseAttemptInitialization(
      intent,
      humanPurchaseBinding,
      PURCHASE_SOURCE_COMMIT,
    );

    expect(validated).toMatchObject({
      operationId: intent.operationId,
      attemptId: intent.attemptId,
      ownerId: humanPurchaseBinding.ownerId,
      resourceRevisionId: humanPurchaseBinding.resourceRevisionId,
      authorizationMode: "human-wallet",
      commitmentVersion: "sotto-human-purchase-v1",
      commandId: intent.commandId,
      eventSequence: 1,
      eventType: "intent-created",
      jobKind: "purchase-prepare",
      jobState: "ready",
      state: "intent-created",
      requestHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      eventHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      jobDedupeKey: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    });
  });

  it.each([
    ["extra binding field", { ...humanPurchaseBinding, mode: "agent" }],
    ["negative offset", { ...humanPurchaseBinding, beginExclusive: -1 }],
    ["malformed owner", { ...humanPurchaseBinding, ownerId: "owner" }],
    [
      "malformed revision",
      { ...humanPurchaseBinding, resourceRevisionId: "revision" },
    ],
  ])("rejects %s", async (_label, binding) => {
    const intent = projectHumanPurchaseJournalIntent(
      await catalogHumanPurchaseIntent(),
    );
    expect(() =>
      validateHumanPurchaseAttemptInitialization(
        intent,
        binding as never,
        PURCHASE_SOURCE_COMMIT,
      ),
    ).toThrow();
  });

  it("rejects a caller-supplied source identity", async () => {
    const intent = projectHumanPurchaseJournalIntent(
      await catalogHumanPurchaseIntent(),
    );
    expect(() =>
      validateHumanPurchaseAttemptInitialization(
        intent,
        humanPurchaseBinding,
        "main",
      ),
    ).toThrow(/source commit/iu);
  });
});
