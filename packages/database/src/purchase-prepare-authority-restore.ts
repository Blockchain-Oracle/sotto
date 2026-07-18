import {
  projectHumanPurchaseJournalIntent,
  type HumanPurchaseLedgerIntent,
} from "@sotto/x402-canton";
import {
  parseHumanPrepareAuthorityPlaintext,
  readHumanPrepareAuthorityRestoreScope,
  restoreHumanPrepareAuthority,
} from "@sotto/x402-canton/internal/human-prepare-authority-persistence";
import type { Pool, PoolClient } from "pg";
import type { PrepareAuthorityKeyring } from "./private-prepare-authority-types.js";
import {
  findPurchaseAggregateByAttemptId,
  type PurchaseAggregateRow,
} from "./purchase-query.js";
import { purchaseAggregateResult } from "./purchase-query-result.js";
import { openPurchasePrepareAuthority } from "./purchase-prepare-authority-store.js";
import type { HumanPrepareAuthorityLease } from "./purchase-prepare-authority-lease.js";
import {
  PurchasePersistenceError,
  type HumanPrepareAuthorityResolution,
  type HumanPrepareAuthorityResolver,
} from "./purchase-types.js";
import { validateHumanPurchaseAttemptInitialization } from "./purchase-validation.js";

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const MINIMUM_SIGNING_RESERVE_MS = 120_000;

function requireReadyAggregate(
  row: PurchaseAggregateRow | undefined,
  lease: HumanPrepareAuthorityLease,
): PurchaseAggregateRow {
  if (
    row === undefined ||
    row.state !== "intent-created" ||
    row.eventSequence !== "1" ||
    row.eventType !== "intent-created" ||
    row.previousEventHash !== null ||
    row.jobKind !== "purchase-prepare" ||
    row.jobState !== "leased" ||
    row.jobId !== lease.jobId ||
    row.jobLeaseGeneration !== String(lease.leaseGeneration) ||
    row.jobLeaseOwner !== lease.leaseOwner ||
    row.jobLeaseExpiresAt?.toISOString() !== lease.leaseExpiresAt ||
    row.jobClaimedAt?.toISOString() !== lease.claimedAt ||
    row.eventRecordedAt === null ||
    row.jobAvailableAt === null ||
    row.jobCreatedAt === null ||
    row.jobLeaseExpiresAt.getTime() <= Date.now() ||
    !(row.executeBefore instanceof Date) ||
    row.executeBefore.getTime() - Date.now() < MINIMUM_SIGNING_RESERVE_MS
  ) {
    throw new PurchasePersistenceError();
  }
  return row;
}

function authoritySource(row: PurchaseAggregateRow) {
  return {
    attemptId: row.attemptId,
    operationId: row.operationId,
    ownerId: row.ownerId,
    purchaseCommitment: row.purchaseCommitment,
    requestHash: row.requestHash,
    resourceRevisionId: row.resourceRevisionId,
    sourceCommit: row.sourceCommit,
  };
}

function resolution(
  row: PurchaseAggregateRow,
): HumanPrepareAuthorityResolution {
  return Object.freeze({
    attemptId: row.attemptId as HumanPrepareAuthorityResolution["attemptId"],
    operationId:
      row.operationId as HumanPrepareAuthorityResolution["operationId"],
    ownerId: row.ownerId,
    resourceRevisionId: row.resourceRevisionId,
    purchaseCommitment:
      row.purchaseCommitment as HumanPrepareAuthorityResolution["purchaseCommitment"],
  });
}

async function withClient<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    return await work(client);
  } finally {
    client.release();
  }
}

async function loadAuthority(
  pool: Pool,
  attemptId: string,
  lease: HumanPrepareAuthorityLease,
  keyring: PrepareAuthorityKeyring,
) {
  return withClient(pool, async (client) => {
    const row = requireReadyAggregate(
      await findPurchaseAggregateByAttemptId(client, attemptId),
      lease,
    );
    const plaintext = await openPurchasePrepareAuthority(
      client,
      authoritySource(row),
      keyring,
    );
    return { plaintext, row };
  });
}

function sameAggregate(
  original: PurchaseAggregateRow,
  current: PurchaseAggregateRow,
): void {
  if (JSON.stringify(current) !== JSON.stringify(original)) {
    throw new PurchasePersistenceError();
  }
}

export async function restorePurchasePrepareAuthority(
  pool: Pool,
  keyring: PrepareAuthorityKeyring,
  lease: HumanPrepareAuthorityLease,
  resolve: HumanPrepareAuthorityResolver,
): Promise<HumanPurchaseLedgerIntent> {
  const attemptId = lease.attemptId;
  if (!SHA256.test(attemptId) || typeof resolve !== "function") {
    throw new PurchasePersistenceError();
  }
  let plaintext: Uint8Array | undefined;
  try {
    const loaded = await loadAuthority(pool, attemptId, lease, keyring);
    plaintext = loaded.plaintext;
    const authority = parseHumanPrepareAuthorityPlaintext(plaintext);
    const fresh = await resolve(
      resolution(loaded.row),
      readHumanPrepareAuthorityRestoreScope(authority),
    );
    await withClient(pool, async (client) => {
      const current = requireReadyAggregate(
        await findPurchaseAggregateByAttemptId(client, attemptId),
        lease,
      );
      sameAggregate(loaded.row, current);
      const reopened = await openPurchasePrepareAuthority(
        client,
        authoritySource(current),
        keyring,
      );
      try {
        if (Buffer.compare(reopened, plaintext!) !== 0) {
          throw new PurchasePersistenceError();
        }
      } finally {
        reopened.fill(0);
      }
    });
    const intent = restoreHumanPrepareAuthority(authority, fresh);
    const expected = validateHumanPurchaseAttemptInitialization(
      projectHumanPurchaseJournalIntent(intent),
      {
        ownerId: loaded.row.ownerId,
        resourceRevisionId: loaded.row.resourceRevisionId,
        beginExclusive: Number(loaded.row.beginExclusive),
      },
      loaded.row.sourceCommit,
    );
    purchaseAggregateResult(
      { ...loaded.row, jobState: expected.jobState },
      expected,
      "replayed",
    );
    return intent;
  } catch {
    throw new PurchasePersistenceError();
  } finally {
    plaintext?.fill(0);
  }
}
