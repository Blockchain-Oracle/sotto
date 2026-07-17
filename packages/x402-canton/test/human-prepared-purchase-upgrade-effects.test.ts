import type { Identifier } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectHumanPreparedPurchaseStructure } from "../src/human-prepared-purchase-validation.js";
import type { HumanPurchasePrepareRequest } from "../src/human-purchase-command-types.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  humanPreparedPurchaseBytes,
  humanPreparedPurchaseCommandInputs,
  type HumanPreparedPurchaseFixture,
} from "./human-prepared-purchase.fixtures.js";
import { EXTERNAL_PURCHASE_CONTEXT } from "./transfer-factory-observation.fixtures.js";

function mutateContextFetch(
  prepared: HumanPreparedPurchaseFixture,
  contractId: string,
  mutate: (identifier: Identifier) => void,
): void {
  const candidate = prepared.transaction?.nodes.find(({ versionedNode }) => {
    if (versionedNode.oneofKind !== "v1") return false;
    const node = versionedNode.v1.nodeType;
    return node.oneofKind === "fetch" && node.fetch.contractId === contractId;
  });
  const wrapper = candidate?.versionedNode;
  if (wrapper?.oneofKind !== "v1") {
    throw new Error("test context fetch is absent");
  }
  const node = wrapper.v1.nodeType;
  if (node.oneofKind !== "fetch" || node.fetch.templateId === undefined) {
    throw new Error("test context fetch template is absent");
  }
  mutate(node.fetch.templateId);
}

function sourcePackage(
  request: HumanPurchasePrepareRequest,
  contractId: string,
): string {
  const packageId = request.disclosedContracts
    .find((disclosure) => disclosure.contractId === contractId)
    ?.templateId.split(":")[0];
  if (packageId === undefined) throw new Error("test source package is absent");
  return packageId;
}

describe("human prepared package-upgrade effects", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("accepts an authenticated historical input with selected transaction identity", async () => {
    const { intent, request } = await humanPreparedPurchaseCommandInputs();
    expect(
      sourcePackage(request, EXTERNAL_PURCHASE_CONTEXT.transferPreapproval),
    ).not.toBe(intent.packageSelection.packageIds[0]);

    expect(() =>
      inspectHumanPreparedPurchaseStructure(
        humanPreparedPurchaseBytes(intent, request),
        intent,
        request,
      ),
    ).not.toThrow();
  });

  it.each([
    [
      "historical package",
      (identifier: Identifier, sourcePackage: string) =>
        (identifier.packageId = sourcePackage),
    ],
    [
      "third package",
      (identifier: Identifier) => (identifier.packageId = "f".repeat(64)),
    ],
    [
      "wrong module",
      (identifier: Identifier) => (identifier.moduleName = "Wrong"),
    ],
    [
      "wrong entity",
      (identifier: Identifier) => (identifier.entityName = "Wrong"),
    ],
  ])("rejects a context fetch with %s", async (_name, mutate) => {
    const { intent, request } = await humanPreparedPurchaseCommandInputs();
    const historical = sourcePackage(
      request,
      EXTERNAL_PURCHASE_CONTEXT.transferPreapproval,
    );
    const bytes = humanPreparedPurchaseBytes(intent, request, (prepared) =>
      mutateContextFetch(
        prepared,
        EXTERNAL_PURCHASE_CONTEXT.transferPreapproval,
        (identifier) => mutate(identifier, historical),
      ),
    );

    expect(() =>
      inspectHumanPreparedPurchaseStructure(bytes, intent, request),
    ).toThrow(/prepared human root fetch identity does not match/u);
  });

  it.each([
    [
      "config",
      EXTERNAL_PURCHASE_CONTEXT.externalPartyConfigState,
      /prepared human root fetch identity does not match/u,
    ],
    [
      "featured right",
      EXTERNAL_PURCHASE_CONTEXT.featuredAppRight,
      /prepared human authenticated fetch identity does not match/u,
    ],
  ])("rejects a historical %s fetch", async (_name, contractId, error) => {
    const { intent, request } = await humanPreparedPurchaseCommandInputs();
    const bytes = humanPreparedPurchaseBytes(intent, request, (prepared) =>
      mutateContextFetch(prepared, contractId, (identifier) => {
        identifier.packageId = sourcePackage(request, contractId);
      }),
    );

    expect(() =>
      inspectHumanPreparedPurchaseStructure(bytes, intent, request),
    ).toThrow(error);
  });
});
