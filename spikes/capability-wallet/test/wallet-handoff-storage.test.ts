import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  createWalletHandoffStorage,
  MAX_WALLET_HANDOFF_JSON_BYTES,
} from "../src/wallet-handoff-storage.js";
import {
  artifact,
  walletStorageFixture,
} from "./wallet-handoff-storage.fixtures.js";
import { registerWalletHandoffStorageSecurityCases } from "./wallet-handoff-storage-security.cases.js";

const cleanups: Array<() => Promise<void>> = [];

async function fixture() {
  const value = await walletStorageFixture();
  cleanups.push(value.cleanup);
  return value;
}

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

registerWalletHandoffStorageSecurityCases((cleanup) => cleanups.push(cleanup));

describe("owner-only wallet handoff storage", () => {
  it("uses the tracked ignored directory with exact owner-only modes", async () => {
    const { artifactPath, rootDirectory, storage } = await fixture();
    const repository = fileURLToPath(new URL("../../../", import.meta.url));
    expect(await readFile(join(repository, ".gitignore"), "utf8")).toContain(
      ".capability-wallet/",
    );

    for (const kind of ["request", "response"] as const) {
      await storage.create(artifact(kind, `${kind}-1`));
      expect((await lstat(artifactPath(`${kind}-1`, kind))).mode & 0o777).toBe(
        0o600,
      );
    }
    expect((await lstat(rootDirectory)).mode & 0o777).toBe(0o700);
  });

  it("writes one canonical snapshot and never overwrites it", async () => {
    const { artifactPath, storage } = await fixture();
    const payload = { z: "prepared-private", a: 1 };
    const first = { ...artifact(), payload };
    const pending = storage.create(first);
    payload.z = "mutated-after-call";
    await pending;

    expect(await readFile(artifactPath("handoff-1", "request"), "utf8")).toBe(
      '{"expiresAt":"2026-07-15T10:00:01.000Z","id":"handoff-1","kind":"request","payload":{"a":1,"z":"prepared-private"},"version":"sotto-wallet-handoff-v1"}',
    );
    await expect(storage.create(artifact())).rejects.toThrow(
      /already exists/iu,
    );
    expect((await storage.read("handoff-1", "request")).payload).toEqual({
      a: 1,
      z: "prepared-private",
    });
  });

  it("rejects traversal, symlink roots, and symlink artifacts", async () => {
    const { artifactPath, parent, rootDirectory, storage } = await fixture();
    await expect(
      storage.create(artifact("request", "../payer")),
    ).rejects.toThrow(/identifier/iu);
    const outside = join(parent, "outside.json");
    await writeFile(outside, "outside", { mode: 0o600 });
    await symlink(outside, artifactPath("linked", "response"));
    await expect(
      storage.create(artifact("response", "linked")),
    ).rejects.toThrow();
    expect(await readFile(outside, "utf8")).toBe("outside");

    const linkedRoot = join(parent, "linked", ".capability-wallet");
    await mkdir(join(parent, "real-root"), { mode: 0o700 });
    await symlink(join(parent, "real-root"), join(parent, "linked"));
    await expect(
      createWalletHandoffStorage({ rootDirectory: linkedRoot }),
    ).rejects.toThrow(/symbolic|directory/iu);
    await expect(
      createWalletHandoffStorage({ rootDirectory: join(parent, "visible") }),
    ).rejects.toThrow(/\.capability-wallet/iu);
    expect(rootDirectory).not.toBe(linkedRoot);
  });

  it("publishes exactly one complete winner under concurrent creation", async () => {
    const { rootDirectory, storage } = await fixture();
    const results = await Promise.allSettled([
      storage.create({ ...artifact(), payload: { winner: "first" } }),
      storage.create({ ...artifact(), payload: { winner: "second" } }),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect((await storage.read("handoff-1", "request")).payload).toMatchObject({
      winner: expect.stringMatching(/^(?:first|second)$/u),
    });
    expect(await readdir(rootDirectory)).toEqual([
      ".used-handoff-1.request",
      "handoff-1.request.json",
    ]);
  });

  it("rejects group access, oversized JSON, and noncanonical records", async () => {
    const { artifactPath, rootDirectory, storage } = await fixture();
    await chmod(rootDirectory, 0o750);
    await expect(storage.create(artifact())).rejects.toThrow(/mode 0700/iu);
    await chmod(rootDirectory, 0o700);
    await expect(
      storage.create({
        ...artifact(),
        payload: { raw: "x".repeat(MAX_WALLET_HANDOFF_JSON_BYTES) },
      }),
    ).rejects.toThrow(/too large/iu);

    const path = artifactPath("manual", "response");
    await writeFile(
      path,
      '{"version":"sotto-wallet-handoff-v1","kind":"response"}',
      { mode: 0o600 },
    );
    await expect(storage.read("manual", "response")).rejects.toThrow(
      /canonical|record/iu,
    );
    await chmod(path, 0o640);
    await expect(storage.read("manual", "response")).rejects.toThrow(
      /mode 0600/iu,
    );
  });

  it("deletes expired raw artifacts and incomplete crash files", async () => {
    const { advance, artifactPath, parent, rootDirectory, storage } =
      await fixture();
    for (const kind of ["request", "response"] as const) {
      await storage.create(artifact(kind, `${kind}-expired`));
    }
    const crashedTemporary =
      ".tmp-99999999-00000000-0000-4000-8000-000000000000";
    const activeTemporary = `.tmp-${process.pid}-00000000-0000-4000-8000-000000000001`;
    await writeFile(join(rootDirectory, crashedTemporary), "partial", {
      mode: 0o600,
    });
    await writeFile(join(rootDirectory, activeTemporary), "active", {
      mode: 0o600,
    });
    const outside = join(parent, "outside-signature.json");
    await writeFile(outside, "private", { mode: 0o600 });
    await symlink(outside, artifactPath("linked", "response"));
    expect(await storage.cleanupExpired()).toEqual([
      crashedTemporary,
      "linked.response.json",
    ]);
    expect(await readdir(rootDirectory)).toContain(activeTemporary);
    expect(await readFile(outside, "utf8")).toBe("private");
    await unlink(join(rootDirectory, activeTemporary));
    advance(1_001);

    expect(await storage.cleanupExpired()).toEqual([
      "request-expired.request.json",
      "response-expired.response.json",
    ]);
    expect(await readdir(rootDirectory)).toEqual([
      ".used-request-expired.request",
      ".used-response-expired.response",
    ]);
  });
});
