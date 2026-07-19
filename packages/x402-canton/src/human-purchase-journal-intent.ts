import { createHash } from "node:crypto";
import {
  readAuthenticatedHumanPurchaseLedgerIntent,
  type HumanPurchaseLedgerIntent,
} from "./human-purchase-ledger-intent.js";
import { MIN_HUMAN_SIGNING_RESERVE_MS } from "./human-purchase-commitment-validation.js";
import { MAX_PURCHASE_WINDOW_SECONDS } from "./purchase-commitment-validation.js";

export const HUMAN_PURCHASE_JOURNAL_INTENT_VERSION =
  "sotto-human-purchase-journal-intent-v1" as const;

export type HumanPurchaseJournalIntent = Readonly<{
  version: typeof HUMAN_PURCHASE_JOURNAL_INTENT_VERSION;
  authorizationMode: "human-wallet";
  commitmentVersion: "sotto-human-purchase-v1";
  operationId: `sha256:${string}`;
  attemptId: `sha256:${string}`;
  requestCommitment: `sha256:${string}`;
  challengeId: `sha256:${string}`;
  purchaseCommitment: `sha256:${string}`;
  commandId: string;
  requestedAt: string;
  executeBefore: string;
  resource: Readonly<{ method: string; origin: string; path: string }>;
}>;

function operationId(purchaseCommitment: string): `sha256:${string}` {
  return `sha256:${createHash("sha256")
    .update(`sotto-human-purchase-operation-v1\0${purchaseCommitment}`, "utf8")
    .digest("hex")}`;
}

function requireJournalWindow(
  intent: HumanPurchaseLedgerIntent,
  now: number,
): void {
  const requestedAt = Date.parse(intent.challenge.requestedAt);
  const executeBefore = Date.parse(intent.challenge.executeBefore);
  if (
    !Number.isFinite(requestedAt) ||
    !Number.isFinite(executeBefore) ||
    new Date(requestedAt).toISOString() !== intent.challenge.requestedAt ||
    new Date(executeBefore).toISOString() !== intent.challenge.executeBefore ||
    requestedAt > now ||
    executeBefore <= requestedAt ||
    executeBefore - requestedAt > MAX_PURCHASE_WINDOW_SECONDS * 1_000
  ) {
    throw new Error("human purchase journal timing is invalid");
  }
  if (executeBefore - now < MIN_HUMAN_SIGNING_RESERVE_MS) {
    throw new Error("human purchase journal lacks the signing reserve");
  }
}

export function projectHumanPurchaseJournalIntent(
  candidate: HumanPurchaseLedgerIntent,
): HumanPurchaseJournalIntent {
  const intent = readAuthenticatedHumanPurchaseLedgerIntent(candidate);
  requireJournalWindow(intent, Date.now());
  const resource = Object.freeze({
    method: intent.request.method,
    origin: intent.request.resourceOrigin,
    path: intent.request.resourcePath,
  });
  return Object.freeze({
    version: HUMAN_PURCHASE_JOURNAL_INTENT_VERSION,
    authorizationMode: intent.authorizationMode,
    commitmentVersion: intent.version,
    operationId: operationId(intent.purchaseCommitment),
    attemptId: intent.attemptId,
    requestCommitment: intent.request.requestCommitment,
    challengeId: intent.challenge.challengeId,
    purchaseCommitment: intent.purchaseCommitment,
    commandId: `sotto-human-purchase-v1-${intent.purchaseCommitment.slice(7)}`,
    requestedAt: intent.challenge.requestedAt,
    executeBefore: intent.challenge.executeBefore,
    resource,
  });
}
