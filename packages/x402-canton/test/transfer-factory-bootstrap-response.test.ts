import { describe, expect, it } from "vitest";
import { parseTransferFactoryBootstrapResponse } from "../src/transfer-factory-bootstrap-response.js";
import {
  factoryDisclosure,
  factoryResponse,
  purchaseExecutionInputs,
  responseBytes,
} from "./transfer-factory-observation.fixtures.js";

const choiceArgumentsDigest = `sha256:${"a".repeat(64)}` as const;
const liveFactoryTemplate =
  "a5b055492fb8f08b2e7bc0fc94da6da50c39c2e1d7f24cd5ea8db12fc87c1332:Splice.ExternalPartyAmuletRules:ExternalPartyAmuletRules";

describe("TransferFactory bootstrap response", () => {
  it("derives the factory only from its pinned disclosure", async () => {
    const { intent } = await purchaseExecutionInputs();
    const parsed = parseTransferFactoryBootstrapResponse(
      responseBytes(factoryResponse(intent)),
      {
        choiceArgumentsDigest,
        synchronizerId: intent.challenge.synchronizerId,
      },
    );

    expect(parsed).toMatchObject({
      choiceArgumentsDigest,
      factoryId: intent.tokenFactory.contractId,
      transferKind: "direct",
    });
  });

  it("pins the live factory creation template independently", async () => {
    const { intent } = await purchaseExecutionInputs();
    const disclosure = {
      ...factoryDisclosure(intent),
      templateId: liveFactoryTemplate,
    };
    expect(() =>
      parseTransferFactoryBootstrapResponse(
        responseBytes(
          factoryResponse(intent, {
            choiceContext: {
              choiceContextData: { values: {} },
              disclosedContracts: [disclosure],
            },
          }),
        ),
        {
          choiceArgumentsDigest,
          synchronizerId: intent.challenge.synchronizerId,
        },
      ),
    ).not.toThrow();
  });

  it("accepts only the all-null excluded debug envelope", async () => {
    const { intent } = await purchaseExecutionInputs();
    const disclosure = {
      ...factoryDisclosure(intent),
      debugCreatedAt: null,
      debugPackageName: null,
      debugPayload: null,
    };
    expect(() =>
      parseTransferFactoryBootstrapResponse(
        responseBytes(
          factoryResponse(intent, {
            choiceContext: {
              choiceContextData: { values: {} },
              disclosedContracts: [disclosure],
            },
          }),
        ),
        {
          choiceArgumentsDigest,
          synchronizerId: intent.challenge.synchronizerId,
        },
      ),
    ).not.toThrow();
    for (const mutation of [
      { debugPayload: { secret: true } },
      { debugCreatedAt: null, debugPackageName: null },
    ]) {
      expect(() =>
        parseTransferFactoryBootstrapResponse(
          responseBytes(
            factoryResponse(intent, {
              choiceContext: {
                choiceContextData: { values: {} },
                disclosedContracts: [
                  { ...factoryDisclosure(intent), ...mutation },
                ],
              },
            }),
          ),
          {
            choiceArgumentsDigest,
            synchronizerId: intent.challenge.synchronizerId,
          },
        ),
      ).toThrow("debug");
    }
  });

  it("rejects a response without a matching factory disclosure", async () => {
    const { intent } = await purchaseExecutionInputs();
    for (const disclosures of [
      [],
      [
        {
          ...factoryDisclosure(intent),
          contractId: "00other-contract",
        },
      ],
    ]) {
      expect(() =>
        parseTransferFactoryBootstrapResponse(
          responseBytes(
            factoryResponse(intent, {
              choiceContext: {
                choiceContextData: { values: {} },
                disclosedContracts: disclosures,
              },
            }),
          ),
          {
            choiceArgumentsDigest,
            synchronizerId: intent.challenge.synchronizerId,
          },
        ),
      ).toThrow("matching disclosure");
    }
  });

  it.each([
    ["direct", { transferKind: "offer" }],
    [
      "implementation",
      {
        disclosure: {
          templateId: "0".repeat(64) + ":Bad:Factory",
        },
      },
    ],
    [
      "synchronizer",
      {
        disclosure: { synchronizerId: "other-domain::1220sync" },
      },
    ],
  ])("rejects wrong %s", async (expected, mutation) => {
    const { intent } = await purchaseExecutionInputs();
    const disclosure = {
      ...factoryDisclosure(intent),
      ...((mutation as { disclosure?: object }).disclosure ?? {}),
    };
    const rootMutation = { ...mutation } as Record<string, unknown>;
    delete rootMutation.disclosure;
    const response = factoryResponse(intent, {
      ...rootMutation,
      choiceContext: {
        choiceContextData: { values: {} },
        disclosedContracts: [disclosure],
      },
    });

    expect(() =>
      parseTransferFactoryBootstrapResponse(responseBytes(response), {
        choiceArgumentsDigest,
        synchronizerId: intent.challenge.synchronizerId,
      }),
    ).toThrow(expected);
  });
});
