import {
  capabilityBootstrapJournalHash as hash,
  capabilityBootstrapJournalIdentifier as identifier,
  capabilityBootstrapJournalSha256 as sha256,
  capabilityBootstrapJournalTimestamp as timestamp,
  exactCapabilityBootstrapJournalObject as exactObject,
  isMissingCapabilityBootstrapJournalRecord as isMissing,
} from "./capability-bootstrap-journal-primitives.js";
import { readCapabilityBootstrapJournalJson } from "./capability-bootstrap-journal-storage.js";

export const CAPABILITY_BOOTSTRAP_WALLET_SCHEMA =
  "sotto-capability-bootstrap-wallet-journal-v1";
export const CAPABILITY_BOOTSTRAP_WALLET_STAGES = [
  [
    "10-prepared-verified.json",
    "prepared-verified",
    ["preparedTransactionHash"],
  ],
  [
    "11-approval-requested.json",
    "approval-requested",
    ["connectorId", "connectorKind", "sessionId"],
  ],
  [
    "12-signature-received.json",
    "signature-received",
    [
      "sessionId",
      "signatureFormat",
      "signatureSha256",
      "signedBy",
      "signingAlgorithm",
    ],
  ],
  [
    "13-execution-started.json",
    "execution-started",
    ["sessionId", "submissionId", "userId"],
  ],
] as const;

type WalletRecord = Readonly<Record<string, unknown>>;
export type CapabilityBootstrapWalletJournal = Readonly<{
  approvalRequested: WalletRecord | null;
  executionStarted: WalletRecord | null;
  preparedVerified: WalletRecord | null;
  signatureReceived: WalletRecord | null;
}>;

export async function readOptionalCapabilityBootstrapJournalJson(
  directory: string,
  name: string,
) {
  try {
    return await readCapabilityBootstrapJournalJson(directory, name);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

function validateWalletStage(
  record: Record<string, unknown>,
  index: number,
): void {
  if (index === 0) {
    hash(record.preparedTransactionHash, "prepared transaction hash");
  } else if (index === 1) {
    identifier(record.connectorId, "wallet connector ID", 255);
    if (
      record.connectorKind !== "openrpc" &&
      record.connectorKind !== "wallet-sdk"
    ) {
      throw new Error("wallet connector kind is invalid");
    }
    hash(record.sessionId, "wallet session ID");
  } else if (index === 2) {
    hash(record.sessionId, "wallet session ID");
    hash(record.signatureSha256, "wallet signature hash");
    if (
      record.signatureFormat !== "SIGNATURE_FORMAT_CONCAT" &&
      record.signatureFormat !== "SIGNATURE_FORMAT_DER"
    ) {
      throw new Error("wallet signature format is invalid");
    }
    if (
      record.signingAlgorithm !== "SIGNING_ALGORITHM_SPEC_ED25519" &&
      record.signingAlgorithm !== "SIGNING_ALGORITHM_SPEC_EC_DSA_SHA_256"
    ) {
      throw new Error("wallet signing algorithm is invalid");
    }
    const fingerprint = identifier(record.signedBy, "wallet fingerprint", 132);
    if (!/^1220[0-9a-f]{64}$/u.test(fingerprint)) {
      throw new Error("wallet fingerprint is invalid");
    }
  } else {
    hash(record.sessionId, "wallet session ID");
    const submissionId = identifier(record.submissionId, "submission ID", 64);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
        submissionId,
      )
    ) {
      throw new Error("wallet submission ID is invalid");
    }
    identifier(record.userId, "wallet execution user ID", 255);
  }
}

export function parseCapabilityBootstrapWalletRecord(
  value: unknown,
  index: number,
  operationId: string,
  previousRecordSha256: string,
): WalletRecord {
  const stage = CAPABILITY_BOOTSTRAP_WALLET_STAGES[index]!;
  const record = exactObject(
    value,
    [
      "kind",
      "operationId",
      "previousRecordSha256",
      "recordedAt",
      "schema",
      ...stage[2],
    ],
    `bootstrap ${stage[1]} record`,
  );
  if (
    record.kind !== stage[1] ||
    record.schema !== CAPABILITY_BOOTSTRAP_WALLET_SCHEMA ||
    record.operationId !== operationId ||
    record.previousRecordSha256 !== previousRecordSha256
  ) {
    throw new Error(`bootstrap ${stage[1]} record chain is invalid`);
  }
  timestamp(record.recordedAt);
  validateWalletStage(record, index);
  return Object.freeze({ ...record });
}

export async function loadCapabilityBootstrapWalletJournal(
  directory: string,
  operationId: string,
  initialPreviousRecordSha256: string,
): Promise<CapabilityBootstrapWalletJournal> {
  const records: Array<WalletRecord | null> = [];
  let previous = initialPreviousRecordSha256;
  let missing = false;
  for (const [index, stage] of CAPABILITY_BOOTSTRAP_WALLET_STAGES.entries()) {
    const value = await readOptionalCapabilityBootstrapJournalJson(
      directory,
      stage[0],
    );
    if (value === null) {
      missing = true;
      records.push(null);
      continue;
    }
    if (missing) {
      throw new Error("bootstrap wallet journal stage is out of order");
    }
    const record = parseCapabilityBootstrapWalletRecord(
      value,
      index,
      operationId,
      previous,
    );
    records.push(record);
    previous = sha256(JSON.stringify(record));
  }
  return Object.freeze({
    preparedVerified: records[0] ?? null,
    approvalRequested: records[1] ?? null,
    signatureReceived: records[2] ?? null,
    executionStarted: records[3] ?? null,
  });
}
