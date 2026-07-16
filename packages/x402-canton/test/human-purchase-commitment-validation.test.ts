import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commitHumanPurchaseForTest } from "../src/human-purchase-commitment.js";
import type { HumanPurchaseTrustedConfiguration } from "../src/human-purchase-commitment-types.js";
import {
  type HumanChallengeFixture,
  HUMAN_PURCHASE_NOW,
  HUMAN_TOKEN_FACTORY_CONFIGURATION,
  createHumanPurchaseInput,
} from "./human-purchase-commitment.fixtures.js";
import { authenticatedHumanPayerIdentity } from "./human-payer-identity.fixtures.js";

let nonceIndex = 0;
function commit(
  input: Awaited<ReturnType<typeof createHumanPurchaseInput>>,
  configuration: HumanPurchaseTrustedConfiguration = HUMAN_TOKEN_FACTORY_CONFIGURATION,
) {
  nonceIndex += 1;
  return commitHumanPurchaseForTest(
    input,
    configuration,
    `human-validation-${nonceIndex}`,
  );
}
describe("human purchase commitment validation", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) });
  });
  afterEach(() => vi.useRealTimers());
  it.each(["-1", "01", "1.0", "1e3", "1".repeat(39)])(
    "rejects malformed fee %s",
    async (maximumFeeAtomic) => {
      const input = await createHumanPurchaseInput({ maximumFeeAtomic });
      expect(() => commit(input)).toThrow(/fee.*bounded atomic integer/iu);
    },
  );

  it("enforces the trusted fee ceiling and bounded derived total", async () => {
    const above = await createHumanPurchaseInput({
      maximumFeeAtomic: "1000000001",
    });
    expect(() => commit(above)).toThrow(/platform ceiling/iu);
    const boundary = await createHumanPurchaseInput({
      maximumFeeAtomic: "1000000000",
    });
    expect(commit(boundary)).toBeDefined();
    const zeroFee = await createHumanPurchaseInput({ maximumFeeAtomic: "0" });
    expect(commit(zeroFee)).toBeDefined();

    const overflow = await createHumanPurchaseInput({
      maximumFeeAtomic: "1",
      mutateChallenge: (challenge) => {
        challenge.accepts[0]!.amount = "9".repeat(38);
      },
    });
    expect(() =>
      commit(overflow, {
        ...HUMAN_TOKEN_FACTORY_CONFIGURATION,
        maximumAllowedFeeAtomic: "1",
      }),
    ).toThrow(/debit.*bounded atomic range/iu);
  });

  it("requires a positive principal and a two-minute signing reserve", async () => {
    const zero = await createHumanPurchaseInput({
      mutateChallenge: (challenge) => {
        challenge.accepts[0]!.amount = "0";
      },
    });
    expect(() => commit(zero)).toThrow(/amount.*positive/iu);

    const short = await createHumanPurchaseInput({
      mutateChallenge: (challenge) => {
        challenge.accepts[0]!.maxTimeoutSeconds = 119;
        challenge.accepts[0]!.extra.executeBeforeSeconds = 119;
      },
    });
    expect(() => commit(short)).toThrow(/signing reserve/iu);

    const excessive = await createHumanPurchaseInput({
      mutateChallenge: (challenge) => {
        challenge.accepts[0]!.maxTimeoutSeconds = 601;
        challenge.accepts[0]!.extra.executeBeforeSeconds = 601;
      },
    });
    expect(() => commit(excessive)).toThrow(/window exceeds 600/iu);
  });

  const challengeMutations: ReadonlyArray<
    readonly [string, (challenge: HumanChallengeFixture) => void]
  > = [
    [
      "memo",
      (challenge) => {
        challenge.accepts[0]!.extra.memo = `sha256:${"f".repeat(64)}`;
      },
    ],
    [
      "fee payer",
      (challenge) => {
        challenge.accepts[0]!.extra.feePayer = "sotto-other::1220payer";
      },
    ],
    [
      "synchronizer",
      (challenge) => {
        challenge.accepts[0]!.extra.synchronizerId = "other::1220sync";
      },
    ],
    [
      "network",
      (challenge) => {
        challenge.accepts[0]!.network = "canton:other";
      },
    ],
    [
      "factory admin",
      (challenge) => {
        challenge.accepts[0]!.extra.instrumentId.admin = "Other::1220admin";
      },
    ],
    [
      "instrument ID",
      (challenge) => {
        challenge.accepts[0]!.extra.instrumentId.id = "Other";
      },
    ],
    [
      "asset",
      (challenge) => {
        challenge.accepts[0]!.asset = "Other";
      },
    ],
    [
      "full asset representation",
      (challenge) => {
        challenge.accepts[0]!.asset = `${challenge.accepts[0]!.extra.instrumentId.admin}::Amulet`;
      },
    ],
    [
      "transfer method",
      (challenge) => {
        challenge.accepts[0]!.extra.assetTransferMethod = "direct";
      },
    ],
    [
      "resource URL",
      (challenge) => {
        challenge.resource.url = "https://provider.example/other";
      },
    ],
    [
      "duplicate requirement",
      (challenge) => {
        challenge.accepts.push(structuredClone(challenge.accepts[0]!));
      },
    ],
    [
      "unknown member",
      (challenge) => {
        challenge.accepts[0]!.unknown = true;
      },
    ],
  ];

  it.each(challengeMutations)(
    "rejects challenge %s substitution",
    async (_name, mutate) => {
      const input = await createHumanPurchaseInput({
        mutateChallenge: mutate,
        packageAdminParty: "DSO::1220dso",
      });
      expect(() => commit(input)).toThrow();
    },
  );

  it("rejects same-value identity substitution without consuming originals", async () => {
    const input = await createHumanPurchaseInput();
    const substituted = await authenticatedHumanPayerIdentity();
    expect(() => commit({ ...input, payerIdentity: substituted })).toThrow(
      /package authority.*does not match/iu,
    );
    expect(() => commit(input)).not.toThrow();
  });

  it.each([
    ["blank contract", { contractId: "" }],
    ["blank admin", { expectedAdmin: "" }],
    ["malformed ceiling", { maximumAllowedFeeAtomic: "1.0" }],
    ["unknown config", { unexpected: true }],
  ] as const)("rejects trusted configuration with %s", async (_name, patch) => {
    const input = await createHumanPurchaseInput();
    expect(() =>
      commit(input, {
        ...HUMAN_TOKEN_FACTORY_CONFIGURATION,
        ...patch,
      } as never),
    ).toThrow();
  });
});
