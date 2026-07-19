import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectHumanPurchaseJournalIntent } from "../src/human-purchase-journal-intent.js";
import {
  HUMAN_PURCHASE_EXPIRES_AT,
  HUMAN_PURCHASE_NOW,
} from "./human-purchase-commitment.fixtures.js";
import { authenticatedHumanPurchaseIntent } from "./human-purchase-holding.fixtures.js";

describe("authenticated human purchase journal intent", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) });
  });

  afterEach(() => vi.useRealTimers());

  it("projects only the authenticated durable purchase authority", async () => {
    const intent = await authenticatedHumanPurchaseIntent();
    const projection = projectHumanPurchaseJournalIntent(intent);

    expect(projection).toEqual({
      version: "sotto-human-purchase-journal-intent-v1",
      authorizationMode: "human-wallet",
      commitmentVersion: "sotto-human-purchase-v1",
      operationId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      attemptId: intent.attemptId,
      requestCommitment: intent.request.requestCommitment,
      challengeId: intent.challenge.challengeId,
      purchaseCommitment: intent.purchaseCommitment,
      commandId: `sotto-human-purchase-v1-${intent.purchaseCommitment.slice(7)}`,
      requestedAt: HUMAN_PURCHASE_NOW,
      executeBefore: HUMAN_PURCHASE_EXPIRES_AT,
      resource: {
        method: "GET",
        origin: "https://provider.example",
        path: "/paid/weather",
      },
    });
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.resource)).toBe(true);
    expect(JSON.stringify(projection)).not.toMatch(
      /bodyHash|payerParty|authorizationInstance|publicKey|subjectHash/iu,
    );
  });

  it("rejects structural look-alikes", async () => {
    const intent = await authenticatedHumanPurchaseIntent();
    expect(() =>
      projectHumanPurchaseJournalIntent(structuredClone(intent) as never),
    ).toThrow(/not authenticated/iu);
  });

  it("rejects an intent that no longer has the signing reserve", async () => {
    const intent = await authenticatedHumanPurchaseIntent();
    vi.setSystemTime(new Date("2026-07-16T15:08:00.001Z"));

    expect(() => projectHumanPurchaseJournalIntent(intent)).toThrow(
      /signing reserve/iu,
    );
  });
});
