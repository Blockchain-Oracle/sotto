import { randomBytes } from "node:crypto";
import { link, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import {
  prepareOwnerOnlyBootstrapJournalDirectory,
  readCapabilityBootstrapJournalJson,
  syncCapabilityBootstrapJournalDirectory,
  writeExclusiveCapabilityBootstrapJson,
} from "./capability-bootstrap-journal-storage.js";

const OPERATION_PATTERN = /^sha256:[0-9a-f]{64}$/u;

type LeaseOwner = Readonly<{
  hostname: string;
  nonce: string;
  operationId: string;
  pid: number;
  schema: string;
}>;

function parseLeaseOwner(value: unknown, expectedSchema: string): LeaseOwner {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("bootstrap lease must be an object");
  }
  const record = value as Record<string, unknown>;
  if (
    JSON.stringify(Object.keys(record).sort()) !==
      JSON.stringify(
        ["hostname", "nonce", "operationId", "pid", "schema"].sort(),
      ) ||
    record.schema !== expectedSchema ||
    typeof record.hostname !== "string" ||
    typeof record.nonce !== "string" ||
    !/^[0-9a-f]{32}$/u.test(record.nonce) ||
    typeof record.operationId !== "string" ||
    !OPERATION_PATTERN.test(record.operationId) ||
    !Number.isSafeInteger(record.pid) ||
    (record.pid as number) <= 0
  ) {
    throw new Error("bootstrap lease is invalid");
  }
  return record as LeaseOwner;
}

function processIsPossiblyAlive(owner: LeaseOwner): boolean {
  if (owner.hostname !== hostname()) return true;
  try {
    process.kill(owner.pid, 0);
    return true;
  } catch (error) {
    return !(
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ESRCH"
    );
  }
}

function isAlreadyExists(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  );
}

async function acquireGate(input: {
  directory: string;
  gateName: string;
  leaseSchema: string;
  nonce: string;
}): Promise<void> {
  const contender = join(input.directory, input.gateName);
  const gate = join(input.directory, ".gate");
  try {
    await link(contender, gate);
    return;
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
  }
  let existing: LeaseOwner;
  try {
    existing = parseLeaseOwner(
      await readCapabilityBootstrapJournalJson(input.directory, ".gate"),
      input.leaseSchema,
    );
  } catch (error) {
    throw new Error("bootstrap lease gate is held", { cause: error });
  }
  if (processIsPossiblyAlive(existing)) {
    throw new Error("bootstrap lease gate is held");
  }
  await unlink(gate);
  await syncCapabilityBootstrapJournalDirectory(input.directory);
  try {
    await link(contender, gate);
  } catch (error) {
    throw new Error("bootstrap lease gate is held", { cause: error });
  }
  const current = parseLeaseOwner(
    await readCapabilityBootstrapJournalJson(input.directory, ".gate"),
    input.leaseSchema,
  );
  if (current.nonce !== input.nonce) {
    throw new Error("bootstrap lease gate ownership changed");
  }
}

async function releaseOwnedGate(input: {
  directory: string;
  leaseSchema: string;
  nonce: string;
}): Promise<void> {
  let current: LeaseOwner;
  try {
    current = parseLeaseOwner(
      await readCapabilityBootstrapJournalJson(input.directory, ".gate"),
      input.leaseSchema,
    );
  } catch {
    // A missing, invalid, or foreign gate is never removed.
    return;
  }
  if (current.nonce !== input.nonce) return;
  await unlink(join(input.directory, ".gate"));
  await syncCapabilityBootstrapJournalDirectory(input.directory);
}

export async function withCapabilityBootstrapLease<T>(input: {
  action: (assertOwned: () => Promise<void>) => Promise<T>;
  operationId: string;
  workspaceRoot: string;
}): Promise<T> {
  return withOwnerOnlyBootstrapLease({
    ...input,
    directoryName: "devnet-capability-bootstrap",
    leaseSchema: "sotto-capability-bootstrap-lease-v1",
  });
}

export async function withOwnerOnlyBootstrapLease<T>(input: {
  action: (assertOwned: () => Promise<void>) => Promise<T>;
  directoryName: string;
  leaseSchema: string;
  operationId: string;
  workspaceRoot: string;
}): Promise<T> {
  if (!OPERATION_PATTERN.test(input.operationId)) {
    throw new Error("bootstrap lease operation ID is invalid");
  }
  if (!/^sotto-[a-z0-9-]{1,96}-lease-v1$/u.test(input.leaseSchema)) {
    throw new Error("bootstrap lease schema is invalid");
  }
  const directory = await prepareOwnerOnlyBootstrapJournalDirectory(
    input.workspaceRoot,
    input.directoryName,
  );
  const nonce = randomBytes(16).toString("hex");
  const owner: LeaseOwner = Object.freeze({
    hostname: hostname(),
    nonce,
    operationId: input.operationId,
    pid: process.pid,
    schema: input.leaseSchema,
  });
  const ownerName = `.lease-owner-${nonce}.json`;
  await writeExclusiveCapabilityBootstrapJson(directory, ownerName, owner);
  const gateName = `.lease-gate-${nonce}`;
  await link(join(directory, ownerName), join(directory, gateName));
  try {
    await acquireGate({
      directory,
      gateName,
      leaseSchema: input.leaseSchema,
      nonce,
    });
    try {
      let existing: LeaseOwner | undefined;
      try {
        existing = parseLeaseOwner(
          await readCapabilityBootstrapJournalJson(directory, ".lease"),
          input.leaseSchema,
        );
      } catch (error) {
        if (!(
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ENOENT"
        )) {
          throw error;
        }
      }
      if (existing !== undefined) {
        if (processIsPossiblyAlive(existing)) {
          throw new Error("bootstrap lease is held");
        }
        await unlink(join(directory, ".lease"));
      }
      await link(join(directory, ownerName), join(directory, ".lease"));
      await syncCapabilityBootstrapJournalDirectory(directory);
    } finally {
      await releaseOwnedGate({
        directory,
        leaseSchema: input.leaseSchema,
        nonce,
      });
    }
    const assertOwned = async (): Promise<void> => {
      const current = parseLeaseOwner(
        await readCapabilityBootstrapJournalJson(directory, ".lease"),
        input.leaseSchema,
      );
      if (current.nonce !== nonce) {
        throw new Error("bootstrap lease ownership changed");
      }
    };
    await assertOwned();
    return await input.action(assertOwned);
  } finally {
    try {
      const current = parseLeaseOwner(
        await readCapabilityBootstrapJournalJson(directory, ".lease"),
        input.leaseSchema,
      );
      if (current.nonce === nonce) {
        await unlink(join(directory, ".lease"));
        await syncCapabilityBootstrapJournalDirectory(directory);
      }
    } catch {
      // A missing or foreign lease is never removed.
    }
    await unlink(join(directory, gateName)).catch(() => undefined);
    await unlink(join(directory, ownerName)).catch(() => undefined);
    await syncCapabilityBootstrapJournalDirectory(directory).catch(
      () => undefined,
    );
  }
}
