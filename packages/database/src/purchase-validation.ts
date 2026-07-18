import { createHash } from "node:crypto";
import type { HumanPurchaseJournalIntent } from "@sotto/x402-canton";
import {
  exactKeys,
  integer,
  objectValue,
  requestHash,
  sha256,
  time,
  uuid,
} from "./publication-validation-primitives.js";
import type { HumanPurchasePersistenceBinding } from "./purchase-types.js";

const SOURCE_COMMIT = /^[0-9a-f]{40}$/u;
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

function digest(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function sourceCommit(value: unknown): string {
  if (typeof value !== "string" || !SOURCE_COMMIT.test(value)) {
    throw new Error("purchase source commit is invalid");
  }
  return value;
}

export function validatePurchaseSourceCommit(value: unknown): string {
  return sourceCommit(value);
}

function journalResource(value: unknown) {
  const resource = objectValue(value, "human purchase journal resource");
  exactKeys(
    resource,
    ["method", "origin", "path"],
    "human purchase journal resource",
  );
  if (typeof resource.method !== "string" || !METHODS.has(resource.method)) {
    throw new Error("human purchase journal method is invalid");
  }
  let origin: URL;
  try {
    origin = new URL(String(resource.origin));
  } catch {
    throw new Error("human purchase journal origin is invalid");
  }
  if (
    origin.protocol !== "https:" ||
    origin.username !== "" ||
    origin.password !== "" ||
    origin.pathname !== "/" ||
    origin.search !== "" ||
    origin.hash !== "" ||
    origin.origin !== resource.origin
  ) {
    throw new Error("human purchase journal origin is invalid");
  }
  if (
    typeof resource.path !== "string" ||
    !resource.path.startsWith("/") ||
    /[?#\s\p{Cc}]/u.test(resource.path) ||
    Buffer.byteLength(resource.path, "utf8") > 2_048
  ) {
    throw new Error("human purchase journal path is invalid");
  }
  return Object.freeze({
    method: resource.method,
    origin: resource.origin as string,
    path: resource.path,
  });
}

function journalProjection(candidate: HumanPurchaseJournalIntent) {
  const intent = objectValue(candidate, "human purchase journal intent");
  exactKeys(
    intent,
    [
      "version",
      "authorizationMode",
      "commitmentVersion",
      "operationId",
      "attemptId",
      "requestCommitment",
      "challengeId",
      "purchaseCommitment",
      "commandId",
      "requestedAt",
      "executeBefore",
      "resource",
    ],
    "human purchase journal intent",
  );
  const purchaseCommitment = sha256(
    intent.purchaseCommitment,
    "purchase commitment",
  );
  const operationId = sha256(intent.operationId, "purchase operation ID");
  const expectedOperation = digest(
    `sotto-human-purchase-operation-v1\0${purchaseCommitment}`,
  );
  const commandId = `sotto-human-purchase-v1-${purchaseCommitment.slice(7)}`;
  const requestedAt = time(intent.requestedAt, "purchase requested-at time");
  const executeBefore = time(
    intent.executeBefore,
    "purchase execute-before time",
  );
  if (
    intent.version !== "sotto-human-purchase-journal-intent-v1" ||
    intent.authorizationMode !== "human-wallet" ||
    intent.commitmentVersion !== "sotto-human-purchase-v1" ||
    operationId !== expectedOperation ||
    intent.commandId !== commandId ||
    Date.parse(executeBefore) <= Date.parse(requestedAt) ||
    Date.parse(executeBefore) - Date.parse(requestedAt) > 600_000
  ) {
    throw new Error("human purchase journal intent is inconsistent");
  }
  return Object.freeze({
    operationId,
    attemptId: sha256(intent.attemptId, "purchase attempt ID"),
    authorizationMode: "human-wallet" as const,
    commitmentVersion: "sotto-human-purchase-v1" as const,
    requestCommitment: sha256(
      intent.requestCommitment,
      "purchase request commitment",
    ),
    challengeId: sha256(intent.challengeId, "purchase challenge ID"),
    purchaseCommitment,
    commandId,
    requestedAt,
    executeBefore,
    resource: journalResource(intent.resource),
  });
}

function persistenceBinding(candidate: HumanPurchasePersistenceBinding) {
  const binding = objectValue(candidate, "human purchase persistence binding");
  exactKeys(
    binding,
    ["ownerId", "resourceRevisionId", "beginExclusive"],
    "human purchase persistence binding",
  );
  return Object.freeze({
    ownerId: uuid(binding.ownerId, "purchase owner ID"),
    resourceRevisionId: uuid(
      binding.resourceRevisionId,
      "purchase resource revision ID",
    ),
    beginExclusive: integer(
      binding.beginExclusive,
      "purchase begin-exclusive offset",
      0,
    ),
  });
}

export function validateHumanPurchaseAttemptInitialization(
  candidateIntent: HumanPurchaseJournalIntent,
  candidateBinding: HumanPurchasePersistenceBinding,
  candidateSourceCommit: string,
) {
  const intent = journalProjection(candidateIntent);
  const binding = persistenceBinding(candidateBinding);
  const canonical = Object.freeze({
    ...intent,
    ...binding,
    sourceCommit: sourceCommit(candidateSourceCommit),
    state: "intent-created" as const,
  });
  const canonicalRequestHash = requestHash(canonical);
  const eventHash = digest(
    `sotto-purchase-intent-event-v1\0${canonicalRequestHash}`,
  );
  return Object.freeze({
    ...canonical,
    requestHash: canonicalRequestHash,
    eventSequence: 1 as const,
    eventType: "intent-created" as const,
    eventHash,
    jobKind: "purchase-prepare" as const,
    jobState: "ready" as const,
    jobDedupeKey: digest(
      `sotto-purchase-prepare-job-v1\0${canonical.operationId}\0${eventHash}`,
    ),
  });
}

export type ValidatedHumanPurchaseAttempt = ReturnType<
  typeof validateHumanPurchaseAttemptInitialization
>;
