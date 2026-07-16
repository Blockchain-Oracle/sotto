import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildHumanPurchasePrepareRequest,
  createHumanPurchaseHoldingObserver,
  createHumanTransferFactoryObserver,
  type HumanPurchaseLedgerIntent,
} from "../src/index.js";
import {
  claimHumanPurchasePrepareRequest,
  readHumanPurchasePrepareRequest,
} from "../src/human-purchase-command-state.js";
import { readHumanPurchaseHoldingObservation } from "../src/human-purchase-holding-observation.js";
import { readHumanTransferFactoryObservation } from "../src/human-transfer-factory-observation.js";
import { claimHumanTransferFactoryObservation } from "../src/human-transfer-factory-state.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  authenticatedHumanPurchaseIntentWithWindow,
  humanHoldingEntry,
  humanHoldingReader,
} from "./human-purchase-holding.fixtures.js";
import {
  humanTransferFactoryInputs,
  humanTransferFactoryResponse,
  humanTransferFactoryResponseBytes,
} from "./human-transfer-factory.fixtures.js";

async function observationsFor(intent: HumanPurchaseLedgerIntent) {
  const holdings = await createHumanPurchaseHoldingObserver(
    humanHoldingReader([
      humanHoldingEntry("00human-b", "0.1500000000"),
      humanHoldingEntry("00human-a", "0.2000000000"),
    ]),
  )(intent);
  const registry = await createHumanTransferFactoryObserver(async () =>
    humanTransferFactoryResponseBytes(intent),
  )(intent, holdings);
  return { holdings, registry };
}

describe("policy-free human command authority", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) });
  });
  afterEach(() => vi.useRealTimers());

  it("claims the aggregate command authority exactly once", async () => {
    const { holdings, intent } = await humanTransferFactoryInputs();
    const registry = await createHumanTransferFactoryObserver(async () =>
      humanTransferFactoryResponseBytes(intent),
    )(intent, holdings);
    buildHumanPurchasePrepareRequest(intent, holdings, registry);
    const fresh = await observationsFor(intent);

    expect(() =>
      buildHumanPurchasePrepareRequest(intent, fresh.holdings, fresh.registry),
    ).toThrow(/command authority/iu);
    expect(() =>
      readHumanPurchaseHoldingObservation(fresh.holdings, intent),
    ).not.toThrow();
    expect(() =>
      readHumanTransferFactoryObservation(
        fresh.registry,
        intent,
        fresh.holdings,
      ),
    ).not.toThrow();
  });

  it("does not consume command or holding authority after registry replay", async () => {
    const { holdings, intent } = await humanTransferFactoryInputs();
    const registry = await createHumanTransferFactoryObserver(async () =>
      humanTransferFactoryResponseBytes(intent),
    )(intent, holdings);
    claimHumanTransferFactoryObservation(registry, intent, holdings);

    expect(() =>
      buildHumanPurchasePrepareRequest(intent, holdings, registry),
    ).toThrow(/already claimed/iu);
    expect(() =>
      readHumanPurchaseHoldingObservation(holdings, intent),
    ).not.toThrow();
    const replacement = await createHumanTransferFactoryObserver(async () =>
      humanTransferFactoryResponseBytes(intent),
    )(intent, holdings);
    expect(() =>
      buildHumanPurchasePrepareRequest(intent, holdings, replacement),
    ).not.toThrow();
  });

  it("rejects stale retained identity authority before command inputs", async () => {
    const { holdings, intent } = await humanTransferFactoryInputs();
    const registry = await createHumanTransferFactoryObserver(async () =>
      humanTransferFactoryResponseBytes(intent),
    )(intent, holdings);
    vi.advanceTimersByTime(60_001);
    expect(() =>
      buildHumanPurchasePrepareRequest(intent, holdings, registry),
    ).toThrow(/payer identity.*stale/iu);
  });

  it("supports participant-local factory resolution", async () => {
    const { holdings, intent } = await humanTransferFactoryInputs();
    const response = humanTransferFactoryResponse(intent);
    response.choiceContext.disclosedContracts = [];
    const registry = await createHumanTransferFactoryObserver(async () =>
      new TextEncoder().encode(JSON.stringify(response)),
    )(intent, holdings);
    const request = buildHumanPurchasePrepareRequest(
      intent,
      holdings,
      registry,
    );
    expect(
      request.disclosedContracts.map(({ contractId }) => contractId),
    ).toEqual(["00human-a", "00human-b"]);
  });

  it.each([
    [1_000, true],
    [1_001, false],
  ])(
    "claims atomically at a %i millisecond delay",
    async (elapsed, accepted) => {
      const intent = await authenticatedHumanPurchaseIntentWithWindow(121);
      const { holdings, registry } = await observationsFor(intent);
      vi.setSystemTime(Date.now() + elapsed);
      if (accepted) {
        expect(() =>
          buildHumanPurchasePrepareRequest(intent, holdings, registry),
        ).not.toThrow();
      } else {
        expect(() =>
          buildHumanPurchasePrepareRequest(intent, holdings, registry),
        ).toThrow(/signing reserve/iu);
        expect(() =>
          readHumanPurchaseHoldingObservation(holdings, intent),
        ).not.toThrow();
        expect(() =>
          readHumanTransferFactoryObservation(registry, intent, holdings),
        ).not.toThrow();
      }
    },
  );

  it("authenticates and claims the prepare request once", async () => {
    const { holdings, intent } = await humanTransferFactoryInputs();
    const registry = await createHumanTransferFactoryObserver(async () =>
      humanTransferFactoryResponseBytes(intent),
    )(intent, holdings);
    const request = buildHumanPurchasePrepareRequest(
      intent,
      holdings,
      registry,
    );
    expect(readHumanPurchasePrepareRequest(request)).toEqual({
      intent,
      request,
    });
    expect(() =>
      readHumanPurchasePrepareRequest(structuredClone(request)),
    ).toThrow(/not authenticated/iu);
    expect(claimHumanPurchasePrepareRequest(request).request).toBe(request);
    expect(() => readHumanPurchasePrepareRequest(request)).toThrow(
      /already claimed/iu,
    );
  });

  it("rechecks payer and package freshness before transport", async () => {
    const { holdings, intent } = await humanTransferFactoryInputs();
    const registry = await createHumanTransferFactoryObserver(async () =>
      humanTransferFactoryResponseBytes(intent),
    )(intent, holdings);
    const request = buildHumanPurchasePrepareRequest(
      intent,
      holdings,
      registry,
    );
    vi.advanceTimersByTime(60_001);

    expect(() => readHumanPurchasePrepareRequest(request)).toThrow(
      /payer identity.*stale|package preference.*stale/iu,
    );
  });
});
