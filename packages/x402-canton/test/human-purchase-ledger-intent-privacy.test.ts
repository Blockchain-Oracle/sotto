import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { commitHumanPurchaseForTest } from "../src/human-purchase-commitment.js";
import { readHumanPurchaseLedgerIntent } from "../src/human-purchase-ledger-intent.js";
import {
  HUMAN_PURCHASE_NOW,
  HUMAN_TOKEN_FACTORY_CONFIGURATION,
  createHumanPurchaseInput,
} from "./human-purchase-commitment.fixtures.js";
import { RESOURCE_URL } from "./purchase-commitment.fixtures.js";

beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
afterEach(() => vi.useRealTimers());

it("does not expose raw request, challenge, or authorization material", async () => {
  const privateUrl = `${RESOURCE_URL}&access_token=private-intent-query`;
  const input = await createHumanPurchaseInput({
    mutateChallenge: (challenge) => {
      challenge.resource.url = privateUrl;
    },
    request: {
      body: new TextEncoder().encode("private intent body"),
      headers: [["idempotency-key", "private intent header"]],
      method: "POST",
      url: privateUrl,
    },
  });
  const commitment = commitHumanPurchaseForTest(
    input,
    HUMAN_TOKEN_FACTORY_CONFIGURATION,
    "human-intent-privacy",
  );
  const intent = readHumanPurchaseLedgerIntent(commitment);
  const serialized = JSON.stringify(intent);

  expect(intent.request).toMatchObject({
    method: "POST",
    queryPresent: true,
    resourceOrigin: "https://provider.example",
    resourcePath: "/paid/weather",
  });
  for (const forbidden of [
    "private-intent-query",
    "private intent body",
    "private intent header",
    "canonicalBytes",
    "authorizationInstanceId",
    "observationId",
    "challengeBytes",
    "paymentObservation",
    "capability",
    "allowance",
    "agentParty",
    "policy",
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
});
