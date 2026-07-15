import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  buildBoundedCapabilityBootstrap,
  parseBoundedCapabilityBootstrapCompletionResponse,
} from "../src/index.js";

const input = {
  agentParty: "sotto-policy-agent::1220participant",
  allowedRecipient: "sotto-spike-provider::1220participant",
  allowedResourceHash: `sha256:${"a".repeat(64)}` as const,
  expiresAt: "2026-07-13T20:30:00.000Z",
  instrument: { admin: "DSO::1220dso", id: "Amulet" },
  maximumTotalDebitAtomic: "3250000000",
  payerParty: "sotto-spike-payer::1220participant",
  perCallLimitAtomic: "2500000000",
  remainingAllowanceAtomic: "10000000000",
  synchronizerId: "global-domain::1220synchronizer",
  transferFactoryContractId: "00transferfactory",
  userId: "ledger-user-6",
} as const;

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-07-13T19:30:00.000Z") });
});

afterEach(() => vi.useRealTimers());

it("parses the authenticated minimal submit-and-wait completion identity", () => {
  const request = buildBoundedCapabilityBootstrap(input);
  const updateId = `1220${"c".repeat(64)}`;

  expect(
    parseBoundedCapabilityBootstrapCompletionResponse(
      { completionOffset: 42, updateId },
      request,
    ),
  ).toEqual({ offset: 42, updateId });
  expect(() =>
    parseBoundedCapabilityBootstrapCompletionResponse(
      { completionOffset: 42, updateId },
      { ...request },
    ),
  ).toThrow("not authenticated");
});

it.each([
  [{ completionOffset: -1, updateId: `1220${"c".repeat(64)}` }, "offset"],
  [{ completionOffset: 42.5, updateId: `1220${"c".repeat(64)}` }, "offset"],
  [{ completionOffset: 42, updateId: "bad-update" }, "update ID"],
] as const)(
  "rejects malformed minimal response metadata",
  (response, error) => {
    const request = buildBoundedCapabilityBootstrap(input);

    expect(() =>
      parseBoundedCapabilityBootstrapCompletionResponse(response, request),
    ).toThrow(error);
  },
);
