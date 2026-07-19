import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBoundedPurchasePrepareRequest,
  createPreparedPurchaseObserver,
} from "../src/index.js";
import { preparedPurchaseBytes } from "./prepared-purchase.fixtures.js";
import { purchaseCommandInputs } from "./transfer-factory-observation.fixtures.js";
import type { PreparedPurchaseFixture } from "./prepared-purchase.fixtures.js";

const preparedHash = Buffer.alloc(32, 7).toString("base64");

function exerciseChildren(
  prepared: PreparedPurchaseFixture,
  nodeId: string,
): string[] {
  const wrapper = prepared.transaction!.nodes.find(
    (node) => node.nodeId === nodeId,
  )?.versionedNode;
  if (
    wrapper?.oneofKind !== "v1" ||
    wrapper.v1.nodeType.oneofKind !== "exercise"
  ) {
    throw new Error(`missing exercise ${nodeId}`);
  }
  return wrapper.v1.nodeType.exercise.children;
}

function moveChild(
  prepared: PreparedPurchaseFixture,
  childId: string,
  from: string,
  to: string,
): void {
  const source = exerciseChildren(prepared, from);
  const index = source.indexOf(childId);
  if (index < 0) throw new Error(`missing child ${childId}`);
  source.splice(index, 1);
  exerciseChildren(prepared, to).push(childId);
}

function removeChild(
  prepared: PreparedPurchaseFixture,
  childId: string,
  parentId: string,
): void {
  const children = exerciseChildren(prepared, parentId);
  const index = children.indexOf(childId);
  if (index < 0) throw new Error(`missing child ${childId}`);
  children.splice(index, 1);
  prepared.transaction!.nodes = prepared.transaction!.nodes.filter(
    ({ nodeId }) => nodeId !== childId,
  );
}

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

export function registerPreparedFetchEffectCases(): void {
  describe("prepared authenticated fetch effects", () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date("2026-07-13T10:00:02.000Z") });
    });

    afterEach(() => vi.useRealTimers());

    it("accepts selected-package preapproval context reads", async () => {
      const { intent, holdings, packageSelection, registry } =
        await purchaseCommandInputs();
      const request = buildBoundedPurchasePrepareRequest(
        intent,
        holdings,
        registry,
        packageSelection,
      );
      const selectedPackage = intent.packageSelection.references.find(
        ({ packageName }) => packageName === "splice-amulet",
      )?.packageId;
      if (selectedPackage === undefined) throw new Error("package is absent");
      const transaction = preparedPurchaseBytes(intent, request, (prepared) => {
        for (const nodeId of ["109", "110"]) {
          const wrapper = prepared.transaction!.nodes.find(
            (node) => node.nodeId === nodeId,
          )?.versionedNode;
          if (
            wrapper?.oneofKind !== "v1" ||
            wrapper.v1.nodeType.oneofKind !== "fetch"
          ) {
            throw new Error(`context fetch ${nodeId} is absent`);
          }
          wrapper.v1.nodeType.fetch.templateId!.packageId = selectedPackage;
        }
      });

      await expect(
        createPreparedPurchaseObserver(async () => response(transaction))(
          request,
        ),
      ).resolves.toBeDefined();
    });

    it.each(["109", "110"])(
      "rejects context fetch %s upgraded to a committed non-Splice package",
      async (nodeId) => {
        const { intent, holdings, packageSelection, registry } =
          await purchaseCommandInputs();
        const request = buildBoundedPurchasePrepareRequest(
          intent,
          holdings,
          registry,
          packageSelection,
        );
        const nonSplicePackage = intent.packageSelection.references.find(
          ({ packageName }) => packageName === "sotto-control",
        )?.packageId;
        if (nonSplicePackage === undefined) {
          throw new Error("committed non-Splice package is absent");
        }
        const transaction = preparedPurchaseBytes(
          intent,
          request,
          (prepared) => {
            const wrapper = prepared.transaction!.nodes.find(
              (node) => node.nodeId === nodeId,
            )?.versionedNode;
            if (
              wrapper?.oneofKind !== "v1" ||
              wrapper.v1.nodeType.oneofKind !== "fetch" ||
              wrapper.v1.nodeType.fetch.templateId === undefined
            ) {
              throw new Error(`context fetch ${nodeId} is absent`);
            }
            wrapper.v1.nodeType.fetch.templateId.packageId = nonSplicePackage;
          },
        );

        await expect(
          createPreparedPurchaseObserver(async () => response(transaction))(
            request,
          ),
        ).rejects.toThrow(/prepared.*fetch.*(package|template)/iu);
      },
    );

    it.each(["109", "110"])(
      "rejects context fetch %s moved from preapproval to factory",
      async (nodeId) => {
        const { intent, holdings, packageSelection, registry } =
          await purchaseCommandInputs();
        const request = buildBoundedPurchasePrepareRequest(
          intent,
          holdings,
          registry,
          packageSelection,
        );
        const transaction = preparedPurchaseBytes(intent, request, (prepared) =>
          moveChild(prepared, nodeId, "108", "101"),
        );

        await expect(
          createPreparedPurchaseObserver(async () => response(transaction))(
            request,
          ),
        ).rejects.toThrow(/prepared.*fetch.*(scope|match)/iu);
      },
    );

    it.each(["109", "110"])(
      "rejects missing preapproval context fetch %s",
      async (nodeId) => {
        const { intent, holdings, packageSelection, registry } =
          await purchaseCommandInputs();
        const request = buildBoundedPurchasePrepareRequest(
          intent,
          holdings,
          registry,
          packageSelection,
        );
        const transaction = preparedPurchaseBytes(intent, request, (prepared) =>
          removeChild(prepared, nodeId, "108"),
        );

        await expect(
          createPreparedPurchaseObserver(async () => response(transaction))(
            request,
          ),
        ).rejects.toThrow(/prepared.*fetch/iu);
      },
    );
  });
}
