import {
  projectHumanPreparedPurchaseApproval,
  type HashVerifiedHumanPreparedPurchase,
} from "@sotto/x402-canton";
import {
  exactKeys,
  integer,
  objectValue,
  sha256,
  time,
  uuid,
} from "./publication-validation-primitives.js";
import {
  PurchasePersistenceError,
  type HumanPrepareAuthorityLease,
} from "./purchase-types.js";
import { settlementExpectationPersistence } from "./purchase-settlement-expectation.js";
import { settlementPreparedEventHash } from "./purchase-prepare-event.js";

export type PrepareCheckpointRow = Readonly<{
  attemptId: string;
  state: string;
  requestCommitment: string;
  challengeId: string;
  purchaseCommitment: string;
  beginExclusive: string;
  executeBefore: Date;
  previousEventHash: string;
  eventSequence: string;
  eventType: string;
  jobId: string;
  jobKind: string;
  jobState: string;
  leaseGeneration: string;
  leaseOwner: string;
  leaseExpiresAt: Date;
  claimedAt: Date;
  authorityRetiredAt: Date | null;
}>;

export type PrepareCheckpointAuthority = ReturnType<typeof checkpointAuthority>;

function canonicalLease(candidate: unknown): HumanPrepareAuthorityLease {
  const value = objectValue(candidate, "human prepare checkpoint lease");
  exactKeys(
    value,
    [
      "jobId",
      "attemptId",
      "leaseGeneration",
      "leaseOwner",
      "leaseExpiresAt",
      "claimedAt",
    ],
    "human prepare checkpoint lease",
  );
  const claimedAt = time(value.claimedAt, "human prepare lease claimed-at");
  const leaseExpiresAt = time(
    value.leaseExpiresAt,
    "human prepare lease expiry",
  );
  if (
    typeof value.leaseOwner !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value.leaseOwner) ||
    Date.parse(leaseExpiresAt) <= Date.parse(claimedAt)
  ) {
    throw new PurchasePersistenceError();
  }
  return Object.freeze({
    jobId: uuid(value.jobId, "human prepare checkpoint job ID"),
    attemptId: sha256(value.attemptId, "human prepare checkpoint attempt ID"),
    leaseGeneration: integer(
      value.leaseGeneration,
      "human prepare checkpoint lease generation",
      1,
    ),
    leaseOwner: value.leaseOwner,
    leaseExpiresAt,
    claimedAt,
  });
}

function checkpointAuthority(candidate: unknown) {
  const prepared = candidate as HashVerifiedHumanPreparedPurchase;
  const approval = projectHumanPreparedPurchaseApproval(prepared);
  const settlement = settlementExpectationPersistence(prepared);
  const verifiedAt = time(
    prepared.verifiedAt,
    "human prepared verification time",
  );
  if (prepared.preparedTransactionHash !== approval.preparedTransactionHash) {
    throw new PurchasePersistenceError();
  }
  return Object.freeze({
    approval,
    preparedTransactionHash: sha256(
      approval.preparedTransactionHash,
      "human prepared transaction hash",
    ),
    transferContextHash: sha256(
      approval.transferContextHash,
      "human prepared transfer context hash",
    ),
    settlement,
    verifiedAt,
  });
}

export function validatePrepareCheckpoint(
  candidateLease: unknown,
  candidatePrepared: unknown,
) {
  const lease = canonicalLease(candidateLease);
  const authority = checkpointAuthority(candidatePrepared);
  if (authority.approval.attemptId !== lease.attemptId) {
    throw new PurchasePersistenceError();
  }
  return Object.freeze({ authority, lease });
}

export function matchesPrepareCheckpoint(
  row: PrepareCheckpointRow,
  lease: HumanPrepareAuthorityLease,
  authority: PrepareCheckpointAuthority,
): boolean {
  const approval = authority.approval;
  const beginExclusive = Number(row.beginExclusive);
  return (
    row.attemptId === lease.attemptId &&
    row.state === "intent-created" &&
    row.requestCommitment === approval.requestCommitment &&
    row.challengeId === approval.challengeId &&
    row.purchaseCommitment === approval.purchaseCommitment &&
    Number.isSafeInteger(beginExclusive) &&
    beginExclusive >= 0 &&
    row.executeBefore.toISOString() === approval.executeBefore &&
    row.eventSequence === "1" &&
    row.eventType === "intent-created" &&
    row.jobId === lease.jobId &&
    row.jobKind === "purchase-prepare" &&
    row.jobState === "leased" &&
    row.leaseGeneration === String(lease.leaseGeneration) &&
    row.leaseOwner === lease.leaseOwner &&
    row.leaseExpiresAt.toISOString() === lease.leaseExpiresAt &&
    row.claimedAt.toISOString() === lease.claimedAt &&
    row.authorityRetiredAt === null &&
    row.leaseExpiresAt.getTime() > Date.now()
  );
}

export function prepareCheckpointEventHash(
  row: PrepareCheckpointRow,
  lease: HumanPrepareAuthorityLease,
  authority: PrepareCheckpointAuthority,
): `sha256:${string}` {
  return settlementPreparedEventHash({
    attemptId: lease.attemptId,
    preparedTransactionHash: authority.preparedTransactionHash,
    transferContextHash: authority.transferContextHash,
    verifiedAt: authority.verifiedAt,
    expectationSchema: authority.settlement.schema,
    expectationDigest: authority.settlement.digest,
    previousEventHash: row.previousEventHash,
  });
}
