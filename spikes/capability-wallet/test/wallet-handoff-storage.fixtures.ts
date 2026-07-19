import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWalletHandoffStorage } from "../src/wallet-handoff-storage.js";

export const START = Date.parse("2026-07-15T10:00:00.000Z");

export async function walletStorageFixture() {
  const parent = await realpath(
    await mkdtemp(join(tmpdir(), "sotto-wallet-handoff-")),
  );
  const rootDirectory = join(parent, ".capability-wallet");
  let now = START;
  const storage = await createWalletHandoffStorage({
    now: () => now,
    rootDirectory,
  });
  return {
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
    artifactPath: (id: string, kind: "key" | "request" | "response") =>
      join(rootDirectory, `${id}.${kind}.json`),
    cleanup: () => rm(parent, { force: true, recursive: true }),
    parent,
    rootDirectory,
    storage,
  };
}

export function artifact<
  const Kind extends "key" | "request" | "response" = "request",
>(kind: Kind = "request" as Kind, id = "handoff-1") {
  return {
    expiresAt: "2026-07-15T10:00:01.000Z",
    id,
    kind,
    payload: { z: "prepared-private", a: 1 },
  } as const;
}
