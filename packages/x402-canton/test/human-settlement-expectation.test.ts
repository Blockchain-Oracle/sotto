import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as publicApi from "../src/index.js";
import {
  projectHumanSettlementExpectation,
  readAuthenticatedHumanSettlementExpectation,
} from "../src/human-settlement-expectation.js";
import {
  exportHumanSettlementExpectation,
  restoreHumanSettlementExpectation,
} from "../src/human-settlement-expectation-journal.js";
import {
  HUMAN_PREPARED_HASH_VERIFIED_VERSION,
  claimHashVerifiedHumanPreparedPurchase,
  type HashVerifiedHumanPreparedPurchase,
  verifyHumanPreparedPurchaseHash,
} from "../src/human-prepared-purchase-hash.js";
import { registerHashVerifiedHumanPreparedPurchase } from "../src/human-prepared-purchase-hash-state.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import { humanPreparedHashInputs } from "./human-prepared-purchase-hash.fixtures.js";
import { EXTERNAL_PURCHASE_CONTEXT } from "./transfer-factory-observation.fixtures.js";

async function settlementInputs() {
  const input = await humanPreparedHashInputs();
  const verified = await verifyHumanPreparedPurchaseHash(input.observation, {
    recomputeOfficialHash: async () => input.digest,
  });
  return { input, verified };
}

function registeredPackageSelection(
  input: Awaited<ReturnType<typeof humanPreparedHashInputs>>,
  references: ReadonlyArray<Readonly<Record<string, unknown>>>,
  packageIds: readonly string[],
): HashVerifiedHumanPreparedPurchase {
  const now = Date.now();
  const intent = structuredClone(input.intent) as {
    packageSelection: {
      packageIds: readonly string[];
      references: ReadonlyArray<Readonly<Record<string, unknown>>>;
    };
  };
  intent.packageSelection.packageIds = packageIds;
  intent.packageSelection.references = references;
  const authority = Object.freeze({
    version: HUMAN_PREPARED_HASH_VERIFIED_VERSION,
    observationId: `sha256:${"a".repeat(64)}`,
    preparedTransactionHash: `sha256:${Buffer.from(input.digest).toString("hex")}`,
    verifiedAt: new Date(now).toISOString(),
  }) as HashVerifiedHumanPreparedPurchase;
  registerHashVerifiedHumanPreparedPurchase(
    authority,
    {
      acquisitionStartedAt: now,
      capturedAt: now,
      claimed: false,
      intent: intent as never,
      prepareRequest: input.request,
      preparedTransaction: input.transaction,
      participantPreparedTransactionHash: input.digest,
      shape: {} as never,
    },
    input.digest,
    now,
  );
  return authority;
}

describe("authenticated human settlement expectation", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("keeps settlement journal restoration outside the public API", () => {
    expect(publicApi).not.toHaveProperty("exportHumanSettlementExpectation");
    expect(publicApi).not.toHaveProperty("restoreHumanSettlementExpectation");
    expect(publicApi).not.toHaveProperty(
      "HUMAN_SETTLEMENT_EXPECTATION_JOURNAL_SCHEMA",
    );
  });

  it("projects every settlement identifier from hash-verified prepared authority", async () => {
    const { input, verified } = await settlementInputs();
    const choice =
      input.request.commands[0].ExerciseCommand.choiceArgument.transfer;
    const spliceReference = input.intent.packageSelection.references.find(
      ({ packageName }) => packageName === "splice-amulet",
    );
    if (spliceReference === undefined) {
      throw new Error("test splice-amulet reference is absent");
    }

    const expectation = projectHumanSettlementExpectation(verified);

    expect(expectation).toEqual({
      version: "sotto-human-settlement-expectation-v1",
      commandId: input.request.commandId,
      attemptId: input.intent.attemptId,
      challengeId: input.intent.challenge.challengeId,
      requestCommitment: input.intent.request.requestCommitment,
      purchaseCommitment: input.intent.purchaseCommitment,
      payerParty: input.intent.challenge.payerParty,
      providerParty: input.intent.challenge.recipientParty,
      amount: choice.amount,
      dsoParty: input.intent.tokenFactory.expectedAdmin,
      synchronizerId: input.intent.challenge.synchronizerId,
      packageId: spliceReference.packageId,
      transferFactoryContractId: input.intent.tokenFactory.contractId,
      inputHoldingContractIds: choice.inputHoldingCids,
      transferPreapprovalContractId:
        EXTERNAL_PURCHASE_CONTEXT.transferPreapproval,
      choiceContextContractIds: {
        "external-party-config-state":
          EXTERNAL_PURCHASE_CONTEXT.externalPartyConfigState,
        "featured-app-right": EXTERNAL_PURCHASE_CONTEXT.featuredAppRight,
        "splice.example/round": EXTERNAL_PURCHASE_CONTEXT.round,
        "transfer-preapproval": EXTERNAL_PURCHASE_CONTEXT.transferPreapproval,
      },
      amuletTemplateId: `${spliceReference.packageId}:Splice.Amulet:Amulet`,
      transferPreapprovalTemplateId: `${spliceReference.packageId}:Splice.AmuletRules:TransferPreapproval`,
    });
    expect(Object.isFrozen(expectation)).toBe(true);
    expect(Object.isFrozen(expectation.inputHoldingContractIds)).toBe(true);
    expect(Object.isFrozen(expectation.choiceContextContractIds)).toBe(true);
  });

  it("selects exactly one authenticated splice-amulet reference by name", async () => {
    const input = await humanPreparedHashInputs();
    const spliceReference = input.intent.packageSelection.references[0];
    const nonSpliceReference = Object.freeze({
      ...spliceReference,
      packageId: "0".repeat(64),
      packageName: "sotto-control",
    });
    const reordered = registeredPackageSelection(
      input,
      [nonSpliceReference, spliceReference],
      [nonSpliceReference.packageId, spliceReference.packageId],
    );

    expect(projectHumanSettlementExpectation(reordered).packageId).toBe(
      spliceReference.packageId,
    );

    const missing = registeredPackageSelection(
      input,
      [nonSpliceReference],
      [nonSpliceReference.packageId],
    );
    expect(() => projectHumanSettlementExpectation(missing)).toThrow(
      /exactly one splice-amulet/iu,
    );

    const duplicate = registeredPackageSelection(
      input,
      [spliceReference, { ...spliceReference }],
      [spliceReference.packageId],
    );
    expect(() => projectHumanSettlementExpectation(duplicate)).toThrow(
      /exactly one splice-amulet/iu,
    );
  });

  it("rejects clones and preserves the authenticated snapshot after signing claims prepared authority", async () => {
    const { verified } = await settlementInputs();
    const expectation = projectHumanSettlementExpectation(verified);
    claimHashVerifiedHumanPreparedPurchase(verified);

    expect(readAuthenticatedHumanSettlementExpectation(expectation)).toBe(
      expectation,
    );
    expect(() =>
      readAuthenticatedHumanSettlementExpectation({ ...expectation }),
    ).toThrow(/not authenticated/iu);
  });

  it("exports and restores strict deterministic journal authority", async () => {
    const { verified } = await settlementInputs();
    const expectation = projectHumanSettlementExpectation(verified);
    const persisted = exportHumanSettlementExpectation(expectation);
    const serialized = JSON.stringify(persisted);
    const restored = restoreHumanSettlementExpectation(
      JSON.parse(serialized) as unknown,
    );

    expect(restored).toEqual(expectation);
    expect(restored).not.toBe(expectation);
    expect(readAuthenticatedHumanSettlementExpectation(restored)).toBe(
      restored,
    );
    expect(persisted).toMatchObject({
      schema: "sotto-human-settlement-expectation-journal-v1",
      authorityDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    });

    const drifted = JSON.parse(JSON.stringify(persisted)) as {
      expectation: { commandId: string };
    };
    drifted.expectation.commandId = "forged";
    expect(() => restoreHumanSettlementExpectation(drifted)).toThrow(
      /digest|command/iu,
    );
    expect(() =>
      restoreHumanSettlementExpectation({ ...persisted, extra: true }),
    ).toThrow(/keys/iu);
  });
});
