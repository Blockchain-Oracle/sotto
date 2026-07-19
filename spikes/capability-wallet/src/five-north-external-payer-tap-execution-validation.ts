const FINGERPRINT = /^1220[0-9a-f]{64}$/u;
const PARTY = /^[\x21-\x7e]{1,512}$/u;
const SUBMISSION = /^sotto-external-payer-tap-v1-[0-9a-f]{64}$/u;
const IDENTIFIER = /^[\x21-\x7e]{1,512}$/u;
const MAX_PREPARED_BYTES = 2 * 1024 * 1024;

export type TapPrepareResponse = Readonly<{
  hashingSchemeVersion: unknown;
  preparedTransaction: unknown;
  preparedTransactionHash: unknown;
}>;

export type TapDispatch = Readonly<{
  execute: (signature: string) => Promise<unknown>;
  response: TapPrepareResponse;
}>;

export type FiveNorthExternalPayerTapRunInput = Readonly<{
  amount: string;
  expectedFingerprint: string;
  keyFile: string;
  payerParty: string;
  signal: AbortSignal;
  submissionId: string;
  synchronizerId: string;
}>;

export type FiveNorthExternalPayerTapRunDependencies = Readonly<{
  prepareTap: (
    input: Readonly<{
      amount: string;
      payerParty: string;
      signal: AbortSignal;
      submissionId: string;
      synchronizerId: string;
    }>,
  ) => Promise<TapDispatch>;
  recomputePreparedHash?: (
    preparedTransaction: Uint8Array,
  ) => Promise<Uint8Array>;
}>;

export function canonicalTapExecutionInput(
  input: FiveNorthExternalPayerTapRunInput,
): FiveNorthExternalPayerTapRunInput {
  if (
    typeof input !== "object" ||
    input === null ||
    Object.keys(input).sort().join() !==
      "amount,expectedFingerprint,keyFile,payerParty,signal,submissionId,synchronizerId" ||
    input.amount !== "1.0000000000" ||
    !FINGERPRINT.test(input.expectedFingerprint) ||
    !input.keyFile.startsWith("/") ||
    !PARTY.test(input.payerParty) ||
    !(input.signal instanceof AbortSignal) ||
    !SUBMISSION.test(input.submissionId) ||
    !IDENTIFIER.test(input.synchronizerId)
  ) {
    throw new Error("external payer tap execution input is invalid");
  }
  return input;
}

function canonicalBase64(
  value: unknown,
  label: string,
  maximum: number,
): Buffer {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > Math.ceil((maximum * 4) / 3) + 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)
  ) {
    throw new Error(`external payer tap ${label} is invalid`);
  }
  const bytes = Buffer.from(value, "base64");
  if (
    bytes.length === 0 ||
    bytes.length > maximum ||
    bytes.toString("base64") !== value
  ) {
    bytes.fill(0);
    throw new Error(`external payer tap ${label} is invalid`);
  }
  return bytes;
}

export function decodeTapPreparedResponse(dispatch: TapDispatch) {
  if (
    typeof dispatch !== "object" ||
    dispatch === null ||
    typeof dispatch.execute !== "function" ||
    typeof dispatch.response !== "object" ||
    dispatch.response === null ||
    dispatch.response.hashingSchemeVersion !== "HASHING_SCHEME_VERSION_V2"
  ) {
    throw new Error("external payer tap prepared response is invalid");
  }
  const prepared = canonicalBase64(
    dispatch.response.preparedTransaction,
    "prepared transaction",
    MAX_PREPARED_BYTES,
  );
  const participantHash = canonicalBase64(
    dispatch.response.preparedTransactionHash,
    "prepared hash",
    32,
  );
  if (participantHash.length !== 32) {
    prepared.fill(0);
    participantHash.fill(0);
    throw new Error("external payer tap prepared hash is invalid");
  }
  return { participantHash, prepared };
}

export function canonicalTapCompletion(value: unknown) {
  if (typeof value !== "object" || value === null) {
    throw new Error("external payer tap execution outcome is uncertain");
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join() !== "completionOffset,updateId" ||
    !Number.isSafeInteger(record.completionOffset) ||
    (record.completionOffset as number) < 0 ||
    typeof record.updateId !== "string" ||
    !IDENTIFIER.test(record.updateId)
  ) {
    throw new Error("external payer tap execution outcome is uncertain");
  }
  return {
    completionOffset: record.completionOffset as number,
    updateId: record.updateId,
  };
}
