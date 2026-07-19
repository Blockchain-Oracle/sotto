import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import type { HumanPreparedPurchaseApproval } from "@sotto/x402-canton";
import type { ReferenceWalletPreparedHashSignature } from "@sotto/capability-wallet";
import {
  createOwnerJson,
  ensureOwnerOnlyDirectory,
  listOwnerJsonNames,
  readOwnerJson,
  writeOwnerJson,
  RECORD_ID_PATTERN,
} from "./store.js";

export const APPROVAL_RECORD_VERSION = "sotto-signer-approval-v1" as const;

export type ApprovalDecision = "approved" | "rejected";

export type ApprovalRecord = Readonly<{
  version: typeof APPROVAL_RECORD_VERSION;
  approvalId: string;
  operationId: string;
  walletId: string;
  state: "pending" | ApprovalDecision;
  approval: HumanPreparedPurchaseApproval;
  preparedTransactionHash: `sha256:${string}`;
  requestCommitment: `sha256:${string}`;
  expiresAt: string;
  createdAt: string;
  decidedAt?: string;
  collectedAt?: string;
  signature?: ReferenceWalletPreparedHashSignature;
}>;

export type ApprovalStore = Readonly<{
  create: (
    input: Readonly<{
      approval: HumanPreparedPurchaseApproval;
      operationId: string;
      preparedTransactionHash: `sha256:${string}`;
      requestCommitment: `sha256:${string}`;
      expiresAt: string;
      walletId: string;
    }>,
  ) => Promise<ApprovalRecord | "operation-already-submitted">;
  decide: (
    approvalId: string,
    decision: ApprovalDecision,
    signature: ReferenceWalletPreparedHashSignature | undefined,
  ) => Promise<ApprovalRecord>;
  collectSignature: (
    record: ApprovalRecord,
  ) => Promise<ReferenceWalletPreparedHashSignature>;
  read: (approvalId: string) => Promise<ApprovalRecord | undefined>;
  listPendingForWallet: (
    walletId: string,
  ) => Promise<ReadonlyArray<ApprovalRecord>>;
}>;

export function approvalRuntimeState(
  record: ApprovalRecord,
  now: number,
): "pending" | "approved" | "rejected" | "expired" {
  if (record.state === "pending" && Date.parse(record.expiresAt) <= now) {
    return "expired";
  }
  return record.state;
}

function isApprovalRecord(value: unknown): value is ApprovalRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === APPROVAL_RECORD_VERSION &&
    typeof record.approvalId === "string" &&
    RECORD_ID_PATTERN.test(record.approvalId) &&
    typeof record.operationId === "string" &&
    typeof record.walletId === "string" &&
    RECORD_ID_PATTERN.test(record.walletId) &&
    (record.state === "pending" ||
      record.state === "approved" ||
      record.state === "rejected") &&
    typeof record.approval === "object" &&
    record.approval !== null &&
    typeof record.preparedTransactionHash === "string" &&
    typeof record.requestCommitment === "string" &&
    typeof record.expiresAt === "string" &&
    typeof record.createdAt === "string"
  );
}

export async function createApprovalStore(
  keyDirectory: string,
  now: () => number,
): Promise<ApprovalStore> {
  const approvals = await ensureOwnerOnlyDirectory(
    join(keyDirectory, "approvals"),
  );
  const operations = await ensureOwnerOnlyDirectory(
    join(keyDirectory, "operations"),
  );

  const read = async (
    approvalId: string,
  ): Promise<ApprovalRecord | undefined> => {
    if (!RECORD_ID_PATTERN.test(approvalId)) return undefined;
    const value = await readOwnerJson(approvals, `${approvalId}.json`);
    if (value === undefined) return undefined;
    if (!isApprovalRecord(value)) {
      throw new Error("signer approval record is invalid");
    }
    return value;
  };

  const create: ApprovalStore["create"] = async (input) => {
    const operationDigest = createHash("sha256")
      .update(input.operationId, "utf8")
      .digest("hex");
    const reserved = await createOwnerJson(
      operations,
      `${operationDigest}.json`,
      {
        operationId: input.operationId,
        reservedAt: new Date(now()).toISOString(),
      },
    );
    if (!reserved) return "operation-already-submitted";
    const record: ApprovalRecord = Object.freeze({
      version: APPROVAL_RECORD_VERSION,
      approvalId: randomBytes(16).toString("hex"),
      operationId: input.operationId,
      walletId: input.walletId,
      state: "pending",
      approval: input.approval,
      preparedTransactionHash: input.preparedTransactionHash,
      requestCommitment: input.requestCommitment,
      expiresAt: input.expiresAt,
      createdAt: new Date(now()).toISOString(),
    });
    await writeOwnerJson(approvals, `${record.approvalId}.json`, record);
    return record;
  };

  const decide: ApprovalStore["decide"] = async (
    approvalId,
    decision,
    signature,
  ) => {
    const record = await read(approvalId);
    if (record === undefined) {
      throw new Error("signer approval is unknown");
    }
    if (approvalRuntimeState(record, now()) !== "pending") {
      throw new Error("signer approval is no longer pending");
    }
    if ((decision === "approved") !== (signature !== undefined)) {
      throw new Error("signer approval decision signature is inconsistent");
    }
    const decided: ApprovalRecord = Object.freeze({
      ...record,
      state: decision,
      decidedAt: new Date(now()).toISOString(),
      ...(signature === undefined ? {} : { signature }),
    });
    await writeOwnerJson(approvals, `${approvalId}.json`, decided);
    return decided;
  };

  const collectSignature: ApprovalStore["collectSignature"] = async (
    record,
  ) => {
    if (record.state !== "approved" || record.signature === undefined) {
      throw new Error("signer approval signature is not collectable");
    }
    const { signature, ...rest } = record;
    const collected: ApprovalRecord = Object.freeze({
      ...rest,
      collectedAt: new Date(now()).toISOString(),
    });
    await writeOwnerJson(approvals, `${record.approvalId}.json`, collected);
    return signature;
  };

  const listPendingForWallet = async (
    walletId: string,
  ): Promise<ReadonlyArray<ApprovalRecord>> => {
    if (!RECORD_ID_PATTERN.test(walletId)) return [];
    const pending: ApprovalRecord[] = [];
    for (const name of await listOwnerJsonNames(approvals)) {
      const record = await read(name.slice(0, -".json".length));
      if (
        record !== undefined &&
        record.walletId === walletId &&
        approvalRuntimeState(record, now()) === "pending"
      ) {
        pending.push(record);
      }
    }
    return pending;
  };

  return Object.freeze({
    collectSignature,
    create,
    decide,
    listPendingForWallet,
    read,
  });
}
