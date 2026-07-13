import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID,
  buildBoundedCapabilityBootstrap,
  exportBoundedCapabilityBootstrapIntent,
  parseBoundedCapabilityBootstrapResponse,
  reconcileBoundedCapabilityBootstrapAcs,
  restoreBoundedCapabilityBootstrapIntent,
  type BoundedCapabilityBootstrapInput,
} from "../src/index.js";

const now = Date.parse("2026-07-13T19:30:00.000Z");
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

describe("bounded capability bootstrap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds one deterministic payer-only create command", () => {
    const request = buildBoundedCapabilityBootstrap(input);

    expect(request.actAs).toEqual([input.payerParty]);
    expect(request.readAs).toEqual([]);
    expect(request.synchronizerId).toBe(input.synchronizerId);
    expect(request.packageIdSelectionPreference).toEqual([
      APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID.split(":")[0],
    ]);
    expect(request.commandId).toBe(
      "sotto-capability-bootstrap-v1-e9db1381afd43d39258b1a021aefb6fbc325f4c84b264feaf476bf330a531abe",
    );
    expect(buildBoundedCapabilityBootstrap(input)).toEqual(request);
    expect(request.commands).toEqual([
      {
        CreateCommand: {
          templateId: APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID,
          createArguments: {
            payer: input.payerParty,
            agent: input.agentParty,
            resourceBindingVersion: "sotto-resource-v1",
            allowedResourceHash: input.allowedResourceHash,
            allowedRecipient: input.allowedRecipient,
            instrumentId: input.instrument,
            perCallLimit: "0.2500000000",
            remainingAllowance: "1.0000000000",
            maximumTotalDebit: "0.3250000000",
            expiresAt: input.expiresAt,
            revision: "0",
            paused: false,
            transferFactoryCid: input.transferFactoryContractId,
            expectedAdmin: input.instrument.admin,
          },
        },
      },
    ]);
  });

  it.each([
    [
      "same payer and agent",
      { agentParty: input.payerParty },
      "payer and agent must be distinct",
    ],
    [
      "foreign payer",
      { payerParty: "not-sotto::1220participant" },
      "payer Party must be a bounded sotto- Party",
    ],
    [
      "wrong instrument",
      { instrument: { ...input.instrument, id: "Other" } },
      "instrument must be Amulet",
    ],
    [
      "oversized allowance",
      { remainingAllowanceAtomic: "10000000001" },
      "allowance exceeds the bootstrap cap",
    ],
    [
      "closed lifetime",
      { expiresAt: "2026-07-13T19:34:59.999Z" },
      "expiry must leave at least five minutes",
    ],
    [
      "long lifetime",
      { expiresAt: "2026-07-14T19:30:00.001Z" },
      "expiry exceeds the bootstrap lifetime",
    ],
  ])("rejects %s before command construction", (_label, mutation, message) => {
    expect(() =>
      buildBoundedCapabilityBootstrap({ ...input, ...mutation }),
    ).toThrow(message);
  });

  it("ignores a forged clock argument at the public boundary", () => {
    const unsafeCall = buildBoundedCapabilityBootstrap as unknown as (
      value: BoundedCapabilityBootstrapInput,
      forgedClock: number,
    ) => unknown;

    expect(() =>
      unsafeCall(
        { ...input, expiresAt: "2030-07-13T20:30:00.000Z" },
        Date.parse("2030-07-13T19:30:00.000Z"),
      ),
    ).toThrow("expiry exceeds the bootstrap lifetime");
  });

  it("parses exactly one matching created capability", () => {
    const request = buildBoundedCapabilityBootstrap(input);
    const create = request.commands[0]!.CreateCommand;
    const contractId = "00capability";
    const updateId = `1220${"b".repeat(64)}`;
    const response = {
      transaction: {
        commandId: request.commandId,
        events: [
          {
            CreatedEvent: {
              contractId,
              templateId: create.templateId,
              packageName: "sotto-control",
              createArgument: create.createArguments,
              signatories: [input.payerParty],
              observers: [input.agentParty],
            },
          },
        ],
        offset: 42,
        synchronizerId: input.synchronizerId,
        updateId,
      },
    };

    expect(parseBoundedCapabilityBootstrapResponse(response, request)).toEqual({
      commandId: request.commandId,
      contractId,
      offset: 42,
      updateId,
    });
    expect(() =>
      parseBoundedCapabilityBootstrapResponse(
        {
          transaction: {
            ...response.transaction,
            events: [
              ...response.transaction.events,
              ...response.transaction.events,
            ],
          },
        },
        request,
      ),
    ).toThrow("exactly one");
    expect(() =>
      parseBoundedCapabilityBootstrapResponse(response, { ...request }),
    ).toThrow("not authenticated");
    expect(() =>
      parseBoundedCapabilityBootstrapResponse(
        {
          transaction: { ...response.transaction, updateId: "bad-update" },
        },
        request,
      ),
    ).toThrow("update ID");
    expect(() =>
      parseBoundedCapabilityBootstrapResponse(
        {
          transaction: {
            ...response.transaction,
            synchronizerId: "other-synchronizer",
          },
        },
        request,
      ),
    ).toThrow("synchronizer");
  });

  it("reconciles zero, exact, and unexpected active capabilities", () => {
    const request = buildBoundedCapabilityBootstrap(input);
    const create = request.commands[0]!.CreateCommand;
    const event = {
      contractId: "00capability",
      templateId: create.templateId,
      packageName: "sotto-control",
      createArgument: create.createArguments,
      signatories: [input.payerParty],
      observers: [input.agentParty],
    };
    const entry = (createdEvent: unknown) => ({
      contractEntry: {
        JsActiveContract: {
          createdEvent,
          synchronizerId: input.synchronizerId,
        },
      },
    });

    expect(reconcileBoundedCapabilityBootstrapAcs([], request)).toEqual({
      activeCount: 0,
      matchingContractIds: [],
    });
    expect(
      reconcileBoundedCapabilityBootstrapAcs([entry(event)], request),
    ).toEqual({
      activeCount: 1,
      matchingContractIds: [event.contractId],
    });
    expect(
      reconcileBoundedCapabilityBootstrapAcs(
        [
          entry({
            ...event,
            createArgument: {
              ...event.createArgument,
              remainingAllowance: "0.5000000000",
            },
          }),
        ],
        request,
      ),
    ).toEqual({ activeCount: 1, matchingContractIds: [] });

    const intent = exportBoundedCapabilityBootstrapIntent(
      request,
      "a".repeat(40),
    );
    const restored = restoreBoundedCapabilityBootstrapIntent(
      JSON.parse(JSON.stringify(intent)) as unknown,
    );
    vi.setSystemTime(Date.parse("2026-07-15T19:30:00.000Z"));
    expect(
      reconcileBoundedCapabilityBootstrapAcs([entry(event)], restored),
    ).toEqual({ activeCount: 1, matchingContractIds: [event.contractId] });
    expect(() =>
      restoreBoundedCapabilityBootstrapIntent({
        ...intent,
        request: { ...intent.request, commandId: "tampered" },
      }),
    ).toThrow("does not match");
    expect(() =>
      restoreBoundedCapabilityBootstrapIntent({
        ...intent,
        request: { ...intent.request, synchronizerId: "other-synchronizer" },
      }),
    ).toThrow("does not match");
    expect(() =>
      restoreBoundedCapabilityBootstrapIntent({
        ...intent,
        request: { ...intent.request, packageIdSelectionPreference: [] },
      }),
    ).toThrow("package preference");
  });
});
