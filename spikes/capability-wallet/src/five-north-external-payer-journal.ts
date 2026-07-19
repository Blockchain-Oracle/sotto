import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, open, realpath, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const JOURNAL_SUFFIX = ".onboarding.json";
const JOURNAL_SCHEMA = "sotto-external-payer-onboarding-v1";
const MAX_JOURNAL_BYTES = 4_096;
const WRITE_FLAGS =
  constants.O_WRONLY |
  constants.O_CREAT |
  constants.O_EXCL |
  constants.O_NOFOLLOW;

type ExecutionStart = Readonly<{
  fingerprint: string;
  partyId: string;
  synchronizerId: string;
  topologyHash: string;
}>;

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

export function externalPayerJournalPath(keyFile: string): string {
  return `${keyFile}${JOURNAL_SUFFIX}`;
}

async function requireDirectory(path: string): Promise<string> {
  const directory = dirname(resolve(path));
  if ((await realpath(directory)) !== directory) {
    throw new Error("external payer journal directory must not be symbolic");
  }
  const status = await lstat(directory);
  if (
    !status.isDirectory() ||
    (status.mode & 0o777) !== 0o700 ||
    (typeof process.getuid === "function" && status.uid !== process.getuid())
  ) {
    throw new Error("external payer journal directory must be owner-only");
  }
  return directory;
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(
    directory,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function removeTemporary(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
}

function reconciliationRequired(cause?: unknown): Error {
  return new Error("external payer onboarding requires reconciliation", {
    cause,
  });
}

export async function requireExternalPayerNotSubmitted(
  keyFile: string,
): Promise<void> {
  try {
    await lstat(externalPayerJournalPath(keyFile));
  } catch (error) {
    if (errorCode(error) === "ENOENT") return;
    throw error;
  }
  throw reconciliationRequired();
}

export async function markExternalPayerExecutionStarted(
  keyFile: string,
  input: ExecutionStart,
): Promise<void> {
  const target = externalPayerJournalPath(keyFile);
  const directory = await requireDirectory(target);
  const temporary = `${target}.${process.pid}-${randomUUID()}.tmp`;
  const bytes = Buffer.from(
    `${JSON.stringify({
      fingerprint: input.fingerprint,
      partyId: input.partyId,
      schema: JOURNAL_SCHEMA,
      startedAt: new Date().toISOString(),
      state: "execution-started",
      synchronizerId: input.synchronizerId,
      topologyHash: input.topologyHash,
    })}\n`,
    "utf8",
  );
  if (bytes.length > MAX_JOURNAL_BYTES) {
    throw new Error("external payer journal record is oversized");
  }
  try {
    const handle = await open(temporary, WRITE_FLAGS, 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.chmod(0o600);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await link(temporary, target);
    } catch (error) {
      if (errorCode(error) === "EEXIST") {
        throw reconciliationRequired(error);
      }
      throw error;
    }
    await unlink(temporary);
    await syncDirectory(directory);
  } finally {
    bytes.fill(0);
    await removeTemporary(temporary);
  }
}
