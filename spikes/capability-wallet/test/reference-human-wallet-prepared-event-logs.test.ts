import type { Exercise, Value } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { humanPreparedField } from "../../../packages/x402-canton/test/human-prepared-purchase-effect-test-support.js";
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

type EventMutation = (
  prepared: HumanPreparedPurchaseFixture,
  payer: string,
  provider: string,
) => void;

function eventFor(
  prepared: HumanPreparedPurchaseFixture,
  owner: string,
): Exercise {
  for (const node of prepared.transaction?.nodes ?? []) {
    const wrapper = node.versionedNode;
    if (
      wrapper.oneofKind === "v1" &&
      wrapper.v1.nodeType.oneofKind === "exercise" &&
      wrapper.v1.nodeType.exercise.choiceId === "EventLog_HoldingsChange" &&
      wrapper.v1.nodeType.exercise.choiceObservers[0] === owner
    ) {
      return wrapper.v1.nodeType.exercise;
    }
  }
  throw new Error("test EventLog is absent");
}

function list(value: Value): Value[] {
  if (value.sum.oneofKind !== "list") throw new Error("test list is absent");
  return value.sum.list.elements;
}

function leg(event: Exercise): Value {
  const values = list(
    humanPreparedField(event.chosenValue, "transferLegSides"),
  );
  if (values.length !== 1) throw new Error("test EventLog leg is absent");
  return values[0]!;
}

function replaceMetadataHash(value: Value): void {
  const values = humanPreparedField(value, "values");
  if (values.sum.oneofKind !== "textMap") {
    throw new Error("test metadata is absent");
  }
  const entry = values.sum.textMap.entries.find(
    ({ key }) => key === "sotto-x402/v1/purchase-commitment",
  );
  if (entry === undefined) throw new Error("test metadata hash is absent");
  entry.value = fixtureScalar("text", `sha256:${"f".repeat(64)}`);
}

const mutations: ReadonlyArray<readonly [string, EventMutation]> = [
  [
    "payer input CID",
    (prepared, payer) => {
      list(
        humanPreparedField(
          eventFor(prepared, payer).chosenValue,
          "inputHoldingCids",
        ),
      )[0] = fixtureScalar("contractId", "00wrong");
    },
  ],
  [
    "provider output CID",
    (prepared, _payer, provider) => {
      list(
        humanPreparedField(
          eventFor(prepared, provider).chosenValue,
          "outputHoldingCids",
        ),
      )[0] = fixtureScalar("contractId", "00wrong");
    },
  ],
  [
    "payer transfer side",
    (prepared, payer) => {
      const side = humanPreparedField(leg(eventFor(prepared, payer)), "side");
      if (side.sum.oneofKind !== "enum") throw new Error("test side is absent");
      side.sum.enum.constructor = "ReceiverSide";
    },
  ],
  [
    "provider other-side owner",
    (prepared, _payer, provider) => {
      const owner = humanPreparedField(
        humanPreparedField(leg(eventFor(prepared, provider)), "otherside"),
        "owner",
      );
      if (owner.sum.oneofKind !== "optional")
        throw new Error("test owner is absent");
      owner.sum.optional.value = fixtureScalar("party", "wrong::1220wrong");
    },
  ],
  [
    "payer chosen observer",
    (prepared, payer) => {
      list(
        humanPreparedField(eventFor(prepared, payer).chosenValue, "observers"),
      )[0] = fixtureScalar("party", "wrong::1220wrong");
    },
  ],
  [
    "provider leg amount",
    (prepared, _payer, provider) => {
      const value = humanPreparedField(
        leg(eventFor(prepared, provider)),
        "amount",
      );
      value.sum = fixtureScalar("numeric", "0.2600000000").sum;
    },
  ],
  [
    "payer leg instrument",
    (prepared, payer) => {
      const value = humanPreparedField(
        leg(eventFor(prepared, payer)),
        "instrumentId",
      );
      value.sum = fixtureScalar("text", "Other").sum;
    },
  ],
  [
    "provider leg metadata",
    (prepared, _payer, provider) =>
      replaceMetadataHash(
        humanPreparedField(leg(eventFor(prepared, provider)), "meta"),
      ),
  ],
  [
    "payer extra context",
    (prepared, payer) => {
      const values = humanPreparedField(
        humanPreparedField(
          humanPreparedField(
            eventFor(prepared, payer).chosenValue,
            "extraArgs",
          ),
          "context",
        ),
        "values",
      );
      if (values.sum.oneofKind !== "textMap")
        throw new Error("test context is absent");
      values.sum.textMap.entries.push({
        key: "hidden",
        value: fixtureScalar("text", "value"),
      });
    },
  ],
  [
    "provider result field",
    (prepared, _payer, provider) => {
      const result = eventFor(prepared, provider).exerciseResult;
      if (result?.sum.oneofKind !== "record")
        throw new Error("test result is absent");
      result.sum.record.fields.push({
        label: "hidden",
        value: fixtureScalar("text", "value"),
      });
    },
  ],
];

describe("reference human wallet EventLog semantics", () => {
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
