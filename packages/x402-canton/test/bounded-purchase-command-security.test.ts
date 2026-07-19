import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBoundedPurchasePrepareRequest,
  createTransferFactoryObserver,
} from "../src/index.js";
import {
  claimPurchaseHoldingObservation,
  readPurchaseHoldingObservation,
} from "../src/purchase-holding-observation.js";
import {
  claimTransferFactoryObservation,
  readTransferFactoryObservation,
} from "../src/transfer-factory-observation.js";
import {
  factoryDisclosure,
  factoryResponse,
  purchaseCommandInputs,
  purchaseExecutionInputs,
  responseBytes,
} from "./transfer-factory-observation.fixtures.js";
import { registerCommandPreferenceSecurityCases } from "./bounded-purchase-command-preference-security.cases.js";

registerCommandPreferenceSecurityCases();

describe("bounded Purchase command security", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:01.000Z") });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces only byte-identical disclosure duplicates", async () => {
    const { intent, holdings, packageSelection } =
      await purchaseExecutionInputs();
    const holding = readPurchaseHoldingObservation(holdings, intent);
    const registry = await createTransferFactoryObserver(async () =>
      responseBytes(
        factoryResponse(intent, {
          choiceContext: {
            choiceContextData: { values: {} },
            disclosedContracts: [
              holding.disclosedContracts[0],
              factoryDisclosure(intent),
            ],
          },
        }),
      ),
    )(intent, holdings);

    const request = buildBoundedPurchasePrepareRequest(
      intent,
      holdings,
      registry,
      packageSelection,
    );
    expect(request.disclosedContracts).toHaveLength(2);
    expect(
      request.disclosedContracts.filter(
        ({ contractId }) => contractId === holding.contractIds[0],
      ),
    ).toHaveLength(1);
  });

  it("rejects conflicting disclosure duplicates before claiming either input", async () => {
    const { intent, holdings, packageSelection } =
      await purchaseExecutionInputs();
    const holding = readPurchaseHoldingObservation(holdings, intent);
    const conflict = {
      ...holding.disclosedContracts[0]!,
      createdEventBlob: Buffer.from("conflict").toString("base64"),
    };
    const registry = await createTransferFactoryObserver(async () =>
      responseBytes(
        factoryResponse(intent, {
          choiceContext: {
            choiceContextData: { values: {} },
            disclosedContracts: [conflict],
          },
        }),
      ),
    )(intent, holdings);

    expect(() =>
      buildBoundedPurchasePrepareRequest(
        intent,
        holdings,
        registry,
        packageSelection,
      ),
    ).toThrow("conflicting");
    expect(() =>
      readPurchaseHoldingObservation(holdings, intent),
    ).not.toThrow();
    expect(() =>
      readTransferFactoryObservation(registry, intent, holdings),
    ).not.toThrow();
  });

  it("supports the official zero-registry-disclosure response", async () => {
    const { intent, holdings, packageSelection } =
      await purchaseExecutionInputs();
    const registry = await createTransferFactoryObserver(async () =>
      responseBytes(
        factoryResponse(intent, {
          choiceContext: {
            choiceContextData: { values: {} },
            disclosedContracts: [],
          },
        }),
      ),
    )(intent, holdings);

    expect(
      buildBoundedPurchasePrepareRequest(
        intent,
        holdings,
        registry,
        packageSelection,
      ).disclosedContracts,
    ).toHaveLength(1);
  });

  it("uses byte-ordinal disclosure ordering", async () => {
    const { intent, holdings, packageSelection } =
      await purchaseExecutionInputs("00holding-ä");
    const registry = await createTransferFactoryObserver(async () =>
      responseBytes(
        factoryResponse(intent, {
          choiceContext: {
            choiceContextData: { values: {} },
            disclosedContracts: [
              {
                templateId: `${"0".repeat(64)}:Example.Context:Reference`,
                contractId: "00holding-z",
                createdEventBlob: Buffer.from("context").toString("base64"),
                synchronizerId: intent.challenge.synchronizerId,
              },
            ],
          },
        }),
      ),
    )(intent, holdings);

    expect(
      buildBoundedPurchasePrepareRequest(
        intent,
        holdings,
        registry,
        packageSelection,
      ).disclosedContracts.map(({ contractId }) => contractId),
    ).toEqual(["00holding-z", "00holding-ä"]);
  });

  it("keeps command identity stable across fresh one-use observations", async () => {
    const first = await purchaseCommandInputs();
    const second = await purchaseCommandInputs();

    const firstRequest = buildBoundedPurchasePrepareRequest(
      first.intent,
      first.holdings,
      first.registry,
      first.packageSelection,
    );
    const secondRequest = buildBoundedPurchasePrepareRequest(
      second.intent,
      second.holdings,
      second.registry,
      second.packageSelection,
    );

    expect(secondRequest).toEqual(firstRequest);
  });

  it("preflights claimed handles without consuming the other handle", async () => {
    const first = await purchaseCommandInputs();
    claimTransferFactoryObservation(
      first.registry,
      first.intent,
      first.holdings,
    );
    expect(() =>
      buildBoundedPurchasePrepareRequest(
        first.intent,
        first.holdings,
        first.registry,
        first.packageSelection,
      ),
    ).toThrow("already claimed");
    expect(() =>
      claimPurchaseHoldingObservation(first.holdings, first.intent),
    ).not.toThrow();

    const second = await purchaseCommandInputs();
    claimPurchaseHoldingObservation(second.holdings, second.intent);
    expect(() =>
      buildBoundedPurchasePrepareRequest(
        second.intent,
        second.holdings,
        second.registry,
        second.packageSelection,
      ),
    ).toThrow("already claimed");
  });
});
