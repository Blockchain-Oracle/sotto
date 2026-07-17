import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  humanPreparedInput,
  humanPreparedReplaceField,
} from "../../../packages/x402-canton/test/human-prepared-purchase-effect-test-support.js";
import {
  humanPreparedPurchaseBytes,
  type HumanPreparedPurchaseFixture,
} from "../../../packages/x402-canton/test/human-prepared-purchase.fixtures.js";
import { HUMAN_PURCHASE_NOW } from "../../../packages/x402-canton/test/human-purchase-commitment.fixtures.js";
import { fixtureScalar } from "../../../packages/x402-canton/test/prepared-purchase-value.fixtures.js";
import { EXTERNAL_PURCHASE_CONTEXT } from "../../../packages/x402-canton/test/transfer-factory-observation.fixtures.js";
import { verifyReferenceHumanWalletPreparedApproval } from "../src/reference-human-wallet-prepared.js";
import {
  referenceHumanWalletApprovalRequest,
  referenceHumanWalletInputs,
} from "./reference-human-wallet.fixtures.js";

type Mutation = (prepared: HumanPreparedPurchaseFixture) => void;

const mutations: ReadonlyArray<readonly [string, Mutation]> = [
  [
    "unapproved Featured App source package",
    (prepared) => {
      const input = humanPreparedInput(
        prepared,
        EXTERNAL_PURCHASE_CONTEXT.featuredAppRight,
      );
      input.templateId!.packageId = "f".repeat(64);
    },
  ],
  [
    "different physical synchronizer",
    (prepared) => {
      prepared.metadata!.synchronizerId = "other-domain::1220other::35-3";
    },
  ],
  [
    "global key mapping",
    (prepared) => void prepared.metadata!.globalKeyMapping.push({}),
  ],
  [
    "late preparation time",
    (prepared) => {
      prepared.metadata!.preparationTime = prepared.metadata!.maxRecordTime!;
    },
  ],
  [
    "early ledger-effective time",
    (prepared) => {
      prepared.metadata!.minLedgerEffectiveTime = 0n;
    },
  ],
  [
    "missing input contract",
    (prepared) => void prepared.metadata!.inputContracts.pop(),
  ],
  [
    "duplicate input contract",
    (prepared) => {
      prepared.metadata!.inputContracts.push(
        structuredClone(prepared.metadata!.inputContracts[0]!),
      );
    },
  ],
  [
    "foreign Holding owner",
    (prepared) =>
      humanPreparedReplaceField(
        humanPreparedInput(prepared, "00holding-a").argument,
        "owner",
        fixtureScalar("party", "other-payer::1220other"),
      ),
  ],
  [
    "wrong factory DSO",
    (prepared) =>
      humanPreparedReplaceField(
        humanPreparedInput(prepared, "00tokenfactory7").argument,
        "dso",
        fixtureScalar("party", "other-admin::1220other"),
      ),
  ],
  [
    "wrong preapproval receiver",
    (prepared) =>
      humanPreparedReplaceField(
        humanPreparedInput(
          prepared,
          EXTERNAL_PURCHASE_CONTEXT.transferPreapproval,
        ).argument,
        "receiver",
        fixtureScalar("party", "other-provider::1220other"),
      ),
  ],
  [
    "wrong external config DSO",
    (prepared) =>
      humanPreparedReplaceField(
        humanPreparedInput(
          prepared,
          EXTERNAL_PURCHASE_CONTEXT.externalPartyConfigState,
        ).argument,
        "dso",
        fixtureScalar("party", "other-admin::1220other"),
      ),
  ],
  [
    "wrong Featured App provider",
    (prepared) =>
      humanPreparedReplaceField(
        humanPreparedInput(prepared, EXTERNAL_PURCHASE_CONTEXT.featuredAppRight)
          .argument,
        "provider",
        fixtureScalar("party", "other-manager::1220other"),
      ),
  ],
];

describe("reference human wallet prepared metadata", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("accepts the participant protocol-version suffix on the exact synchronizer", async () => {
    const input = await referenceHumanWalletInputs();
    const bytes = humanPreparedPurchaseBytes(
      input.intent,
      input.request,
      (prepared) => {
        prepared.metadata!.synchronizerId = `${input.approval.synchronizerId}::35-3`;
      },
    );
    const request = referenceHumanWalletApprovalRequest(bytes, input.approval);

    expect(() =>
      verifyReferenceHumanWalletPreparedApproval(request),
    ).not.toThrow();
  });

  it("accepts the exact historical Five North Featured App source package", async () => {
    const input = await referenceHumanWalletInputs();
    const bytes = humanPreparedPurchaseBytes(
      input.intent,
      input.request,
      (prepared) => {
        const featured = humanPreparedInput(
          prepared,
          EXTERNAL_PURCHASE_CONTEXT.featuredAppRight,
        );
        featured.templateId!.packageId =
          "3ca1343ab26b453d38c8adb70dca5f1ead8440c42b59b68f070786955cbf9ec1";
      },
    );
    const request = referenceHumanWalletApprovalRequest(bytes, input.approval);

    expect(() =>
      verifyReferenceHumanWalletPreparedApproval(request),
    ).not.toThrow();
  });

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
