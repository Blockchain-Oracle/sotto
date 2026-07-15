import { readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  artifact,
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
  });
}
