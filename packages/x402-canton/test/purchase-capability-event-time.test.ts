import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildBoundedCapabilityBootstrap } from "../src/index.js";
import { parsePurchaseCapabilityCreatedEvent } from "../src/purchase-capability-event.js";

const payer = "sotto-spike-payer::1220participant";
const agent = "sotto-policy-agent::1220participant";

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-07-13T19:30:00.000Z") });
});

afterEach(() => vi.useRealTimers());

it.each([
  ["2026-07-13T20:30:00Z", "2026-07-13T20:30:00.000Z"],
  ["2026-07-13T20:30:00.0Z", "2026-07-13T20:30:00.000Z"],
  ["2026-07-13T20:30:00.58Z", "2026-07-13T20:30:00.580Z"],
  ["2026-07-13T20:30:00.580000Z", "2026-07-13T20:30:00.580Z"],
])("normalizes the valid Daml timestamp %s", (expiresAt, expected) => {
  const request = buildBoundedCapabilityBootstrap({
    agentParty: agent,
    allowedRecipient: "sotto-spike-provider::1220participant",
    allowedResourceHash: `sha256:${"a".repeat(64)}`,
    expiresAt: "2026-07-13T20:30:00.000Z",
    instrument: { admin: "DSO::1220dso", id: "Amulet" },
    maximumTotalDebitAtomic: "3250000000",
    network: "canton:devnet",
    payerParty: payer,
    perCallLimitAtomic: "2500000000",
    remainingAllowanceAtomic: "3250000000",
    synchronizerId: "global-domain::1220synchronizer",
    transferFactoryContractId: "00transferfactory",
    userId: "ledger-user-6",
  });
  const create = request.commands[0]!.CreateCommand;

  expect(
    parsePurchaseCapabilityCreatedEvent({
      contractId: "00capability",
      createArgument: { ...create.createArguments, expiresAt },
      observers: [agent],
      packageName: "sotto-control",
      signatories: [payer],
      templateId: create.templateId,
    }).expiresAt,
  ).toBe(expected);
});
