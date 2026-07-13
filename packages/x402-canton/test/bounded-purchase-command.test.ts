import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildBoundedPurchasePrepareRequest } from "../src/index.js";
import { readPurchaseHoldingObservation } from "../src/purchase-holding-observation.js";
import { readTransferFactoryObservation } from "../src/transfer-factory-observation.js";
import { purchaseCommandInputs } from "./transfer-factory-observation.fixtures.js";

describe("bounded Purchase prepare request", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:01.000Z") });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds exactly one agent-authorized Purchase root", async () => {
    const { intent, holdings, registry } = await purchaseCommandInputs();
    const holdingState = readPurchaseHoldingObservation(holdings, intent);
    const registryState = readTransferFactoryObservation(
      registry,
      intent,
      holdings,
    );

    const request = buildBoundedPurchasePrepareRequest(
      intent,
      holdings,
      registry,
    );

    expect(Object.keys(request).sort()).toEqual([
      "actAs",
      "commandId",
      "commands",
      "disclosedContracts",
      "hashingSchemeVersion",
      "maxRecordTime",
      "packageIdSelectionPreference",
      "prefetchContractKeys",
      "readAs",
      "synchronizerId",
      "verboseHashing",
    ]);
    expect(request.commandId).toBe(
      `sotto-purchase-v2-${intent.purchaseCommitment.slice(7)}`,
    );
    expect(request.actAs).toEqual([intent.capability.agentParty]);
    expect(request.readAs).toEqual([]);
    expect(request.commands).toEqual([
      {
        ExerciseCommand: {
          templateId: intent.capability.templateId,
          contractId: intent.capability.contractId,
          choice: "Purchase",
          choiceArgument: {
            attemptId: intent.attemptId,
            purchaseCommitment: intent.purchaseCommitment,
            requestCommitment: intent.request.requestCommitment,
            challengeId: intent.challenge.challengeId,
            resourceHash: intent.capability.resourceHash,
            recipient: intent.challenge.recipientParty,
            amount: "0.2500000000",
            requestedAt: intent.challenge.requestedAt,
            executeBefore: intent.challenge.executeBefore,
            inputHoldingCids: holdingState.contractIds,
            extraArgs: {
              context: registryState.choiceContextData,
              meta: { values: {} },
            },
            expectedRevision: intent.capability.expectedRevision,
          },
        },
      },
    ]);
    expect(request.synchronizerId).toBe(intent.challenge.synchronizerId);
    expect(request.maxRecordTime).toBe(intent.challenge.executeBefore);
    expect(request.hashingSchemeVersion).toBe("HASHING_SCHEME_VERSION_V2");
    expect(request.packageIdSelectionPreference).toEqual([]);
    expect(request.prefetchContractKeys).toEqual([]);
    expect(request.verboseHashing).toBe(false);
  });

  it("merges and ordinally sorts authenticated disclosures", async () => {
    const { intent, holdings, registry } = await purchaseCommandInputs();

    const request = buildBoundedPurchasePrepareRequest(
      intent,
      holdings,
      registry,
    );

    expect(
      request.disclosedContracts.map(({ contractId }) => contractId),
    ).toEqual(["00holding-a", intent.tokenFactory.contractId]);
  });

  it("omits every unsupported or caller-controlled prepare field", async () => {
    const { intent, holdings, registry } = await purchaseCommandInputs();
    const request = buildBoundedPurchasePrepareRequest(
      intent,
      holdings,
      registry,
    );
    const serialized = JSON.stringify(request);

    for (const key of [
      "workflowId",
      "userId",
      "minLedgerTime",
      "estimateTrafficCost",
      "tapsMaxPasses",
    ]) {
      expect(request).not.toHaveProperty(key);
    }
    expect(serialized).not.toContain("authorization-7");
    expect(serialized).not.toContain("provider.example");
    expect(request.commands).toHaveLength(1);
  });

  it("rejects structural clones without consuming authentic inputs", async () => {
    const { intent, holdings, registry } = await purchaseCommandInputs();

    expect(() =>
      buildBoundedPurchasePrepareRequest(
        structuredClone(intent),
        holdings,
        registry,
      ),
    ).toThrow("not authenticated");
    expect(() =>
      buildBoundedPurchasePrepareRequest(intent, { ...holdings }, registry),
    ).toThrow("not authenticated");
    expect(() =>
      buildBoundedPurchasePrepareRequest(intent, holdings, { ...registry }),
    ).toThrow("not authenticated");
    expect(() =>
      buildBoundedPurchasePrepareRequest(intent, holdings, registry),
    ).not.toThrow();
  });

  it("deep-freezes the request and consumes both observations once", async () => {
    const { intent, holdings, registry } = await purchaseCommandInputs();
    const request = buildBoundedPurchasePrepareRequest(
      intent,
      holdings,
      registry,
    );

    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.commands)).toBe(true);
    expect(Object.isFrozen(request.commands[0]!.ExerciseCommand)).toBe(true);
    expect(Object.isFrozen(request.disclosedContracts)).toBe(true);
    expect(() =>
      buildBoundedPurchasePrepareRequest(intent, holdings, registry),
    ).toThrow("already claimed");
  });
});
