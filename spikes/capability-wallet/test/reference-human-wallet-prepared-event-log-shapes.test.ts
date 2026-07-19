import type { Exercise, Value } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { humanPreparedField } from "../../../packages/x402-canton/test/human-prepared-purchase-effect-test-support.js";
import {
  humanPreparedPurchaseBytes,
  type HumanPreparedPurchaseFixture,
} from "../../../packages/x402-canton/test/human-prepared-purchase.fixtures.js";
import { HUMAN_PURCHASE_NOW } from "../../../packages/x402-canton/test/human-purchase-commitment.fixtures.js";
import {
  fixtureIdentifier,
  fixtureScalar,
} from "../../../packages/x402-canton/test/prepared-purchase-value.fixtures.js";
import { verifyReferenceHumanWalletPreparedApproval } from "../src/reference-human-wallet-prepared.js";
import {
  referenceHumanWalletApprovalRequest,
  referenceHumanWalletInputs,
} from "./reference-human-wallet.fixtures.js";

type ShapeMutation = (
  prepared: HumanPreparedPurchaseFixture,
  payer: string,
  provider: string,
) => void;

function eventFor(
  prepared: HumanPreparedPurchaseFixture,
  owner: string,
): Exercise {
  const node = prepared.transaction?.nodes.find((candidate) => {
    const wrapper = candidate.versionedNode;
    return (
      wrapper.oneofKind === "v1" &&
      wrapper.v1.nodeType.oneofKind === "exercise" &&
      wrapper.v1.nodeType.exercise.choiceId === "EventLog_HoldingsChange" &&
      wrapper.v1.nodeType.exercise.choiceObservers[0] === owner
    );
  })?.versionedNode;
  if (node?.oneofKind !== "v1" || node.v1.nodeType.oneofKind !== "exercise") {
    throw new Error("test EventLog is absent");
  }
  return node.v1.nodeType.exercise;
}

function list(value: Value): Value[] {
  if (value.sum.oneofKind !== "list") throw new Error("test list is absent");
  return value.sum.list.elements;
}

function leg(event: Exercise): Value {
  const values = list(
    humanPreparedField(event.chosenValue, "transferLegSides"),
  );
  if (values.length !== 1) throw new Error("test leg is absent");
  return values[0]!;
}

const EVENT_PACKAGE_ID =
  "5c1097a9bad0af4bcfe6d3fb0fe55112d3d11f18eae57ddfb14c20836fee226c";

const mutations: ReadonlyArray<readonly [string, ShapeMutation]> = [
  [
    "LF version",
    (prepared, payer) => (eventFor(prepared, payer).lfVersion = "2.0"),
  ],
  [
    "package name",
    (prepared, payer) => (eventFor(prepared, payer).packageName = "other"),
  ],
  [
    "template",
    (prepared, payer) => {
      eventFor(prepared, payer).templateId = fixtureIdentifier(
        `${"f".repeat(64)}:Splice.ExternalPartyConfigState:ExternalPartyConfigState`,
      );
    },
  ],
  [
    "choice record ID",
    (prepared, payer) => {
      const choice = eventFor(prepared, payer).chosenValue;
      if (choice?.sum.oneofKind !== "record")
        throw new Error("test choice is absent");
      choice.sum.record.recordId = fixtureIdentifier(
        `${EVENT_PACKAGE_ID}:Splice.Api.Token.TransferEventsV2:Other`,
      );
    },
  ],
  [
    "result record ID",
    (prepared, payer) => {
      const result = eventFor(prepared, payer).exerciseResult;
      if (result?.sum.oneofKind !== "record")
        throw new Error("test result is absent");
      result.sum.record.recordId = fixtureIdentifier(
        `${EVENT_PACKAGE_ID}:Splice.Api.Token.TransferEventsV2:OtherResult`,
      );
    },
  ],
  [
    "provider account option",
    (prepared, payer) => {
      const provider = humanPreparedField(
        humanPreparedField(eventFor(prepared, payer).chosenValue, "account"),
        "provider",
      );
      if (provider.sum.oneofKind !== "optional")
        throw new Error("test provider is absent");
      provider.sum.optional.value = fixtureScalar("party", "wrong::1220wrong");
    },
  ],
  [
    "duplicate payer output",
    (prepared, payer) => {
      const outputs = list(
        humanPreparedField(
          eventFor(prepared, payer).chosenValue,
          "outputHoldingCids",
        ),
      );
      outputs.push(outputs[0]!);
    },
  ],
  [
    "provider input",
    (prepared, _payer, provider) =>
      list(
        humanPreparedField(
          eventFor(prepared, provider).chosenValue,
          "inputHoldingCids",
        ),
      ).push(fixtureScalar("contractId", "00hidden")),
  ],
  [
    "side enum ID",
    (prepared, payer) => {
      const side = humanPreparedField(leg(eventFor(prepared, payer)), "side");
      if (side.sum.oneofKind !== "enum") throw new Error("test side is absent");
      side.sum.enum.enumId = fixtureIdentifier(
        `${EVENT_PACKAGE_ID}:Splice.Api.Token.TransferEventsV2:OtherSide`,
      );
    },
  ],
  [
    "extra metadata",
    (prepared, payer) => {
      const values = humanPreparedField(
        humanPreparedField(eventFor(prepared, payer).chosenValue, "extraArgs"),
        "meta",
      );
      const map = humanPreparedField(values, "values");
      if (map.sum.oneofKind !== "textMap")
        throw new Error("test metadata is absent");
      map.sum.textMap.entries.push({
        key: "hidden",
        value: fixtureScalar("text", "value"),
      });
    },
  ],
];

describe("reference human wallet EventLog shapes", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it.each(mutations)("rejects changed %s", async (_name, mutate) => {
    const input = await referenceHumanWalletInputs();
    const bytes = humanPreparedPurchaseBytes(
      input.intent,
      input.request,
      (prepared) =>
        mutate(
          prepared,
          input.approval.payerParty,
          input.approval.providerParty,
        ),
    );
    const request = referenceHumanWalletApprovalRequest(bytes, input.approval);
    expect(() => verifyReferenceHumanWalletPreparedApproval(request)).toThrow(
      /reference human wallet prepared/iu,
    );
  });
});
