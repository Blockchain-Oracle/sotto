import type { Identifier } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectHumanPreparedPurchaseStructure } from "../src/human-prepared-purchase-validation.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  humanPreparedPurchaseBytes,
  humanPreparedPurchaseCommandInputs,
  humanPreparedPurchaseCommandInputsWithUnusedDisclosures,
  rootOnlyHumanPreparedPurchaseBytes,
} from "./human-prepared-purchase.fixtures.js";
import { EXTERNAL_PURCHASE_CONTEXT } from "./transfer-factory-observation.fixtures.js";

describe("human prepared transfer effects", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("accepts the complete payer-authorized Token transfer graph", async () => {
    const { intent, request } = await humanPreparedPurchaseCommandInputs();
    const preapproval = request.disclosedContracts.find(
      ({ contractId }) =>
        contractId === EXTERNAL_PURCHASE_CONTEXT.transferPreapproval,
    );
    expect(preapproval?.templateId.split(":")[0]).not.toBe(
      intent.packageSelection.packageIds[0],
    );
    const shape = inspectHumanPreparedPurchaseStructure(
      humanPreparedPurchaseBytes(intent, request),
      intent,
      request,
    );

    expect(shape.nodeCount).toBe(14);
    expect(shape.inputContractCount).toBe(5);
    expect(shape.nodeKinds).toEqual({ exercise: 5, create: 2, fetch: 7 });
  });

  it("rejects the legacy root-only transaction", async () => {
    const { intent, request } = await humanPreparedPurchaseCommandInputs();

    expect(() =>
      inspectHumanPreparedPurchaseStructure(
        rootOnlyHumanPreparedPurchaseBytes(intent, request),
        intent,
        request,
      ),
    ).toThrow(/prepared.*effect/iu);
  });

  it("accepts authenticated registry disclosures omitted when unused", async () => {
    const { intent, request } =
      await humanPreparedPurchaseCommandInputsWithUnusedDisclosures();

    expect(() =>
      inspectHumanPreparedPurchaseStructure(
        humanPreparedPurchaseBytes(intent, request),
        intent,
        request,
      ),
    ).not.toThrow();
  });

  it("rejects a changed blob for a disclosure used by the transaction", async () => {
    const { intent, request } = await humanPreparedPurchaseCommandInputs();
    const holdingId =
      request.commands[0].ExerciseCommand.choiceArgument.transfer
        .inputHoldingCids[0];
    const bytes = humanPreparedPurchaseBytes(intent, request, (prepared) => {
      const input = prepared.metadata?.inputContracts.find(
        (candidate) =>
          candidate.contract.oneofKind === "v1" &&
          candidate.contract.v1.contractId === holdingId,
      );
      if (input === undefined) throw new Error("test holding input is absent");
      input.eventBlob = new TextEncoder().encode("changed-used-disclosure");
    });

    expect(() =>
      inspectHumanPreparedPurchaseStructure(bytes, intent, request),
    ).toThrow(/prepared human disclosed metadata input does not match/u);
  });

  it("accepts the topology-selected package for the factory argument record", async () => {
    const { intent, request } = await humanPreparedPurchaseCommandInputs();
    const creationPackage =
      intent.tokenFactory.creationTemplateId.split(":")[0];
    expect(intent.packageSelection.packageIds[0]).not.toBe(creationPackage);

    expect(() =>
      inspectHumanPreparedPurchaseStructure(
        humanPreparedPurchaseBytes(intent, request),
        intent,
        request,
      ),
    ).not.toThrow();
  });

  it("rejects the historical package for the enriched factory argument", async () => {
    const { intent, request } = await humanPreparedPurchaseCommandInputs();
    const bytes = humanPreparedPurchaseBytes(intent, request, (prepared) => {
      const input = prepared.metadata?.inputContracts.find(
        (candidate) =>
          candidate.contract.oneofKind === "v1" &&
          candidate.contract.v1.contractId === intent.tokenFactory.contractId,
      );
      const argument =
        input?.contract.oneofKind === "v1"
          ? input.contract.v1.argument
          : undefined;
      const recordId =
        argument?.sum.oneofKind === "record"
          ? argument.sum.record.recordId
          : undefined;
      if (recordId === undefined) {
        throw new Error("test factory argument record is absent");
      }
      recordId.packageId =
        intent.tokenFactory.creationTemplateId.split(":")[0]!;
    });

    expect(() =>
      inspectHumanPreparedPurchaseStructure(bytes, intent, request),
    ).toThrow(/prepared human metadata TransferFactory.*identifier/u);
  });

  it.each([
    ["package", (id: Identifier) => (id.packageId = "f".repeat(64))],
    ["module", (id: Identifier) => (id.moduleName = "Wrong")],
    ["entity", (id: Identifier) => (id.entityName = "Wrong")],
  ])(
    "rejects a non-authoritative factory argument %s",
    async (_name, mutate) => {
      const { intent, request } = await humanPreparedPurchaseCommandInputs();
      const bytes = humanPreparedPurchaseBytes(intent, request, (prepared) => {
        const input = prepared.metadata?.inputContracts.find(
          (candidate) =>
            candidate.contract.oneofKind === "v1" &&
            candidate.contract.v1.contractId === intent.tokenFactory.contractId,
        );
        const argument =
          input?.contract.oneofKind === "v1"
            ? input.contract.v1.argument
            : undefined;
        const recordId =
          argument?.sum.oneofKind === "record"
            ? argument.sum.record.recordId
            : undefined;
        if (recordId === undefined) {
          throw new Error("test factory argument record is absent");
        }
        mutate(recordId);
      });

      expect(() =>
        inspectHumanPreparedPurchaseStructure(bytes, intent, request),
      ).toThrow(/prepared human metadata TransferFactory.*identifier/u);
    },
  );
});
