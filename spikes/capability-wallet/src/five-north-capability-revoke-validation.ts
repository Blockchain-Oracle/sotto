const FINGERPRINT = /^1220[0-9a-f]{64}$/u;
const IDENTIFIER = /^[\x21-\x7e]{1,512}$/u;
const SUBMISSION = /^sotto-capability-revoke-v1-[0-9a-f]{64}$/u;

export type RevokeDispatch = Readonly<{
  execute: (signature: string) => Promise<unknown>;
  response: Readonly<{
    hashingSchemeVersion: unknown;
    preparedTransaction: unknown;
    preparedTransactionHash: unknown;
  }>;
}>;

export type FiveNorthCapabilityRevokeRunInput = Readonly<{
  agentParty: string;
  capabilityContractId: string;
  expectedFingerprint: string;
  keyFile: string;
  payerParty: string;
  signal: AbortSignal;
  submissionId: string;
  synchronizerId: string;
}>;

export type FiveNorthCapabilityRevokeDependencies = Readonly<{
  prepareRevoke: (
    input: Readonly<{
      capabilityContractId: string;
      payerParty: string;
      signal: AbortSignal;
      submissionId: string;
      synchronizerId: string;
    }>,
  ) => Promise<RevokeDispatch>;
  recomputePreparedHash?: (
    preparedTransaction: Uint8Array,
  ) => Promise<Uint8Array>;
}>;

export function canonicalRevokeRunInput(
  input: FiveNorthCapabilityRevokeRunInput,
): FiveNorthCapabilityRevokeRunInput {
  if (
    typeof input !== "object" ||
    input === null ||
    Object.keys(input).sort().join() !==
      "agentParty,capabilityContractId,expectedFingerprint,keyFile,payerParty,signal,submissionId,synchronizerId" ||
    !IDENTIFIER.test(input.agentParty) ||
    !IDENTIFIER.test(input.capabilityContractId) ||
    !FINGERPRINT.test(input.expectedFingerprint) ||
    !input.keyFile.startsWith("/") ||
    !IDENTIFIER.test(input.payerParty) ||
    input.payerParty === input.agentParty ||
    !(input.signal instanceof AbortSignal) ||
    !SUBMISSION.test(input.submissionId) ||
    !IDENTIFIER.test(input.synchronizerId)
  ) {
    throw new Error("capability revoke execution input is invalid");
  }
  return input;
}

function base64(value: unknown, label: string, maximum: number): Buffer {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > Math.ceil((maximum * 4) / 3) + 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)
  ) {
    throw new Error(`capability revoke ${label} is invalid`);
  }
  const bytes = Buffer.from(value, "base64");
  if (
    bytes.length === 0 ||
    bytes.length > maximum ||
    bytes.toString("base64") !== value
  ) {
    bytes.fill(0);
    throw new Error(`capability revoke ${label} is invalid`);
  }
  return bytes;
}

export function decodeRevokeDispatch(dispatch: RevokeDispatch) {
  if (
    typeof dispatch !== "object" ||
    dispatch === null ||
    typeof dispatch.execute !== "function" ||
    dispatch.response.hashingSchemeVersion !== "HASHING_SCHEME_VERSION_V2"
  ) {
    throw new Error("capability revoke prepared response is invalid");
  }
  const prepared = base64(
    dispatch.response.preparedTransaction,
    "prepared transaction",
    2 * 1024 * 1024,
  );
  const participantHash = base64(
    dispatch.response.preparedTransactionHash,
    "prepared hash",
    32,
  );
  if (participantHash.length !== 32) {
    prepared.fill(0);
    participantHash.fill(0);
    throw new Error("capability revoke prepared hash is invalid");
  }
  return { participantHash, prepared };
}

export function canonicalRevokeCompletion(value: unknown) {
  if (typeof value !== "object" || value === null) {
    throw new Error("capability revoke execution outcome is uncertain");
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join() !== "completionOffset,updateId" ||
    !Number.isSafeInteger(record.completionOffset) ||
    (record.completionOffset as number) < 0 ||
    typeof record.updateId !== "string" ||
    !IDENTIFIER.test(record.updateId)
  ) {
    throw new Error("capability revoke execution outcome is uncertain");
  }
  return {
    completionOffset: record.completionOffset as number,
    updateId: record.updateId,
  };
}
