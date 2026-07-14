import { describe, expect, it } from "vitest";
import {
  buildBoundedPurchasePrepareRequest,
  createPreparedPurchaseObserver,
} from "../src/index.js";
import {
  MAX_PREPARE_RESPONSE_BYTES,
  MAX_PREPARED_EVENT_BLOB_BYTES,
  MAX_PREPARED_HOLDING_OUTPUTS,
  MAX_PREPARED_TRANSACTION_BYTES,
} from "../src/prepared-purchase-resource-envelope.js";
import {
  expectFactoryEffectRejection,
  factoryExercise,
  factoryRecordField,
} from "./prepared-purchase-factory-effects.fixtures.js";
import {
  preparedPurchaseBytes,
  type PreparedPurchaseFixture,
} from "./prepared-purchase.fixtures.js";
import { purchaseCommandInputs } from "./transfer-factory-observation.fixtures.js";

const preparedHash = Buffer.alloc(32, 7).toString("base64");

function response(
  transaction: Uint8Array,
  hashingDetails: string | null = null,
): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      preparedTransaction: Buffer.from(transaction).toString("base64"),
      preparedTransactionHash: preparedHash,
      hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
      hashingDetails,
      costEstimation: null,
    }),
  );
}

async function observationFixture(
  mutate?: (prepared: PreparedPurchaseFixture) => void,
) {
  const { intent, holdings, packageSelection, registry } =
    await purchaseCommandInputs();
  const request = buildBoundedPurchasePrepareRequest(
    intent,
    holdings,
    registry,
    packageSelection,
  );
  return {
    request,
    transaction: preparedPurchaseBytes(intent, request, mutate),
  };
}

function outputList(
  prepared: PreparedPurchaseFixture,
  output: "receiver" | "change",
) {
  if (output === "change") {
    return factoryRecordField(
      factoryExercise(prepared).exerciseResult,
      "senderChangeCids",
    );
  }
  const variant = factoryRecordField(
    factoryExercise(prepared).exerciseResult,
    "output",
  );
  if (variant.sum.oneofKind !== "variant") {
    throw new Error("missing completed output");
  }
  return factoryRecordField(variant.sum.variant.value, "receiverHoldingCids");
}

export function registerPreparedResourceLimitCases(): void {
  describe("integrated reviewed prepared resource limits", () => {
    it("accepts the exact prepare response byte cap", async () => {
      const { request, transaction } = await observationFixture();
      const empty = response(transaction, "");
      const padding = MAX_PREPARE_RESPONSE_BYTES - empty.byteLength;
      expect(padding).toBeGreaterThan(0);
      const exact = response(transaction, "x".repeat(padding));
      expect(exact).toHaveLength(MAX_PREPARE_RESPONSE_BYTES);

      await expect(
        createPreparedPurchaseObserver(async () => exact)(request),
      ).resolves.toMatchObject({ preparedTransactionHash: preparedHash });
    });

    it("rejects response and transaction bytes above their caps", async () => {
      const responseFixture = await observationFixture();
      await expect(
        createPreparedPurchaseObserver(
          async () => new Uint8Array(MAX_PREPARE_RESPONSE_BYTES + 1),
        )(responseFixture.request),
      ).rejects.toThrow(/response exceeds byte limit/iu);

      const transactionFixture = await observationFixture();
      await expect(
        createPreparedPurchaseObserver(async () =>
          response(new Uint8Array(MAX_PREPARED_TRANSACTION_BYTES + 1)),
        )(transactionFixture.request),
      ).rejects.toThrow(/prepared transaction exceeds byte limit/iu);
    });

    it("accepts an input event blob at cap and rejects plus one", async () => {
      const atCap = await observationFixture((prepared) => {
        prepared.metadata!.inputContracts[0]!.eventBlob = new Uint8Array(
          MAX_PREPARED_EVENT_BLOB_BYTES,
        );
      });
      await expect(
        createPreparedPurchaseObserver(async () => response(atCap.transaction))(
          atCap.request,
        ),
      ).resolves.toBeDefined();

      const over = await observationFixture((prepared) => {
        prepared.metadata!.inputContracts[0]!.eventBlob = new Uint8Array(
          MAX_PREPARED_EVENT_BLOB_BYTES + 1,
        );
      });
      await expect(
        createPreparedPurchaseObserver(async () => response(over.transaction))(
          over.request,
        ),
      ).rejects.toThrow(/event blob exceeds byte limit/iu);
    });

    it.each(["receiver", "change"] as const)(
      "rejects %s outputs above cap",
      async (output) => {
        await expectFactoryEffectRejection((prepared) => {
          const list = outputList(prepared, output);
          if (list.sum.oneofKind !== "list")
            throw new Error("missing output list");
          list.sum.list.elements = Array.from(
            { length: MAX_PREPARED_HOLDING_OUTPUTS + 1 },
            (_, index) => ({
              sum: { oneofKind: "contractId", contractId: `00output-${index}` },
            }),
          );
        });
      },
    );
  });
}
