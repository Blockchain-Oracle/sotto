import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildHumanPurchasePrepareRequest,
  createHumanTransferFactoryObserver,
} from "../src/index.js";
import { readHumanPurchaseHoldingObservation } from "../src/human-purchase-holding-observation.js";
import { readHumanTransferFactoryObservation } from "../src/human-transfer-factory-observation.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  humanTransferFactoryInputs,
  humanTransferFactoryResponse,
  humanTransferFactoryResponseBytes,
} from "./human-transfer-factory.fixtures.js";

describe("policy-free human purchase command security", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) });
  });

  afterEach(() => vi.useRealTimers());

  it("rejects structural clones without consuming authentic inputs", async () => {
    const { holdings, intent } = await humanTransferFactoryInputs();
    const registry = await createHumanTransferFactoryObserver(async () =>
      humanTransferFactoryResponseBytes(intent),
    )(intent, holdings);

    expect(() =>
      buildHumanPurchasePrepareRequest(
        structuredClone(intent),
        holdings,
        registry,
      ),
    ).toThrow(/intent is not authenticated/iu);
    expect(() =>
      buildHumanPurchasePrepareRequest(
        intent,
        structuredClone(holdings),
        registry,
      ),
    ).toThrow(/holding observation is not authenticated/iu);
    expect(() =>
      buildHumanPurchasePrepareRequest(
        intent,
        holdings,
        structuredClone(registry),
      ),
    ).toThrow(/TransferFactory observation is not authenticated/iu);
    expect(() =>
      readHumanPurchaseHoldingObservation(holdings, intent),
    ).not.toThrow();
    expect(() =>
      readHumanTransferFactoryObservation(registry, intent, holdings),
    ).not.toThrow();
    expect(() =>
      buildHumanPurchasePrepareRequest(intent, holdings, registry),
    ).not.toThrow();
  });

  it("rejects conflicting disclosures before any authority is claimed", async () => {
    const { holdings, intent } = await humanTransferFactoryInputs();
    const response = humanTransferFactoryResponse(intent);
    const conflict = {
      templateId: `${intent.packageSelection.packageIds[0]}:Splice.Amulet:Amulet`,
      contractId: "00human-a",
      createdEventBlob: Buffer.from("conflict").toString("base64"),
      synchronizerId: intent.challenge.synchronizerId,
    };
    Reflect.apply(
      Array.prototype.push,
      response.choiceContext.disclosedContracts,
      [conflict],
    );
    const registry = await createHumanTransferFactoryObserver(async () =>
      new TextEncoder().encode(JSON.stringify(response)),
    )(intent, holdings);

    expect(() =>
      buildHumanPurchasePrepareRequest(intent, holdings, registry),
    ).toThrow(/conflicting/iu);
    expect(() =>
      readHumanPurchaseHoldingObservation(holdings, intent),
    ).not.toThrow();
    expect(() =>
      readHumanTransferFactoryObservation(registry, intent, holdings),
    ).not.toThrow();

    const validRegistry = await createHumanTransferFactoryObserver(async () =>
      humanTransferFactoryResponseBytes(intent),
    )(intent, holdings);
    expect(() =>
      buildHumanPurchasePrepareRequest(intent, holdings, validRegistry),
    ).not.toThrow();
  });
});
