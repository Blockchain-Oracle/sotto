import type { ReferenceWalletPublicIdentity } from "@sotto/capability-wallet";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { readReferenceWalletChildIdentity } from "./reference-wallet-child-process.js";

const JOURNAL_SCHEMA = "sotto-external-payer-onboarding-v1";
const JOURNAL_STATE = "execution-started";
const MAX_JOURNAL_BYTES = 4_096;
const FINGERPRINT = /^1220[0-9a-f]{64}$/u;
const PARTY = /^sotto-[^\s:]{1,128}::1220[0-9a-f]{64}$/u;
const SYNCHRONIZER = /^[^\s:]{1,128}::1220[0-9a-f]{64}$/u;
const BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

export type FiveNorthHumanWalletProfile = Readonly<{
  fingerprint: `1220${string}`;
  party: string;
  publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW";
  synchronizerId: string;
  topologyHash: string;
}>;

type ProfileInput = Readonly<{
  keyFile: string;
  signal: AbortSignal;
  workspaceRoot: string;
}>;

type Dependencies = Readonly<{
  readIdentity: (input: {
    expectedFingerprint: string;
    keyFile: string;
    signal: AbortSignal;
    workspaceRoot: string;
  }) => Promise<ReferenceWalletPublicIdentity>;
}>;

type Journal = Readonly<{
  fingerprint: `1220${string}`;
  partyId: string;
  schema: typeof JOURNAL_SCHEMA;
  startedAt: string;
  state: typeof JOURNAL_STATE;
  synchronizerId: string;
  topologyHash: string;
}>;

function active(signal: unknown): asserts signal is AbortSignal {
  if (!(signal instanceof AbortSignal)) {
    throw new Error("human wallet profile signal is invalid");
  }
  if (signal.aborted) throw new Error("human wallet profile cancelled");
}

function text(value: unknown, label: string, maximum = 1_024): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.trim() !== value ||
    Buffer.byteLength(value, "utf8") > maximum ||
    unsafeText(value)
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function unsafeText(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function sha256Multihash(value: string): boolean {
  if (!BASE64.test(value)) return false;
  const decoded = Buffer.from(value, "base64");
  return (
    decoded.byteLength === 34 &&
    decoded[0] === 0x12 &&
    decoded[1] === 0x20 &&
    decoded.toString("base64") === value
  );
}

function canonicalTime(value: unknown): string {
  const result = text(value, "human wallet onboarding time", 64);
  const milliseconds = Date.parse(result);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== result
  ) {
    throw new Error("human wallet onboarding time is invalid");
  }
  return result;
}

function parseJournal(bytes: Uint8Array): Journal {
  let source: string;
  let value: unknown;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    value = JSON.parse(source) as unknown;
  } catch {
    throw new Error("human wallet onboarding journal is not valid JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("human wallet onboarding journal is invalid");
  }
  const record = value as Record<string, unknown>;
  const fingerprint = text(record.fingerprint, "human wallet fingerprint", 68);
  const partyId = text(record.partyId, "human wallet Party", 512);
  const synchronizerId = text(
    record.synchronizerId,
    "human wallet synchronizer",
    512,
  );
  const topologyHash = text(record.topologyHash, "human wallet topology hash");
  const journal = {
    fingerprint,
    partyId,
    schema: record.schema,
    startedAt: canonicalTime(record.startedAt),
    state: record.state,
    synchronizerId,
    topologyHash,
  };
  if (
    record.schema !== JOURNAL_SCHEMA ||
    record.state !== JOURNAL_STATE ||
    !FINGERPRINT.test(fingerprint) ||
    !PARTY.test(partyId) ||
    !partyId.endsWith(`::${fingerprint}`) ||
    !SYNCHRONIZER.test(synchronizerId) ||
    !sha256Multihash(topologyHash) ||
    `${JSON.stringify(journal)}\n` !== source
  ) {
    throw new Error("human wallet onboarding journal is not canonical");
  }
  return journal as Journal;
}

async function readJournal(keyFile: string): Promise<Journal> {
  const path = `${keyFile}.onboarding.json`;
  const directory = dirname(resolve(path));
  const directoryStatus = await lstat(directory);
  if (
    (await realpath(directory)) !== directory ||
    !directoryStatus.isDirectory() ||
    (directoryStatus.mode & 0o777) !== 0o700 ||
    (typeof process.getuid === "function" &&
      directoryStatus.uid !== process.getuid())
  ) {
    throw new Error("human wallet journal directory must be owner-only");
  }
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const status = await handle.stat();
    if (
      !status.isFile() ||
      status.nlink !== 1 ||
      (status.mode & 0o777) !== 0o600 ||
      status.size < 1 ||
      status.size > MAX_JOURNAL_BYTES ||
      (typeof process.getuid === "function" && status.uid !== process.getuid())
    ) {
      throw new Error("human wallet onboarding journal must be owner-only");
    }
    return parseJournal(await handle.readFile());
  } finally {
    await handle.close();
  }
}

export async function readFiveNorthHumanWalletProfile(
  input: ProfileInput,
  dependencies: Dependencies = {
    readIdentity: readReferenceWalletChildIdentity,
  },
): Promise<FiveNorthHumanWalletProfile> {
  if (!isAbsolute(input.keyFile) || !isAbsolute(input.workspaceRoot)) {
    throw new Error("human wallet profile paths must be absolute");
  }
  active(input.signal);
  const journal = await readJournal(input.keyFile);
  active(input.signal);
  const identity = await dependencies.readIdentity({
    expectedFingerprint: journal.fingerprint,
    keyFile: input.keyFile,
    signal: input.signal,
    workspaceRoot: input.workspaceRoot,
  });
  active(input.signal);
  if (
    identity.fingerprint !== journal.fingerprint ||
    identity.publicKeyFormat !== "PUBLIC_KEY_FORMAT_RAW" ||
    Buffer.from(identity.publicKey, "base64").byteLength !== 32
  ) {
    throw new Error(
      "human wallet public fingerprint does not match onboarding",
    );
  }
  return Object.freeze({
    fingerprint: journal.fingerprint,
    party: journal.partyId,
    publicKeyFormat: identity.publicKeyFormat,
    synchronizerId: journal.synchronizerId,
    topologyHash: journal.topologyHash,
  });
}
