import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HumanPurchaseHoldingExecutionMaterial } from "../src/human-purchase-holding-types.js";
import type { HumanPurchaseLedgerIntent } from "../src/human-purchase-ledger-intent.js";
import {
  buildHumanTransferFactoryChoiceArguments,
  digestHumanTransferFactoryChoiceArguments,
} from "../src/human-transfer-factory-choice.js";
import { readHumanPurchaseHoldingObservation } from "../src/human-purchase-holding-observation.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import { humanTransferFactoryInputs } from "./human-transfer-factory.fixtures.js";

type Mutation = (
  intent: HumanPurchaseLedgerIntent,
  holdings: HumanPurchaseHoldingExecutionMaterial,
) => void;

const mutations: ReadonlyArray<readonly [string, Mutation]> = [
  [
    "payer",
    (intent) => Reflect.set(intent.challenge, "payerParty", "other::payer"),
  ],
  [
    "provider",
    (intent) =>
      Reflect.set(intent.challenge, "recipientParty", "other::provider"),
  ],
  [
    "principal",
    (intent) => Reflect.set(intent.challenge, "amountAtomic", "2500000001"),
  ],
  [
    "instrument",
    (intent) =>
      Reflect.set(intent.challenge, "instrument", {
        admin: "other::admin",
        id: "Amulet",
      }),
  ],
  [
    "requested time",
    (intent) =>
      Reflect.set(intent.challenge, "requestedAt", "2026-07-16T15:00:00.001Z"),
  ],
  [
    "execution time",
    (intent) =>
      Reflect.set(
        intent.challenge,
        "executeBefore",
        "2026-07-16T15:09:59.999Z",
      ),
  ],
  [
    "attempt hash",
    (intent) => Reflect.set(intent, "attemptId", `sha256:${"1".repeat(64)}`),
  ],
  [
    "challenge hash",
    (intent) =>
      Reflect.set(intent.challenge, "challengeId", `sha256:${"2".repeat(64)}`),
  ],
  [
    "purchase hash",
    (intent) =>
      Reflect.set(intent, "purchaseCommitment", `sha256:${"3".repeat(64)}`),
  ],
  [
    "request hash",
    (intent) =>
      Reflect.set(
        intent.request,
        "requestCommitment",
        `sha256:${"4".repeat(64)}`,
      ),
  ],
  [
    "holding order",
    (_intent, holdings) =>
      Reflect.set(holdings, "contractIds", [...holdings.contractIds].reverse()),
  ],
];

describe("policy-free human TransferFactory choice security", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) });
  });

  afterEach(() => vi.useRealTimers());

  it.each(mutations)(
    "binds the %s into the registry digest",
    async (_name, mutate) => {
      const { holdings: handle, intent } = await humanTransferFactoryInputs();
      const holdings = readHumanPurchaseHoldingObservation(handle, intent);
      const original = digestHumanTransferFactoryChoiceArguments(
        buildHumanTransferFactoryChoiceArguments(intent, holdings),
      );
      const candidateIntent = structuredClone(intent);
      const candidateHoldings = structuredClone(holdings);
      mutate(candidateIntent, candidateHoldings);

      expect(
        digestHumanTransferFactoryChoiceArguments(
          buildHumanTransferFactoryChoiceArguments(
            candidateIntent,
            candidateHoldings,
          ),
        ),
      ).not.toBe(original);
    },
  );

  it("omits request content, identity keys, topology, and policy", async () => {
    const { holdings: handle, intent } = await humanTransferFactoryInputs();
    const holdings = readHumanPurchaseHoldingObservation(handle, intent);
    const source = JSON.stringify(
      buildHumanTransferFactoryChoiceArguments(intent, holdings),
    );

    expect(source).not.toMatch(
      /https?:|authorization|publicKey|subjectHash|topology|capability|policy|allowance/iu,
    );
    expect(source).toContain(intent.request.requestCommitment);
    expect(source).toContain(intent.purchaseCommitment);
  });
});
