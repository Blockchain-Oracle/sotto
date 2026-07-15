import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildBoundedCapabilityBootstrap } from "@sotto/x402-canton";
import { runBoundedCapabilityBootstrap } from "../src/capability-bootstrap-runner.js";
import { AmbiguousTransactionSubmissionError } from "../src/five-north-transaction-submit.js";
import { capabilityBootstrapPersistence as persistence } from "./capability-bootstrap-runner.fixtures.js";

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

function setup() {
  const request = buildBoundedCapabilityBootstrap(input);
  const create = request.commands[0]!.CreateCommand;
  return {
    active: {
      contractEntry: {
        JsActiveContract: {
          createdEvent: {
            contractId: "00capability",
            createArgument: create.createArguments,
            observers: [input.agentParty],
            packageName: "sotto-control",
            signatories: [input.payerParty],
            templateId: create.templateId,
          },
          synchronizerId: input.synchronizerId,
        },
      },
    },
    request,
  } as const;
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-07-13T19:30:00.000Z") });
});

afterEach(() => vi.useRealTimers());

it("rejects minimal response metadata inconsistent with completion", async () => {
  const fixture = setup();
  const durable = persistence();

  await expect(
    runBoundedCapabilityBootstrap({
      readActiveCapabilities: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([fixture.active]),
      request: fixture.request,
      submit: vi.fn(async () => ({
        completionOffset: 42,
        updateId: `1220${"d".repeat(64)}`,
      })),
      ...durable,
    }),
  ).rejects.toThrow("completion and submission response are inconsistent");
});

it("surfaces only the safe ambiguity reason when evidence is absent", async () => {
  const fixture = setup();
  const durable = persistence();
  durable.readCompletion.mockResolvedValue({
    classification: "ABSENT_COMPLETE",
    completionOffset: 42,
  });

  await expect(
    runBoundedCapabilityBootstrap({
      readActiveCapabilities: vi.fn(async () => []),
      request: fixture.request,
      submit: vi.fn(async () => {
        throw new AmbiguousTransactionSubmissionError("HTTP_SERVER_ERROR");
      }),
      ...durable,
    }),
  ).rejects.toThrow(
    "capability bootstrap outcome is unresolved (HTTP_SERVER_ERROR)",
  );
});

it("reconciles an invalid HTTP success envelope through completion and ACS", async () => {
  const fixture = setup();

  await expect(
    runBoundedCapabilityBootstrap({
      readActiveCapabilities: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([fixture.active]),
      request: fixture.request,
      submit: vi.fn(async () => ({})),
      ...persistence(),
    }),
  ).resolves.toMatchObject({
    contractId: "00capability",
    outcome: "reconciled-after-ambiguous",
    updateId: `1220${"b".repeat(64)}`,
  });
});
