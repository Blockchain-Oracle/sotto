import { timingSafeEqual } from "node:crypto";
import {
  requireHumanObservationActive,
  withHumanObservationDeadline,
  type HumanObservationOptions,
  type HumanObservationReadOptions,
} from "./human-observation-deadline.js";
import type { HumanPreparedPurchaseObservation } from "./human-prepared-purchase-observation.js";
import {
  registerHashVerifiedHumanPreparedPurchase,
  claimHashVerifiedHumanPreparedPurchase,
} from "./human-prepared-purchase-hash-state.js";
import {
  assertHumanPreparedPurchaseStateFresh,
  claimHumanPreparedPurchaseObservation,
} from "./human-prepared-purchase-observation-state.js";
import { recomputeWalletPreparedHashPrecheck } from "./prepared-purchase-wallet-precheck.js";

export const HUMAN_PREPARED_HASH_TIMEOUT_MS = 10_000;
export const HUMAN_PREPARED_HASH_VERIFIED_VERSION =
  "sotto-human-prepared-hash-v1" as const;

export type HumanPreparedPurchaseHashOptions = HumanObservationOptions;
export type HumanPreparedPurchaseHashReadOptions = HumanObservationReadOptions;
export type HumanPreparedPurchaseHashDependencies = Readonly<{
  recomputeOfficialHash: (
    preparedTransaction: Uint8Array,
    options: HumanPreparedPurchaseHashReadOptions,
  ) => Promise<Uint8Array>;
}>;

declare const hashVerifiedHumanPreparedPurchaseBrand: unique symbol;
export type HashVerifiedHumanPreparedPurchase = Readonly<{
  version: typeof HUMAN_PREPARED_HASH_VERIFIED_VERSION;
  observationId: `sha256:${string}`;
  preparedTransactionHash: `sha256:${string}`;
  verifiedAt: string;
  readonly [hashVerifiedHumanPreparedPurchaseBrand]: true;
}>;

function officialHasher(value: unknown) {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    typeof (value as Record<string, unknown>).recomputeOfficialHash !==
      "function"
  ) {
    throw new Error("official human prepared hash recomputation is required");
  }
  return (value as HumanPreparedPurchaseHashDependencies).recomputeOfficialHash;
}

function digest(value: unknown, label: string): Uint8Array {
  if (!(value instanceof Uint8Array) || value.byteLength !== 32) {
    throw new Error(`${label} must return exactly 32 bytes`);
  }
  if (
    typeof SharedArrayBuffer !== "undefined" &&
    value.buffer instanceof SharedArrayBuffer
  ) {
    throw new Error(`${label} must return isolated bytes`);
  }
  return new Uint8Array(value);
}

function requireMatch(
  participant: Uint8Array,
  candidate: Uint8Array,
  label: string,
): void {
  if (!timingSafeEqual(Buffer.from(participant), Buffer.from(candidate))) {
    throw new Error(`${label} does not match the participant digest`);
  }
}

async function recomputeOfficial(
  recompute: HumanPreparedPurchaseHashDependencies["recomputeOfficialHash"],
  preparedTransaction: Uint8Array,
  signal: AbortSignal,
): Promise<Uint8Array> {
  try {
    return await recompute(
      new Uint8Array(preparedTransaction),
      Object.freeze({ signal }),
    );
  } catch {
    requireHumanObservationActive(signal, "human prepared hash verification");
    throw new Error("official human prepared hash recomputation failed");
  }
}

export async function verifyHumanPreparedPurchaseHash(
  observation: HumanPreparedPurchaseObservation,
  dependencies: HumanPreparedPurchaseHashDependencies,
  options: HumanPreparedPurchaseHashOptions = {},
): Promise<HashVerifiedHumanPreparedPurchase> {
  const recomputeOfficialHash = officialHasher(dependencies);
  return await withHumanObservationDeadline(
    "human prepared hash verification",
    HUMAN_PREPARED_HASH_TIMEOUT_MS,
    options,
    async (signal) => {
      const prepared = claimHumanPreparedPurchaseObservation(observation);
      const participant = digest(
        prepared.participantPreparedTransactionHash,
        "human prepared participant hash",
      );
      const precheck = digest(
        await recomputeWalletPreparedHashPrecheck(
          new Uint8Array(prepared.preparedTransaction),
        ),
        "human prepared hash precheck",
      );
      requireHumanObservationActive(signal, "human prepared hash verification");
      assertHumanPreparedPurchaseStateFresh(prepared);
      requireMatch(participant, precheck, "human prepared hash precheck");
      const official = digest(
        await recomputeOfficial(
          recomputeOfficialHash,
          prepared.preparedTransaction,
          signal,
        ),
        "official human prepared hash recomputation",
      );
      requireHumanObservationActive(signal, "human prepared hash verification");
      assertHumanPreparedPurchaseStateFresh(prepared);
      requireMatch(
        participant,
        official,
        "official human prepared hash recomputation",
      );
      const verifiedAt = Date.now();
      const authority = Object.freeze({
        version: HUMAN_PREPARED_HASH_VERIFIED_VERSION,
        observationId: observation.observationId,
        preparedTransactionHash: `sha256:${Buffer.from(participant).toString("hex")}`,
        verifiedAt: new Date(verifiedAt).toISOString(),
      }) as HashVerifiedHumanPreparedPurchase;
      registerHashVerifiedHumanPreparedPurchase(
        authority,
        prepared,
        participant,
        verifiedAt,
      );
      return authority;
    },
  );
}

export { claimHashVerifiedHumanPreparedPurchase };
