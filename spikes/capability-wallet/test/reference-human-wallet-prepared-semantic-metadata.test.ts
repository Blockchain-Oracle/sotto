import type { Value } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  humanPreparedExercise,
  humanPreparedFetch,
  humanPreparedField,
} from "../../../packages/x402-canton/test/human-prepared-purchase-effect-test-support.js";
import {
  humanPreparedPurchaseBytes,
  type HumanPreparedPurchaseFixture,
} from "../../../packages/x402-canton/test/human-prepared-purchase.fixtures.js";
import { HUMAN_PURCHASE_NOW } from "../../../packages/x402-canton/test/human-purchase-commitment.fixtures.js";
import { fixtureScalar } from "../../../packages/x402-canton/test/prepared-purchase-value.fixtures.js";
import { verifyReferenceHumanWalletPreparedApproval } from "../src/reference-human-wallet-prepared.js";
import {
  referenceHumanWalletApprovalRequest,
  referenceHumanWalletInputs,
} from "./reference-human-wallet.fixtures.js";

type Mutation = (prepared: HumanPreparedPurchaseFixture) => void;

function optionalValue(value: Value): Value {
  if (
    value.sum.oneofKind !== "optional" ||
    value.sum.optional.value === undefined
  ) {
    throw new Error("test optional value is absent");
  }
  return value.sum.optional.value;
}

function replaceMetadataHash(value: Value): void {
  const values = humanPreparedField(value, "values");
  if (values.sum.oneofKind !== "textMap") {
    throw new Error("test metadata map is absent");
  }
  const entry = values.sum.textMap.entries.find(
    ({ key }) => key === "sotto-x402/v1/purchase-commitment",
  );
  if (entry === undefined) throw new Error("test metadata hash is absent");
  entry.value = fixtureScalar("text", `sha256:${"f".repeat(64)}`);
}

function rootChoice(prepared: HumanPreparedPurchaseFixture): Value {
  const value = humanPreparedExercise(prepared, "0").chosenValue;
  if (value === undefined) throw new Error("test root choice is absent");
  return value;
}

const mutations: ReadonlyArray<readonly [string, Mutation]> = [
  [
    "root transfer metadata",
    (prepared) =>
      replaceMetadataHash(
        humanPreparedField(
          humanPreparedField(rootChoice(prepared), "transfer"),
          "meta",
        ),
      ),
  ],
  [
    "preapproval choice metadata",
    (prepared) => {
      const choice = humanPreparedExercise(prepared, "1").chosenValue;
      if (choice === undefined) throw new Error("test choice is absent");
      replaceMetadataHash(optionalValue(humanPreparedField(choice, "meta")));
    },
  ],
  [
    "factory result metadata",
    (prepared) =>
      replaceMetadataHash(
        humanPreparedField(
          humanPreparedExercise(prepared, "0").exerciseResult,
          "meta",
        ),
      ),
  ],
  [
    "preapproval result metadata",
    (prepared) =>
      replaceMetadataHash(
        humanPreparedField(
          humanPreparedExercise(prepared, "1").exerciseResult,
          "meta",
        ),
      ),
  ],
  [
    "root registry context",
    (prepared) => {
      const values = humanPreparedField(
        humanPreparedField(
          humanPreparedField(rootChoice(prepared), "extraArgs"),
          "context",
        ),
        "values",
      );
      if (values.sum.oneofKind !== "textMap") {
        throw new Error("test context map is absent");
      }
      const entry = values.sum.textMap.entries.find(
        ({ key }) => key === "external-party-config-state",
      );
      if (
        entry?.value?.sum.oneofKind !== "variant" ||
        entry.value.sum.variant.value === undefined
      ) {
        throw new Error("test context entry is absent");
      }
      entry.value.sum.variant.value = fixtureScalar("contractId", "00wrong");
    },
  ],
  [
    "non-critical registry context",
    (prepared) => {
      const values = humanPreparedField(
        humanPreparedField(
          humanPreparedField(rootChoice(prepared), "extraArgs"),
          "context",
        ),
        "values",
      );
      if (values.sum.oneofKind !== "textMap") {
        throw new Error("test context map is absent");
      }
      const entry = values.sum.textMap.entries.find(
        ({ key }) => key === "splice.example/round",
      );
      if (
        entry?.value?.sum.oneofKind !== "variant" ||
        entry.value.sum.variant.value === undefined
      ) {
        throw new Error("test context entry is absent");
      }
      entry.value.sum.variant.value = fixtureScalar(
        "contractId",
        "00wrong-round",
      );
    },
  ],
  [
    "graph-only preapproval manager",
    (prepared) => {
      const oldManager = "five-north-validator::1220validator";
      const newManager = "other-manager::1220other";
      const replace = (parties: string[]) => {
        const index = parties.indexOf(oldManager);
        if (index < 0) throw new Error("test manager is absent");
        parties[index] = newManager;
      };
      const preapproval = humanPreparedExercise(prepared, "1");
      replace(preapproval.signatories);
      replace(preapproval.stakeholders);
      const rootFetch = humanPreparedFetch(prepared, "9");
      replace(rootFetch.signatories);
      replace(rootFetch.stakeholders);
      const featuredFetch = humanPreparedFetch(prepared, "6");
      replace(featuredFetch.stakeholders);
      replace(featuredFetch.actingParties);
    },
  ],
];

describe("reference human wallet semantic metadata", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it.each(mutations)("rejects changed %s", async (_name, mutate) => {
    const input = await referenceHumanWalletInputs();
    const bytes = humanPreparedPurchaseBytes(
      input.intent,
      input.request,
      mutate,
    );
    const request = referenceHumanWalletApprovalRequest(bytes, input.approval);
    expect(() => verifyReferenceHumanWalletPreparedApproval(request)).toThrow(
      /reference human wallet prepared/iu,
    );
  });

  it("rejects a syntactically valid wrong approval context hash", async () => {
    const input = await referenceHumanWalletInputs();
    const request = referenceHumanWalletApprovalRequest(input.transaction, {
      ...input.approval,
      transferContextHash: `sha256:${"f".repeat(64)}`,
    });

    expect(() => verifyReferenceHumanWalletPreparedApproval(request)).toThrow(
      /reference human wallet prepared/iu,
    );
  });
});
