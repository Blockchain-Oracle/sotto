import { PreparedTransaction } from "@canton-network/core-ledger-proto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBoundedCapabilityBootstrap,
  createPreparedCapabilityBootstrapObserver,
  recomputeWalletPreparedHashPrecheck,
  type PreparedCapabilityBootstrapObservation,
} from "../src/index.js";
import {
  projectPreparedCapabilityBootstrapApproval,
  type PreparedCapabilityBootstrapApproval,
} from "../src/prepared-capability-bootstrap-approval.js";
import {
  CAPABILITY_BOOTSTRAP_INPUT,
  validPreparedCapabilityBootstrap,
} from "./prepared-capability-bootstrap.fixtures.js";

const NOW = Date.parse("2026-07-15T10:00:00.000Z");

type OfficialHashDependencies = Readonly<{
  recomputeOfficialHash?: (
    preparedTransaction: Uint8Array,
  ) => Promise<Uint8Array>;
}>;

type HashVerifiedCapabilityBootstrap = Readonly<{
  observationId: `sha256:${string}`;
  preparedTransactionHash: string;
  verifiedAt: string;
}>;

type VerifyCapabilityHash = (
  observation: PreparedCapabilityBootstrapObservation,
  dependencies: OfficialHashDependencies,
) => Promise<HashVerifiedCapabilityBootstrap>;

const verifyPreparedCapabilityBootstrapHash: VerifyCapabilityHash =
  async () => {
    throw new Error("prepared capability hash boundary is not implemented");
  };

function response(
  preparedTransaction: Uint8Array,
  participantHash: unknown,
  includeHash = true,
): Uint8Array {
  const value: Record<string, unknown> = {
    preparedTransaction: Buffer.from(preparedTransaction).toString("base64"),
    hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
    hashingDetails: null,
    costEstimation: null,
  };
  if (includeHash) value.preparedTransactionHash = participantHash;
  return new TextEncoder().encode(JSON.stringify(value));
}

async function preparedObservation(participantHash?: Uint8Array) {
  const request = buildBoundedCapabilityBootstrap(CAPABILITY_BOOTSTRAP_INPUT);
  const transaction = PreparedTransaction.toBinary(
    validPreparedCapabilityBootstrap(request),
    { writeUnknownFields: false },
  );
  const precheck = await recomputeWalletPreparedHashPrecheck(transaction);
  const digest = participantHash ?? precheck;
  const observe = createPreparedCapabilityBootstrapObserver(async () =>
    response(transaction, Buffer.from(digest).toString("base64")),
  );
  return {
    digest,
    observation: await observe(request),
    transaction,
  };
}

const projectApproval = projectPreparedCapabilityBootstrapApproval as (
  candidate: unknown,
) => PreparedCapabilityBootstrapApproval;

describe("prepared capability V2 hash gate", () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());

  it("requires participant, Wallet SDK precheck, and official digests", async () => {
    const { digest, observation, transaction } = await preparedObservation();
    const official = vi.fn(async (_bytes: Uint8Array) =>
      new Uint8Array(digest),
    );

    expect(() => projectApproval(observation)).toThrow(/hash-verified/iu);
    const verified = await verifyPreparedCapabilityBootstrapHash(observation, {
      recomputeOfficialHash: official,
    });

    expect(official).toHaveBeenCalledOnce();
    expect(official.mock.calls[0]![0]).toEqual(transaction);
    expect(official.mock.calls[0]![0]).not.toBe(transaction);
    expect(verified).toEqual({
      observationId: observation.observationId,
      preparedTransactionHash: Buffer.from(digest).toString("base64"),
      verifiedAt: "2026-07-15T10:00:00.000Z",
    });
    expect(projectApproval(verified)).toMatchObject({
      preparedTransactionHash: `sha256:${Buffer.from(digest).toString("hex")}`,
    });
  });

  it.each([
    ["missing", undefined, false],
    ["short", Buffer.alloc(31).toString("base64"), true],
    ["long", Buffer.alloc(33).toString("base64"), true],
    ["malformed", "%%%", true],
  ])("rejects a %s participant digest", async (_name, hash, includeHash) => {
    const request = buildBoundedCapabilityBootstrap(CAPABILITY_BOOTSTRAP_INPUT);
    const transaction = PreparedTransaction.toBinary(
      validPreparedCapabilityBootstrap(request),
      { writeUnknownFields: false },
    );
    const observe = createPreparedCapabilityBootstrapObserver(async () =>
      response(transaction, hash, includeHash),
    );

    await expect(observe(request)).rejects.toThrow(
      /participant hash|response fields|base64/iu,
    );
  });

  it("stops before the official oracle when the precheck mismatches", async () => {
    const participant = new Uint8Array(32).fill(9);
    const { observation } = await preparedObservation(participant);
    const official = vi.fn(async () => participant);

    await expect(
      verifyPreparedCapabilityBootstrapHash(observation, {
        recomputeOfficialHash: official,
      }),
    ).rejects.toThrow(/precheck/iu);
    expect(official).not.toHaveBeenCalled();
  });

  it("rejects missing, malformed, short, long, and mismatched official digests", async () => {
    const invalid = [
      undefined,
      async () => "not bytes",
      async () => new Uint8Array(31),
      async () => new Uint8Array(33),
      async () => new Uint8Array(32).fill(9),
    ];
    for (const recomputeOfficialHash of invalid) {
      const { observation } = await preparedObservation();
      await expect(
        verifyPreparedCapabilityBootstrapHash(observation, {
          recomputeOfficialHash: recomputeOfficialHash as never,
        }),
      ).rejects.toThrow(/official.*recomputation|32 bytes/iu);
    }
  });

  it("rejects stale observations before and after official recomputation", async () => {
    const first = await preparedObservation();
    const before = vi.fn(async () => first.digest);
    vi.advanceTimersByTime(60_001);
    await expect(
      verifyPreparedCapabilityBootstrapHash(first.observation, {
        recomputeOfficialHash: before,
      }),
    ).rejects.toThrow(/stale/iu);
    expect(before).not.toHaveBeenCalled();

    vi.setSystemTime(NOW);
    const second = await preparedObservation();
    const during = vi.fn(async () => {
      vi.advanceTimersByTime(60_001);
      return second.digest;
    });
    await expect(
      verifyPreparedCapabilityBootstrapHash(second.observation, {
        recomputeOfficialHash: during,
      }),
    ).rejects.toThrow(/stale/iu);
    expect(during).toHaveBeenCalledOnce();
  });
});
