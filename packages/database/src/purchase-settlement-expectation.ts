import {
  projectHumanSettlementExpectation,
  type HashVerifiedHumanPreparedPurchase,
  type HumanSettlementExpectation,
} from "@sotto/x402-canton";
import {
  exportHumanSettlementExpectation,
  type PersistedHumanSettlementExpectation,
} from "@sotto/x402-canton/internal/human-settlement-expectation-journal";
import type { Pool } from "pg";
import { sha256 } from "./publication-validation-primitives.js";
import { PurchasePersistenceError } from "./purchase-types.js";
import { readStoredSettlementAuthority } from "./purchase-settlement-row.js";

export type SettlementExpectationPersistence = Readonly<{
  commandId: string;
  digest: `sha256:${string}`;
  json: string;
  schema: string;
}>;

export function settlementExpectationPersistence(
  prepared: HashVerifiedHumanPreparedPurchase,
): SettlementExpectationPersistence {
  let persisted: PersistedHumanSettlementExpectation;
  try {
    persisted = exportHumanSettlementExpectation(
      projectHumanSettlementExpectation(prepared),
    );
  } catch {
    throw new PurchasePersistenceError();
  }
  const json = JSON.stringify(persisted);
  if (Buffer.byteLength(json, "utf8") > 65_536) {
    throw new PurchasePersistenceError();
  }
  return Object.freeze({
    commandId: persisted.expectation.commandId,
    digest: persisted.authorityDigest,
    json,
    schema: persisted.schema,
  });
}

export async function readSettlementExpectation(
  pool: Pool,
  candidateAttemptId: unknown,
): Promise<HumanSettlementExpectation | null> {
  const attemptId = sha256(candidateAttemptId, "settlement attempt ID");
  return (
    (await readStoredSettlementAuthority(pool, attemptId))?.expectation ?? null
  );
}
