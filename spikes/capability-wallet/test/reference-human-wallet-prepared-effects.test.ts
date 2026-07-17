import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  humanPreparedCreate,
  humanPreparedExercise,
  humanPreparedField,
  humanPreparedReplaceField,
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

const mutations: ReadonlyArray<readonly [string, Mutation]> = [
  [
    "missing root child",
    (prepared) => void humanPreparedExercise(prepared, "0").children.pop(),
  ],
  [
    "changed inner transfer amount",
    (prepared) =>
      humanPreparedReplaceField(
        humanPreparedExercise(prepared, "1").chosenValue,
        "amount",
        fixtureScalar("numeric", "0.1000000000"),
      ),
  ],
  [
    "changed payer output",
    (prepared) =>
      humanPreparedReplaceField(
        humanPreparedField(
          humanPreparedCreate(prepared, "4").argument,
          "amount",
        ),
        "initialAmount",
        fixtureScalar("numeric", "0.0740000000"),
      ),
  ],
  [
    "changed command identity",
    (prepared) => {
      prepared.metadata!.submitterInfo!.commandId = "other-command";
    },
  ],
  [
    "unreferenced extra node",
    (prepared) => {
      const extra = structuredClone(
        prepared.transaction!.nodes.find(({ nodeId }) => nodeId === "5")!,
      );
      extra.nodeId = "999";
      prepared.transaction!.nodes.push(extra);
    },
  ],
  [
    "reordered root fetch",
    (prepared) => {
      const children = humanPreparedExercise(prepared, "0").children;
      [children[0], children[1]] = [children[1]!, children[0]!];
    },
  ],
  [
    "connected extra fetch",
    (prepared) => {
      const extra = structuredClone(
        prepared.transaction!.nodes.find(({ nodeId }) => nodeId === "5")!,
      );
      extra.nodeId = "999";
      prepared.transaction!.nodes.push(extra);
      const children = humanPreparedExercise(prepared, "0").children;
      children.splice(children.length - 1, 0, extra.nodeId);
    },
  ],
  [
    "reordered preapproval fetch",
    (prepared) => {
      const children = humanPreparedExercise(prepared, "1").children;
      [children[0], children[1]] = [children[1]!, children[0]!];
    },
  ],
  [
    "wrong Holding archive",
    (prepared) => {
      humanPreparedExercise(prepared, "2").choiceId = "Purchase";
    },
  ],
  [
    "substituted receiver CID",
    (prepared) => {
      humanPreparedCreate(prepared, "3").contractId = "00wrong-receiver";
    },
  ],
  [
    "wrong EventLog choice",
    (prepared) => {
      humanPreparedExercise(prepared, "7").choiceId = "Purchase";
    },
  ],
  [
    "incomplete preapproval authority",
    (prepared) => {
      const exercise = humanPreparedExercise(prepared, "1");
      exercise.signatories = [exercise.signatories[0]!];
    },
  ],
];

describe("reference human wallet descendant verification", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it.each(mutations)("rejects a %s", async (_name, mutate) => {
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
});
