import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, open, realpath, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const SCHEMA = "sotto-external-payer-tap-journal-v1";
const MAX_BYTES = 4_096;
const FLAGS =
  constants.O_WRONLY |
  constants.O_CREAT |
  constants.O_EXCL |
  constants.O_NOFOLLOW;

type TapExecutionStart = Readonly<{
  amount: string;
  payerParty: string;
  preparedHash: string;
  submissionId: string;
  synchronizerId: string;
}>;

function code(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

export function externalPayerTapJournalPath(keyFile: string): string {
  return `${keyFile}.tap.json`;
}

async function walletDirectory(path: string): Promise<string> {
  const directory = dirname(resolve(path));
  if ((await realpath(directory)) !== directory) {
    throw new Error(
      "external payer tap journal directory must not be symbolic",
    );
  }
  const status = await lstat(directory);
  if (
    !status.isDirectory() ||
    (status.mode & 0o777) !== 0o700 ||
    (typeof process.getuid === "function" && status.uid !== process.getuid())
  ) {
    throw new Error("external payer tap journal directory must be owner-only");
  }
  return directory;
}

async function remove(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (code(error) !== "ENOENT") throw error;
  }
}

export async function requireExternalPayerTapNotSubmitted(
  keyFile: string,
): Promise<void> {
  try {
    await lstat(externalPayerTapJournalPath(keyFile));
  } catch (error) {
    if (code(error) === "ENOENT") return;
    throw error;
  }
  throw new Error("external payer tap requires reconciliation");
}

export async function markExternalPayerTapExecutionStarted(
  keyFile: string,
  input: TapExecutionStart,
): Promise<void> {
  const target = externalPayerTapJournalPath(keyFile);
  const directory = await walletDirectory(target);
  const temporary = `${target}.${process.pid}-${randomUUID()}.tmp`;
  const bytes = Buffer.from(
    `${JSON.stringify({
      ...input,
      schema: SCHEMA,
      startedAt: new Date().toISOString(),
      state: "execution-started",
    })}\n`,
    "utf8",
  );
  if (bytes.length > MAX_BYTES) {
    throw new Error("external payer tap journal record is oversized");
  }
  try {
    const handle = await open(temporary, FLAGS, 0o600);
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
      if (code(error) === "EEXIST") {
        throw new Error("external payer tap requires reconciliation", {
          cause: error,
        });
      }
      throw error;
    }
    await unlink(temporary);
    const directoryHandle = await open(
      directory,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } finally {
    bytes.fill(0);
    await remove(temporary);
  }
}
