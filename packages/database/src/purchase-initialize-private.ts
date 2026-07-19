import type { PoolClient } from "pg";
import type { PrepareAuthorityKeyring } from "./private-prepare-authority-types.js";
import type { PrivateDeliveryKeyring } from "./private-delivery-types.js";
import {
  assertPrivateDeliveryRequest,
  insertPrivateDeliveryRequest,
  sealPrivateDeliveryRequest,
} from "./private-delivery-request-store.js";
import type { PurchaseAggregateRow } from "./purchase-query.js";
import {
  assertPurchasePrepareAuthority,
  insertPurchasePrepareAuthority,
  sealPurchasePrepareAuthority,
} from "./purchase-prepare-authority-store.js";
import type { ValidatedHumanPurchaseAttempt } from "./purchase-validation.js";

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

export function assertInitialPrepareAuthority(
  client: PoolClient,
  row: PurchaseAggregateRow,
  plaintext: Uint8Array,
  keyring: PrepareAuthorityKeyring,
): Promise<void> {
  return assertPurchasePrepareAuthority(
    client,
    authoritySource(row),
    plaintext,
    keyring,
  );
}

export function assertInitialDeliveryRequest(
  client: PoolClient,
  row: PurchaseAggregateRow,
  plaintext: Uint8Array,
  keyring: PrivateDeliveryKeyring,
): Promise<void> {
  return assertPrivateDeliveryRequest(
    client,
    { ...authoritySource(row), requestCommitment: row.requestCommitment },
    plaintext,
    keyring,
  );
}

export async function insertInitialPrivateMaterial(
  client: PoolClient,
  attempt: ValidatedHumanPurchaseAttempt,
  preparePlaintext: Uint8Array,
  prepareKeyring: PrepareAuthorityKeyring,
  deliveryPlaintext: Uint8Array,
  deliveryKeyring: PrivateDeliveryKeyring,
): Promise<void> {
  const prepare = sealPurchasePrepareAuthority(
    attempt,
    preparePlaintext,
    prepareKeyring,
  );
  const delivery = sealPrivateDeliveryRequest(
    attempt,
    deliveryPlaintext,
    deliveryKeyring,
  );
  await insertPurchasePrepareAuthority(client, attempt.attemptId, prepare);
  await insertPrivateDeliveryRequest(client, attempt, delivery);
}
