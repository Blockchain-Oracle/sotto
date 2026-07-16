import type { Create } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBoundedPurchasePrepareRequest,
  createPreparedPurchaseObserver,
  createTransferFactoryObserver,
} from "../src/index.js";
import {
  expectFactoryEffectRejection,
  factoryRecordField,
  replacePreparedScalar,
} from "./prepared-purchase-factory-effects.fixtures.js";
import {
  preparedPurchaseBytes,
  type PreparedPurchaseFixture,
} from "./prepared-purchase.fixtures.js";
import {
  externalFactoryResponse,
  purchaseExecutionInputs,
  responseBytes,
} from "./transfer-factory-observation.fixtures.js";

const preparedHash = Buffer.alloc(32, 7).toString("base64");

function response(transaction: Uint8Array): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      preparedTransaction: Buffer.from(transaction).toString("base64"),
      preparedTransactionHash: preparedHash,
      hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
      hashingDetails: null,
      costEstimation: null,
    }),
  );
}

function metadataInput(
  prepared: PreparedPurchaseFixture,
  contractId: string,
): Create {
  const input = prepared.metadata!.inputContracts.find(
    (candidate) =>
      candidate.contract.oneofKind === "v1" &&
      candidate.contract.v1.contractId === contractId,
  );
  if (input?.contract.oneofKind !== "v1") {
    throw new Error(`missing metadata input ${contractId}`);
  }
  return input.contract.v1;
}

describe("prepared Purchase metadata input linkage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:02.000Z") });
  });

  afterEach(() => vi.useRealTimers());

  it("rejects changed source capability allowance", async () => {
    await expectFactoryEffectRejection((prepared) => {
      replacePreparedScalar(
        factoryRecordField(
          metadataInput(prepared, "00capability7").argument,
          "remainingAllowance",
        ),
        "numeric",
        "0.9999999999",
      );
    });
  });

  it("rejects changed metadata factory package linkage", async () => {
    await expectFactoryEffectRejection((prepared) => {
      metadataInput(prepared, "00tokenfactory7").templateId!.packageId = "x";
    });
  });

  it("rejects changed metadata factory authority", async () => {
    await expectFactoryEffectRejection((prepared) => {
      metadataInput(prepared, "00tokenfactory7").signatories = [];
    });
  });

  it("accepts authenticated registry disclosures omitted when unused", async () => {
    const { intent, holdings, packageSelection } =
      await purchaseExecutionInputs();
    const base = externalFactoryResponse(intent);
    const registry = await createTransferFactoryObserver(async () =>
      responseBytes({
        ...base,
        choiceContext: {
          ...base.choiceContext,
          disclosedContracts: [
            ...base.choiceContext.disclosedContracts,
            {
              contractId: "00round",
              createdEventBlob: Buffer.from("round").toString("base64"),
              synchronizerId: intent.challenge.synchronizerId,
              templateId: `${"a".repeat(64)}:Splice.Round:OpenMiningRound`,
            },
            {
              contractId: "00rules",
              createdEventBlob: Buffer.from("rules").toString("base64"),
              synchronizerId: intent.challenge.synchronizerId,
              templateId: `${"b".repeat(64)}:Splice.AmuletRules:AmuletRules`,
            },
          ],
        },
      }),
    )(intent, holdings);
    const request = buildBoundedPurchasePrepareRequest(
      intent,
      holdings,
      registry,
      packageSelection,
    );

    await expect(
      createPreparedPurchaseObserver(async () =>
        response(preparedPurchaseBytes(intent, request)),
      )(request),
    ).resolves.toBeDefined();
  });

  it("rejects unknown metadata inputs and changed disclosed blobs", async () => {
    await expectFactoryEffectRejection((prepared) => {
      const input = structuredClone(prepared.metadata!.inputContracts[1]!);
      if (input.contract.oneofKind !== "v1") throw new Error("missing input");
      input.contract.v1.contractId = "00unknown";
      prepared.metadata!.inputContracts.push(input);
    });
    await expectFactoryEffectRejection((prepared) => {
      prepared.metadata!.inputContracts[1]!.eventBlob = new Uint8Array([9]);
    });
  });
});
