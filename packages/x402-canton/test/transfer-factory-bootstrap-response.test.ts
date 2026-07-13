import { describe, expect, it } from "vitest";
import { parseTransferFactoryBootstrapResponse } from "../src/transfer-factory-bootstrap-response.js";
import {
  factoryDisclosure,
  factoryResponse,
  purchaseExecutionInputs,
  responseBytes,
} from "./transfer-factory-observation.fixtures.js";

const choiceArgumentsDigest = `sha256:${"a".repeat(64)}` as const;

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
