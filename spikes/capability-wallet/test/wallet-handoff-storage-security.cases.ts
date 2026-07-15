import {
  chmod,
  link,
  mkdir,
  readFile,
  readdir,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as publicApi from "../src/index.js";
import {
  createOwnerOnlyWalletStorage,
  createWalletHandoffStorage,
} from "../src/wallet-handoff-storage.js";
import {
  artifact,
  START,
  walletStorageFixture,
} from "./wallet-handoff-storage.fixtures.js";

export function registerWalletHandoffStorageSecurityCases(
  registerCleanup: (cleanup: () => Promise<void>) => void,
): void {
  describe("wallet handoff storage security", () => {
    it("keeps wallet keys outside every Sotto-managed storage API", async () => {
      const fixture = await walletStorageFixture();
      registerCleanup(fixture.cleanup);

      expect(publicApi).not.toHaveProperty("createWalletKeyStorage");
      await expect(
        fixture.storage.create(artifact("key") as never),
      ).rejects.toThrow(/kind/iu);
      const internal = await createOwnerOnlyWalletStorage({
        allowedKinds: ["key"] as never,
        directoryName: ".capability-wallet",
        now: () => START,
        rootDirectory: fixture.rootDirectory,
      });
      await expect(
        internal.create(artifact("key", "internal-key") as never),
      ).rejects.toThrow(/kind/iu);
      expect(await readdir(fixture.rootDirectory)).toEqual([]);
    });

    it("rejects a writable symlink in any ancestor component", async () => {
      const fixture = await walletStorageFixture();
      registerCleanup(fixture.cleanup);
      const real = join(fixture.parent, "real");
      await mkdir(join(real, "nested"), { mode: 0o700, recursive: true });
      const alias = join(fixture.parent, "alias");
      await symlink(real, alias);

      await expect(
        createWalletHandoffStorage({
          rootDirectory: join(alias, "nested", ".capability-wallet"),
        }),
      ).rejects.toThrow(/symbolic ancestor/iu);
    });

    it("does not let a forbidden entry block expired artifact cleanup", async () => {
      const fixture = await walletStorageFixture();
      registerCleanup(fixture.cleanup);
      await fixture.storage.create(artifact("request", "expired"));
      const outside = join(fixture.parent, "outside");
      await mkdir(outside, { mode: 0o700 });
      const outsideFile = join(outside, "private");
      await writeFile(outsideFile, "outside", { mode: 0o600 });
      await symlink(outsideFile, fixture.artifactPath("linked", "response"));
      await writeFile(
        fixture.artifactPath("corrupt", "response"),
        '{"broken":',
        { mode: 0o600 },
      );
      await chmod(fixture.rootDirectory, 0o700);
      fixture.advance(1_001);

      expect(await fixture.storage.cleanupExpired()).toEqual([
        "corrupt.response.json",
        "expired.request.json",
        "linked.response.json",
      ]);
      expect(await readFile(outsideFile, "utf8")).toBe("outside");
    });

    it("rejects artifacts with an additional hard link", async () => {
      const fixture = await walletStorageFixture();
      registerCleanup(fixture.cleanup);
      await fixture.storage.create(artifact("request", "linked-record"));
      const duplicate = join(fixture.parent, "duplicate-link");
      await link(fixture.artifactPath("linked-record", "request"), duplicate);

      await expect(
        fixture.storage.read("linked-record", "request"),
      ).rejects.toThrow(/exactly one link/iu);
      await unlink(duplicate);
      await expect(
        fixture.storage.read("linked-record", "request"),
      ).resolves.toMatchObject({ id: "linked-record", kind: "request" });
    });

    it("rejects sparse arrays even when extra keys mask the holes", async () => {
      const fixture = await walletStorageFixture();
      registerCleanup(fixture.cleanup);
      const sparse = [1] as unknown[];
      sparse.length = 2;
      Object.defineProperty(sparse, "extra", {
        enumerable: true,
        value: "not-a-JSON-array-member",
      });

      await expect(
        fixture.storage.create({
          ...artifact("request", "sparse-json"),
          payload: sparse,
        }),
      ).rejects.toThrow(/array.*sparse/iu);
    });

    it("preserves valid artifacts when cleanup hits transient I/O", async () => {
      const fixture = await walletStorageFixture();
      registerCleanup(fixture.cleanup);
      await fixture.storage.create(artifact("request", "io-failure"));
      const failing = await createOwnerOnlyWalletStorage({
        allowedKinds: ["request"] as const,
        directoryName: ".capability-wallet",
        now: () => START,
        readBytes: async () => {
          throw Object.assign(new Error("injected read failure"), {
            code: "EIO",
          });
        },
        rootDirectory: fixture.rootDirectory,
      });

      await expect(failing.cleanupExpired()).rejects.toMatchObject({
        code: "EIO",
      });
      await expect(
        fixture.storage.read("io-failure", "request"),
      ).resolves.toMatchObject({ id: "io-failure" });
    });

    it("erases an expired artifact and permanently prevents ID reuse", async () => {
      const fixture = await walletStorageFixture();
      registerCleanup(fixture.cleanup);
      await fixture.storage.create(artifact("response"));
      fixture.advance(1_001);

      await expect(
        fixture.storage.read("handoff-1", "response"),
      ).rejects.toThrow(/expired/iu);
      await expect(
        fixture.storage.create({
          ...artifact("response"),
          expiresAt: "2026-07-15T10:00:02.000Z",
        }),
      ).rejects.toThrow(/already exists|used/iu);
      expect(await readdir(fixture.rootDirectory)).toEqual([
        ".used-handoff-1.response",
      ]);
    });
  });
}
