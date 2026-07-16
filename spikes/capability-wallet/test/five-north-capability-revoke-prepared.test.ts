import { describe, expect, it } from "vitest";
import { verifyFiveNorthCapabilityRevokePrepared } from "../src/five-north-capability-revoke-prepared.js";
import {
  mutatePreparedRevoke,
  preparedRevokeFixture,
  REVOKE_AGENT,
  REVOKE_CAPABILITY,
  REVOKE_PAYER,
  REVOKE_SYNCHRONIZER,
} from "./five-north-capability-revoke.fixtures.js";

function input(preparedTransaction = preparedRevokeFixture()) {
  return {
    agentParty: REVOKE_AGENT,
    capabilityContractId: REVOKE_CAPABILITY,
    payerParty: REVOKE_PAYER,
    preparedTransaction,
    synchronizerId: REVOKE_SYNCHRONIZER,
  };
}

type Prepared = Parameters<Parameters<typeof mutatePreparedRevoke>[0]>[0];

function rootExercise(prepared: Prepared) {
  const wrapper = prepared.transaction?.nodes[0]?.versionedNode;
  const node = wrapper?.oneofKind === "v1" ? wrapper.v1.nodeType : undefined;
  if (node?.oneofKind !== "exercise") throw new Error("test root is absent");
  return node.exercise;
}

const invalid: ReadonlyArray<readonly [string, (prepared: Prepared) => void]> =
  [
    [
      "root contract",
      (prepared) => (rootExercise(prepared).contractId = "00other"),
    ],
    ["root choice", (prepared) => (rootExercise(prepared).choiceId = "Pause")],
    [
      "root authority",
      (prepared) => (rootExercise(prepared).actingParties = [REVOKE_AGENT]),
    ],
    ["root children", (prepared) => (rootExercise(prepared).children = ["1"])],
    ["root result", (prepared) => delete rootExercise(prepared).exerciseResult],
    ["input", (prepared) => (prepared.metadata!.inputContracts = [])],
    ["seed", (prepared) => (prepared.transaction!.nodeSeeds[0]!.nodeId = 1)],
  ];

describe("Five North exact capability revoke verifier", () => {
  it("accepts the observed one-root payer revoke", () => {
    expect(verifyFiveNorthCapabilityRevokePrepared(input())).toEqual({
      capabilityContractId: REVOKE_CAPABILITY,
      payerParty: REVOKE_PAYER,
      synchronizerId: REVOKE_SYNCHRONIZER,
      version: "sotto-five-north-capability-revoke-v1",
    });
  });

  it.each(invalid)("rejects %s substitution", (_name, mutate) => {
    expect(() =>
      verifyFiveNorthCapabilityRevokePrepared(
        input(mutatePreparedRevoke(mutate)),
      ),
    ).toThrow();
  });
});
