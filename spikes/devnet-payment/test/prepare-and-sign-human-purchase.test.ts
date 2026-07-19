import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prepareAndSignHumanPurchase } from "../src/prepare-and-sign-human-purchase.js";
import { prepareOnlyHumanInput } from "./prepare-only-human-purchase.fixtures.js";

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-07-16T15:00:00.000Z") });
});

afterEach(() => vi.useRealTimers());

it("joins the authenticated preparation to the same wallet connector", async () => {
  const events: string[] = [];
  const requestApproval = vi.fn(async (request: { sessionId: string }) => {
    events.push("wallet-approval");
    return {
      version: "sotto-human-wallet-response-v1" as const,
      outcome: "rejected" as const,
      reason: "user-rejected" as const,
      sessionId: request.sessionId,
    };
  });
  const input = await prepareOnlyHumanInput(events, requestApproval as never);
  const resolveRegisteredPublicKey = vi.fn();

  const result = await prepareAndSignHumanPurchase(
    input,
    { resolveRegisteredPublicKey },
    { timeoutMilliseconds: 600_000 },
  );

  expect(events).toEqual([
    "wallet-preflight",
    "payment-402",
    "holdings-ledger-end",
    "holdings-acs",
    "registry",
    "prepare",
    "official-hash",
    "wallet-approval",
  ]);
  expect(requestApproval).toHaveBeenCalledOnce();
  expect(resolveRegisteredPublicKey).not.toHaveBeenCalled();
  expect(result).toMatchObject({
    status: "wallet-rejected",
    signingSession: { outcome: "rejected", reason: "user-rejected" },
  });
  expect(JSON.stringify(result)).not.toMatch(
    /preparedTransaction"|signature"|publicKey"/u,
  );
});
