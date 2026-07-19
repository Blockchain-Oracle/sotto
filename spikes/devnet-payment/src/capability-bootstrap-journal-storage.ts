import { randomBytes } from "node:crypto";
import { constants, link, lstat, mkdir, open, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

const CAPABILITY_DIRECTORY = "devnet-capability-bootstrap";
const DIRECTORY_PATTERN = /^devnet-[a-z0-9-]{1,64}$/u;
const MAXIMUM_RECORD_BYTES = 65_536;
const RECORD_NAME_PATTERN =
  /^(?:\d{2}-[a-z][a-z-]{0,63}\.json|\.(?:gate|lease|lease-owner-[0-9a-f]{32}\.json))$/u;

function journalRecordName(value: string): string {
  if (!RECORD_NAME_PATTERN.test(value)) {
    throw new Error("bootstrap journal record name is invalid");
  }
  return value;
}

export type OwnerOnlyDirectoryOperations = Readonly<{
  lstat: (path: string) => Promise<
    Readonly<{
      isDirectory: () => boolean;
      isSymbolicLink: () => boolean;
      mode: number;
      uid: number;
    }>
  >;
  mkdir: (path: string, options: { mode: number }) => Promise<void>;
  syncDirectory: (path: string) => Promise<void>;
}>;

const realDirectoryOperations: OwnerOnlyDirectoryOperations = {
  lstat,
  mkdir: async (path, options) => {
    await mkdir(path, options);
  },
  syncDirectory: syncCapabilityBootstrapJournalDirectory,
};

function isAlreadyExists(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  );
}

async function ensureDirectory(
  path: string,
  ownerOnly: boolean,
  operations: OwnerOnlyDirectoryOperations,
): Promise<boolean> {
  let created = false;
  try {
    await operations.mkdir(path, { mode: 0o700 });
    created = true;
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
  }
  const status = await operations.lstat(path);
  const currentUid =
    typeof process.getuid === "function" ? process.getuid() : status.uid;
  const forbiddenMode = ownerOnly ? 0o077 : 0o022;
  if (
    !status.isDirectory() ||
    status.isSymbolicLink() ||
    status.uid !== currentUid ||
    (status.mode & forbiddenMode) !== 0
  ) {
    throw new Error(
      ownerOnly
        ? "bootstrap journal directory must be owner-only"
        : "bootstrap journal parent must be owner-controlled",
    );
  }
  return created;
}

export async function prepareOwnerOnlyBootstrapJournalDirectory(
  workspaceRoot: string,
  directoryName: string,
  operations: OwnerOnlyDirectoryOperations = realDirectoryOperations,
): Promise<string> {
  if (!isAbsolute(workspaceRoot)) {
    throw new Error("bootstrap workspace root must be absolute");
  }
  if (!DIRECTORY_PATTERN.test(directoryName)) {
    throw new Error("bootstrap journal directory name is invalid");
  }
  const parent = join(workspaceRoot, "tmp");
  if (await ensureDirectory(parent, false, operations)) {
    await operations.syncDirectory(workspaceRoot);
  }
  const directory = join(parent, directoryName);
  await ensureDirectory(directory, true, operations);
  await operations.syncDirectory(parent);
  return directory;
}

export function prepareCapabilityBootstrapJournalDirectory(
  workspaceRoot: string,
): Promise<string> {
  return prepareOwnerOnlyBootstrapJournalDirectory(
    workspaceRoot,
    CAPABILITY_DIRECTORY,
  );
}

export async function syncCapabilityBootstrapJournalDirectory(
  directory: string,
): Promise<void> {
  const handle = await open(directory, constants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function writeExclusiveCapabilityBootstrapJson(
  directory: string,
  name: string,
  value: unknown,
): Promise<void> {
  journalRecordName(name);
  const source = `${JSON.stringify(value)}\n`;
  if (new TextEncoder().encode(source).byteLength > MAXIMUM_RECORD_BYTES) {
    throw new Error("bootstrap journal record exceeds byte limit");
  }
  const temporary = join(
    directory,
    `.${name}.${randomBytes(16).toString("hex")}.tmp`,
  );
  const destination = join(directory, name);
  const handle = await open(
    temporary,
    constants.O_CREAT |
      constants.O_EXCL |
      constants.O_WRONLY |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(source, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(temporary, destination);
    await syncCapabilityBootstrapJournalDirectory(directory);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

export async function readCapabilityBootstrapJournalJson(
  directory: string,
  name: string,
): Promise<unknown> {
  journalRecordName(name);
  const handle = await open(
    join(directory, name),
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const status = await handle.stat();
    if (
      !status.isFile() ||
      (status.mode & 0o077) !== 0 ||
      status.size <= 0 ||
      status.size > MAXIMUM_RECORD_BYTES
    ) {
      throw new Error("bootstrap journal record is not owner-only and bounded");
    }
    return JSON.parse(await handle.readFile("utf8")) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("bootstrap journal record is not valid JSON", {
        cause: error,
      });
    }
    throw error;
  } finally {
    await handle.close();
  }
}
