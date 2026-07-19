import type {
  PreparedTransaction,
  Value,
} from "@canton-network/core-ledger-proto";
import { describe, expect, it } from "vitest";
import { verifyFiveNorthExternalPayerTapPrepared } from "../src/five-north-external-payer-tap-prepared.js";
import {
  mutatePreparedTap,
  TAP_AMOUNT,
  TAP_DSO,
  TAP_PAYER,
  TAP_SYNCHRONIZER,
} from "./five-north-external-payer-tap.fixtures.js";

type Prepared = ReturnType<typeof PreparedTransaction.fromBinary>;

function node(prepared: Prepared, id: string) {
  const wrapper = prepared.transaction?.nodes.find(
    (candidate) => candidate.nodeId === id,
  )?.versionedNode;
  if (wrapper?.oneofKind !== "v1") throw new Error("test node is absent");
  return wrapper.v1.nodeType;
}

function exercise(prepared: Prepared, id: string) {
  const value = node(prepared, id);
  if (value.oneofKind !== "exercise")
    throw new Error("test exercise is absent");
  return value.exercise;
}

function create(prepared: Prepared) {
  const value = node(prepared, "3");
  if (value.oneofKind !== "create") throw new Error("test create is absent");
  return value.create;
}

function field(value: Value | undefined, label: string): Value {
  if (value?.sum.oneofKind !== "record")
    throw new Error("test record is absent");
  const found = value.sum.record.fields.find(
    (candidate) => candidate.label === label,
  )?.value;
  if (found === undefined) throw new Error("test field is absent");
  return found;
}

const invalidEffects: ReadonlyArray<
  readonly [string, (prepared: Prepared) => void]
> = [
  [
    "root choice observer",
    (prepared) => (exercise(prepared, "0").choiceObservers = [TAP_DSO]),
  ],
  [
    "mint package",
    (prepared) => (exercise(prepared, "1").packageName = "attacker"),
  ],
  [
    "mint stakeholders",
    (prepared) => (exercise(prepared, "1").stakeholders = [TAP_DSO, TAP_PAYER]),
  ],
  [
    "fetch package",
    (prepared) => {
      const value = node(prepared, "2");
      if (value.oneofKind !== "fetch") throw new Error("test fetch is absent");
      value.fetch.packageName = "attacker";
    },
  ],
  [
    "fetch signatories",
    (prepared) => {
      const value = node(prepared, "2");
      if (value.oneofKind !== "fetch") throw new Error("test fetch is absent");
      value.fetch.signatories = [TAP_DSO, TAP_PAYER];
    },
  ],
  ["create package", (prepared) => (create(prepared).packageName = "attacker")],
  [
    "node seeds",
    (prepared) => {
      prepared.transaction!.nodeSeeds[2]!.nodeId = 2;
    },
  ],
  [
    "root result",
    (prepared) => {
      delete exercise(prepared, "0").exerciseResult;
    },
  ],
  [
    "mint result",
    (prepared) => {
      delete exercise(prepared, "1").exerciseResult;
    },
  ],
  [
    "input contracts",
    (prepared) => {
      prepared.metadata!.inputContracts = [];
    },
  ],
  [
    "input template",
    (prepared) => {
      const contract = prepared.metadata!.inputContracts[0]!.contract;
      if (contract.oneofKind !== "v1") throw new Error("test input is absent");
      contract.v1.templateId!.packageId = "f".repeat(64);
    },
  ],
  [
    "input event blob",
    (prepared) => {
      prepared.metadata!.inputContracts[0]!.eventBlob = new Uint8Array();
    },
  ],
  [
    "holding result CID",
    (prepared) => {
      create(prepared).contractId = "00different-holding";
    },
  ],
  [
    "negative holding rate",
    (prepared) => {
      const amount = field(create(prepared).argument, "amount");
      const rate = field(field(amount, "ratePerRound"), "rate");
      if (rate.sum.oneofKind !== "numeric")
        throw new Error("test rate is absent");
      rate.sum.numeric = "-0.0001426572";
    },
  ],
];

describe("Five North external payer tap fail-closed effects", () => {
  it.each(invalidEffects)("rejects %s", (_name, mutate) => {
    expect(() =>
      verifyFiveNorthExternalPayerTapPrepared({
        amount: TAP_AMOUNT,
        payerParty: TAP_PAYER,
        preparedTransaction: mutatePreparedTap(mutate),
        synchronizerId: TAP_SYNCHRONIZER,
      }),
    ).toThrow();
  });
});
