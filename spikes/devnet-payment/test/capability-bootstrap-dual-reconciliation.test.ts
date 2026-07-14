import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CapabilityBootstrapCompletion } from "../src/capability-bootstrap-completion.js";
import {
  DefinitiveCapabilityBootstrapRejectionError,
  runBoundedCapabilityBootstrap,
} from "../src/capability-bootstrap-runner.js";
import { AmbiguousTransactionSubmissionError } from "../src/five-north-transaction-submit.js";
import { bootstrapRequest } from "./capability-bootstrap-completion.fixtures.js";

function activeCapability(request: ReturnType<typeof bootstrapRequest>) {
  const create = request.commands[0]!.CreateCommand;
  return {
    contractEntry: {
      JsActiveContract: {
        createdEvent: {
          contractId: "00capability",
          createArgument: create.createArguments,
          observers: [create.createArguments.agent],
          packageName: "sotto-control",
          signatories: [create.createArguments.payer],
          templateId: create.templateId,
        },
        synchronizerId: request.synchronizerId,
      },
    },
  };
}

function submissionResponse(request: ReturnType<typeof bootstrapRequest>) {
  const active = activeCapability(request);
  const event = active.contractEntry.JsActiveContract.createdEvent;
  return {
    transaction: {
      commandId: request.commandId,
      events: [{ CreatedEvent: event }],
      offset: 42,
      synchronizerId: request.synchronizerId,
      updateId: `1220${"b".repeat(64)}`,
    },
  };
}

function scenario(
  completion: CapabilityBootstrapCompletion,
  activeAfter: "empty" | "matching",
  response: "ambiguous" | "success" = "ambiguous",
) {
  const request = bootstrapRequest();
  const reconciliationOrder: string[] = [];
  const readCompletion = vi.fn(async () => {
    reconciliationOrder.push("completion");
    return completion;
  });
  const submit = vi.fn(async () => {
    if (response === "ambiguous") {
      throw new AmbiguousTransactionSubmissionError();
    }
    return submissionResponse(request);
  });
  let activeReads = 0;
  const readActiveCapabilities = vi.fn(async () => {
    activeReads += 1;
    if (activeReads === 1) return [];
    reconciliationOrder.push("acs");
    return activeAfter === "matching" ? [activeCapability(request)] : [];
  });
  const result = runBoundedCapabilityBootstrap({
    persistCompletionCursor: vi.fn(async () => undefined),
    persistIntent: vi.fn(async () => undefined),
    persistSubmissionStarted: vi.fn(async () => undefined),
    readActiveCapabilities,
    readCompletion,
    readLedgerEndOffset: vi.fn(async () => 41),
    request,
    submit,
  });
  return { readCompletion, reconciliationOrder, request, result, submit };
}

describe("capability bootstrap dual reconciliation", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-13T19:30:00.000Z") });
  });

  it("rejects an ACS match when complete history has no command completion", async () => {
    const setup = scenario(
      {
        classification: "ABSENT_COMPLETE",
        completionOffset: 42,
      },
      "matching",
      "success",
    );

    await expect(setup.result).rejects.toThrow(/completion.*inconsistent/iu);
    expect(setup.readCompletion).toHaveBeenCalledWith(41, setup.request);
  });

  it("accepts only successful completion plus one exact ACS match", async () => {
    const setup = scenario(
      {
        classification: "SUCCEEDED",
        completionOffset: 42,
        updateId: `1220${"b".repeat(64)}`,
      },
      "matching",
    );

    await expect(setup.result).resolves.toMatchObject({
      contractId: "00capability",
      offset: 42,
      outcome: "reconciled-after-ambiguous",
      updateId: `1220${"b".repeat(64)}`,
    });
  });

  it("captures completion through its end before the terminal ACS snapshot", async () => {
    const setup = scenario(
      {
        classification: "SUCCEEDED",
        completionOffset: 42,
        updateId: `1220${"b".repeat(64)}`,
      },
      "matching",
    );

    await setup.result;
    expect(setup.reconciliationOrder).toEqual(["completion", "acs"]);
  });

  it("returns a typed rejection only for rejected completion plus empty ACS", async () => {
    const setup = scenario(
      { classification: "REJECTED", completionOffset: 42, statusCode: 7 },
      "empty",
    );

    const error = await setup.result.catch((candidate: unknown) => candidate);
    expect(error).toBeInstanceOf(DefinitiveCapabilityBootstrapRejectionError);
    expect(error).toMatchObject({ completionOffset: 42, statusCode: 7 });
  });

  it("keeps complete absence plus empty ACS unresolved", async () => {
    const setup = scenario(
      { classification: "ABSENT_COMPLETE", completionOffset: 42 },
      "empty",
    );

    await expect(setup.result).rejects.toThrow(/unresolved/iu);
    expect(setup.submit).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      { classification: "SUCCEEDED", completionOffset: 42, updateId: "update" },
      "empty",
      /successful completion.*no exact/iu,
    ],
    [
      { classification: "REJECTED", completionOffset: 42, statusCode: 7 },
      "matching",
      /completion.*inconsistent/iu,
    ],
  ] as const)(
    "rejects contradictory completion and ACS evidence",
    async (completion, activeAfter, message) => {
      await expect(scenario(completion, activeAfter).result).rejects.toThrow(
        message,
      );
    },
  );

  it("rejects disagreement between response and successful completion", async () => {
    const setup = scenario(
      { classification: "SUCCEEDED", completionOffset: 43, updateId: "other" },
      "matching",
      "success",
    );

    await expect(setup.result).rejects.toThrow(/response.*inconsistent/iu);
  });
});
