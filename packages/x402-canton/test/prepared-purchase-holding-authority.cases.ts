import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
  expectFactoryEffectRejection,
  preparedCreate,
} from "./prepared-purchase-factory-effects.fixtures.js";
import type { PreparedPurchaseFixture } from "./prepared-purchase.fixtures.js";

function preparedFetch(prepared: PreparedPurchaseFixture, nodeId: string) {
  const wrapper = prepared.transaction?.nodes.find(
    (candidate) => candidate.nodeId === nodeId,
  )?.versionedNode;
  if (wrapper?.oneofKind !== "v1") throw new Error(`missing node ${nodeId}`);
  const node = wrapper.v1.nodeType;
  if (node.oneofKind !== "fetch") {
    throw new Error(`node ${nodeId} is not a fetch`);
  }
  return node.fetch;
}

function preparedExercise(prepared: PreparedPurchaseFixture, nodeId: string) {
  const wrapper = prepared.transaction?.nodes.find(
    (candidate) => candidate.nodeId === nodeId,
  )?.versionedNode;
  if (wrapper?.oneofKind !== "v1") throw new Error(`missing node ${nodeId}`);
  const node = wrapper.v1.nodeType;
  if (node.oneofKind !== "exercise") {
    throw new Error(`node ${nodeId} is not an exercise`);
  }
  return node.exercise;
}

function preparedInputHolding(prepared: PreparedPurchaseFixture) {
  const input = prepared.metadata?.inputContracts.find(
    (candidate) =>
      candidate.contract.oneofKind === "v1" &&
      candidate.contract.v1.contractId === "00holding-a",
  );
  if (input?.contract.oneofKind !== "v1") {
    throw new Error("missing input Holding");
  }
  return input.contract.v1;
}

export function registerPreparedHoldingAuthorityCases(): void {
  describe("prepared external Holding authority topology", () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date("2026-07-13T10:00:02.000Z") });
    });

    afterEach(() => vi.useRealTimers());

    it.each([
      ["receiver", "103"],
      ["sender-change", "104"],
    ] as const)(
      "rejects an admin-only %s Holding create",
      async (_label, nodeId) => {
        await expectFactoryEffectRejection((prepared) => {
          const create = preparedCreate(prepared, nodeId);
          create.signatories = [create.signatories[0]!];
        });
      },
    );

    it.each([
      ["receiver", "103"],
      ["sender-change", "104"],
    ] as const)(
      "rejects an admin-only %s Holding stakeholder set",
      async (_label, nodeId) => {
        await expectFactoryEffectRejection((prepared) => {
          const create = preparedCreate(prepared, nodeId);
          create.stakeholders = [create.stakeholders[0]!];
        });
      },
    );

    it.each(["signatories", "stakeholders"] as const)(
      "rejects an admin-only input Holding %s set",
      async (field) => {
        await expectFactoryEffectRejection((prepared) => {
          const input = preparedInputHolding(prepared);
          const fetch = preparedFetch(prepared, "100");
          input[field] = [input[field][0]!];
          fetch[field] = [fetch[field][0]!];
        });
      },
    );

    it("rejects an admin-only sender-change Holding fetch", async () => {
      await expectFactoryEffectRejection((prepared) => {
        const change = preparedFetch(prepared, "105");
        change.signatories = [change.signatories[0]!];
      });
    });

    it.each([
      ["input", "100"],
      ["sender-change", "105"],
    ] as const)(
      "rejects an admin-only %s Holding fetch stakeholder set",
      async (_label, nodeId) => {
        await expectFactoryEffectRejection((prepared) => {
          const fetch = preparedFetch(prepared, nodeId);
          fetch.stakeholders = [fetch.stakeholders[0]!];
        });
      },
    );

    it("rejects an admin-only Holding archive actor set", async () => {
      await expectFactoryEffectRejection((prepared) => {
        const archive = preparedExercise(prepared, "102");
        archive.actingParties = [archive.actingParties[0]!];
      });
    });

    it("rejects an admin-only Holding archive signatory set", async () => {
      await expectFactoryEffectRejection((prepared) => {
        const archive = preparedExercise(prepared, "102");
        archive.signatories = [archive.signatories[0]!];
      });
    });

    it("rejects an admin-only Holding archive stakeholder set", async () => {
      await expectFactoryEffectRejection((prepared) => {
        const archive = preparedExercise(prepared, "102");
        archive.stakeholders = [archive.stakeholders[0]!];
      });
    });
  });
}
