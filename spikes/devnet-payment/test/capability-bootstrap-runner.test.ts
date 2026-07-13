import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildBoundedCapabilityBootstrap } from "@sotto/x402-canton";
import { runBoundedCapabilityBootstrap } from "../src/capability-bootstrap-runner.js";
import {
  AmbiguousTransactionSubmissionError,
  createFiveNorthTransactionSubmitter,
} from "../src/five-north-transaction-submit.js";

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

function fixture() {
  const request = buildBoundedCapabilityBootstrap(input);
  const create = request.commands[0]!.CreateCommand;
  const contractId = "00capability";
  const event = {
    contractId,
    templateId: create.templateId,
    packageName: "sotto-control",
    createArgument: create.createArguments,
    signatories: [input.payerParty],
    observers: [input.agentParty],
  };
  return {
    active: {
      contractEntry: {
        JsActiveContract: {
          createdEvent: event,
          synchronizerId: input.synchronizerId,
        },
      },
    },
    contractId,
    request,
    response: {
      transaction: {
        commandId: request.commandId,
        events: [{ CreatedEvent: event }],
        offset: 42,
        synchronizerId: input.synchronizerId,
        updateId: `1220${"b".repeat(64)}`,
      },
    },
  } as const;
}

function persistence() {
  return {
    persistIntent: vi.fn(async () => undefined),
    persistSubmissionStarted: vi.fn(async () => undefined),
  };
}

describe("runBoundedCapabilityBootstrap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());

  it("submits once after an empty preflight and reconciles the exact contract", async () => {
    const setup = fixture();
    const readActiveCapabilities = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([setup.active]);
    const submit = vi.fn(async () => setup.response);
    const durable = persistence();

    await expect(
      runBoundedCapabilityBootstrap({
        readActiveCapabilities,
        request: setup.request,
        submit,
        ...durable,
      }),
    ).resolves.toMatchObject({
      contractId: setup.contractId,
      outcome: "submitted",
      updateId: setup.response.transaction.updateId,
    });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(readActiveCapabilities).toHaveBeenCalledTimes(2);
    expect(durable.persistIntent).toHaveBeenCalledTimes(1);
    expect(durable.persistSubmissionStarted).toHaveBeenCalledTimes(1);
    expect(durable.persistIntent.mock.invocationCallOrder[0]).toBeLessThan(
      readActiveCapabilities.mock.invocationCallOrder[0]!,
    );
    expect(
      durable.persistSubmissionStarted.mock.invocationCallOrder[0],
    ).toBeLessThan(submit.mock.invocationCallOrder[0]!);
  });

  it("blocks when any capability is already active", async () => {
    const setup = fixture();
    const submit = vi.fn();
    const durable = persistence();

    await expect(
      runBoundedCapabilityBootstrap({
        readActiveCapabilities: vi.fn(async () => [setup.active]),
        request: setup.request,
        submit,
        ...durable,
      }),
    ).rejects.toThrow("preflight must be empty");
    expect(submit).not.toHaveBeenCalled();
    expect(durable.persistSubmissionStarted).not.toHaveBeenCalled();
  });

  it("rechecks freshness before the durable submission marker", async () => {
    const setup = fixture();
    const submit = vi.fn();
    const durable = persistence();
    vi.setSystemTime(Date.parse(input.expiresAt) - 299_999);

    await expect(
      runBoundedCapabilityBootstrap({
        readActiveCapabilities: vi.fn(async () => []),
        request: setup.request,
        submit,
        ...durable,
      }),
    ).rejects.toThrow("at least five minutes");
    expect(durable.persistSubmissionStarted).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("rechecks freshness after the marker and before transport", async () => {
    const setup = fixture();
    const submit = vi.fn();
    const persistSubmissionStarted = vi.fn(async () => {
      vi.setSystemTime(Date.parse(input.expiresAt) - 299_999);
    });

    await expect(
      runBoundedCapabilityBootstrap({
        persistIntent: vi.fn(async () => undefined),
        persistSubmissionStarted,
        readActiveCapabilities: vi.fn(async () => []),
        request: setup.request,
        submit,
      }),
    ).rejects.toThrow("at least five minutes");
    expect(persistSubmissionStarted).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects clock rollback before the submission marker", async () => {
    const setup = fixture();
    const submit = vi.fn();
    const durable = persistence();
    vi.setSystemTime(now - 5_001);

    await expect(
      runBoundedCapabilityBootstrap({
        readActiveCapabilities: vi.fn(async () => []),
        request: setup.request,
        submit,
        ...durable,
      }),
    ).rejects.toThrow("clock moved backwards");
    expect(durable.persistSubmissionStarted).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("reconciles one ambiguous submission without retrying", async () => {
    const setup = fixture();
    const readActiveCapabilities = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([setup.active]);
    const submit = vi.fn(async () => {
      throw new AmbiguousTransactionSubmissionError();
    });
    const durable = persistence();

    await expect(
      runBoundedCapabilityBootstrap({
        readActiveCapabilities,
        request: setup.request,
        submit,
        ...durable,
      }),
    ).resolves.toMatchObject({
      contractId: setup.contractId,
      outcome: "reconciled-after-ambiguous",
      updateId: null,
    });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it.each([408, 429, 500, 502, 503, 504])(
    "reconciles HTTP %i without resubmitting",
    async (status) => {
      const setup = fixture();
      const readActiveCapabilities = vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([setup.active]);
      const fetcher = vi.fn<typeof fetch>(async () =>
        Response.json({ code: "UNAVAILABLE" }, { status }),
      );
      const submit = createFiveNorthTransactionSubmitter({
        accessToken: async () => "token",
        fetcher,
        ledgerUrl: "https://ledger.example.test",
      });

      await expect(
        runBoundedCapabilityBootstrap({
          ...persistence(),
          readActiveCapabilities,
          request: setup.request,
          submit,
        }),
      ).resolves.toMatchObject({ outcome: "reconciled-after-ambiguous" });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(readActiveCapabilities).toHaveBeenCalledTimes(2);
    },
  );

  it("preserves a definitive rejection without reconciliation", async () => {
    const setup = fixture();
    const readActiveCapabilities = vi.fn(async () => []);
    const submit = vi.fn(async () => {
      throw new Error("Five North request failed with HTTP 400");
    });
    const durable = persistence();

    await expect(
      runBoundedCapabilityBootstrap({
        readActiveCapabilities,
        request: setup.request,
        submit,
        ...durable,
      }),
    ).rejects.toThrow("HTTP 400");
    expect(submit).toHaveBeenCalledTimes(1);
    expect(readActiveCapabilities).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["zero", [], "outcome is unresolved"],
    ["multiple", [fixture().active, fixture().active], "duplicate"],
  ])(
    "stops after an ambiguous %s reconciliation",
    async (_label, after, message) => {
      const setup = fixture();
      const readActiveCapabilities = vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(after);
      const submit = vi.fn(async () => {
        throw new AmbiguousTransactionSubmissionError();
      });
      const durable = persistence();

      await expect(
        runBoundedCapabilityBootstrap({
          readActiveCapabilities,
          request: setup.request,
          submit,
          ...durable,
        }),
      ).rejects.toThrow(message);
      expect(submit).toHaveBeenCalledTimes(1);
    },
  );
});
