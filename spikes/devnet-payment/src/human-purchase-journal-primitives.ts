import { createHash } from "node:crypto";
import type {
  HumanPurchaseJournalHash,
  HumanPurchaseJournalRecord,
  HumanPurchaseJournalStage,
  HumanPurchaseOperationId,
} from "./human-purchase-journal-types.js";

const HASH = /^sha256:[0-9a-f]{64}$/u;
const UPDATE_ID = /^1220[0-9a-f]{64}$/u;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export function isMissingHumanJournalRecord(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export function exactHumanJournalObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  if (
    JSON.stringify(Object.keys(record).sort()) !==
    JSON.stringify([...keys].sort())
  ) {
    throw new Error(`${label} keys are invalid`);
  }
  return record;
}

export function humanJournalSha256(value: string): HumanPurchaseJournalHash {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function humanJournalHash(
  value: unknown,
  label: string,
): HumanPurchaseJournalHash {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new Error(`${label} must be a SHA-256 identifier`);
  }
  return value as HumanPurchaseJournalHash;
}

export function humanJournalIdentifier(
  value: unknown,
  label: string,
  maximum = 512,
): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.trim() !== value ||
    new TextEncoder().encode(value).byteLength > maximum
  ) {
    throw new Error(`${label} is invalid`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      throw new Error(`${label} is invalid`);
    }
  }
  return value;
}

export function humanJournalOffset(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} is invalid`);
  }
  return value as number;
}

export function humanJournalUpdateId(value: unknown): string {
  if (typeof value !== "string" || !UPDATE_ID.test(value)) {
    throw new Error("human purchase journal update ID is invalid");
  }
  return value;
}

export function humanJournalUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_V4.test(value)) {
    throw new Error("human purchase journal submission ID is invalid");
  }
  return value;
}

export function humanJournalTimestamp(value: unknown): string {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  if (
    typeof value !== "string" ||
    !Number.isFinite(parsed) ||
    new Date(parsed).toISOString() !== value
  ) {
    throw new Error("human purchase journal timestamp is invalid");
  }
  return value;
}

export function humanPurchaseOperationId(
  purchaseCommitment: unknown,
): HumanPurchaseOperationId {
  const commitment = humanJournalHash(
    purchaseCommitment,
    "human purchase commitment",
  );
  return humanJournalSha256(`sotto-human-purchase-operation-v1\0${commitment}`);
}

export function humanPurchaseJournalDirectoryName(
  operationId: unknown,
): string {
  const operation = humanJournalHash(
    operationId,
    "human purchase operation ID",
  );
  return `devnet-human-purchase-${operation.slice(7, 56)}`;
}

export function humanJournalRecordDigest(
  record: Omit<HumanPurchaseJournalRecord, "recordSha256">,
): HumanPurchaseJournalHash {
  return humanJournalSha256(JSON.stringify(record));
}

export function humanJournalKind(value: unknown): HumanPurchaseJournalStage {
  if (
    value !== "intent" &&
    value !== "approval-requested" &&
    value !== "signature-verified" &&
    value !== "execution-started" &&
    value !== "completion" &&
    value !== "settlement-reconciled" &&
    value !== "delivery"
  ) {
    throw new Error("human purchase journal kind is invalid");
  }
  return value;
}
