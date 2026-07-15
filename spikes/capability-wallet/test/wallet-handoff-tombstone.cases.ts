import { readdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WALLET_HANDOFF_INCOMPLETE_TOMBSTONE_RETENTION_MS } from "../src/wallet-handoff-tombstone.js";
import {
  artifact,
  START,
  walletStorageFixture,
} from "./wallet-handoff-storage.fixtures.js";

export function registerWalletHandoffTombstoneCases(
  registerCleanup: (cleanup: () => Promise<void>) => void,
): void {
  describe("wallet handoff replay tombstones", () => {
    it("bounds retention beyond the expired signing window", async () => {
      const fixture = await walletStorageFixture();
      registerCleanup(fixture.cleanup);
      await fixture.storage.create(artifact("request"));
      await fixture.storage.claim("handoff-1", "request");
      fixture.advance(61_002);

      expect(await fixture.storage.cleanupExpired()).toEqual([
        ".claimed-handoff-1.request",
        ".used-handoff-1.request",
        "handoff-1.request.json",
      ]);
      expect(await readdir(fixture.rootDirectory)).toEqual([]);
    });

    it("conservatively cleans a crash-incomplete tombstone", async () => {
      const fixture = await walletStorageFixture();
      registerCleanup(fixture.cleanup);
      const name = ".used-crashed.request";
      const path = join(fixture.rootDirectory, name);
      await writeFile(path, "", { mode: 0o600 });
      await utimes(path, START / 1_000, START / 1_000);
      fixture.advance(WALLET_HANDOFF_INCOMPLETE_TOMBSTONE_RETENTION_MS - 1);

      expect(await fixture.storage.cleanupExpired()).toEqual([]);
      fixture.advance(2);
      expect(await fixture.storage.cleanupExpired()).toEqual([name]);
    });
  });
}
