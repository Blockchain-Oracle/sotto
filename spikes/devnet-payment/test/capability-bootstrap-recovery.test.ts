import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBoundedCapabilityBootstrap,
  exportBoundedCapabilityBootstrapIntent,
} from "@sotto/x402-canton";
import { recoverBoundedCapabilityBootstrap } from "../src/capability-bootstrap-runner.js";

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
  transferFactoryContractId: "00transferfactory",
  userId: "ledger-user-6",
} as const;

describe("capability bootstrap recovery", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("recovers a persisted intent after restart without a submit surface", async () => {
    vi.setSystemTime(Date.parse("2026-07-13T19:30:00.000Z"));
    const request = buildBoundedCapabilityBootstrap(input);
    const intent = JSON.parse(
      JSON.stringify(
        exportBoundedCapabilityBootstrapIntent(request, "a".repeat(40)),
      ),
    ) as unknown;
    vi.setSystemTime(Date.parse("2026-07-15T19:30:00.000Z"));
    const active = {
      contractEntry: {
        JsActiveContract: {
          createdEvent: {
            contractId: "00capability",
            createArgument: request.commands[0]!.CreateCommand.createArguments,
            observers: [input.agentParty],
            packageName: "sotto-control",
            signatories: [input.payerParty],
            templateId: request.commands[0]!.CreateCommand.templateId,
          },
        },
      },
    };

    await expect(
      recoverBoundedCapabilityBootstrap({
        intent,
        readActiveCapabilities: vi.fn(async () => [active]),
      }),
    ).resolves.toEqual({
      commandId: request.commandId,
      contractId: "00capability",
      offset: null,
      outcome: "recovered",
      updateId: null,
    });
  });
});
