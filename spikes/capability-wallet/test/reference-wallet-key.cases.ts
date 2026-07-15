import {
  chmod,
  link,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readReferenceWalletPrivateKey,
  withReferenceWalletPrivateKey,
} from "../src/reference-wallet-key.js";
import { readReferenceWalletPolicy } from "../src/reference-wallet-policy.js";
import { encodeCanonicalWalletHandoffJson } from "../src/wallet-handoff-json.js";
import { referenceWalletPolicy } from "./reference-wallet.fixtures.js";

export function registerReferenceWalletKeyCases(): void {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  async function directory() {
    const parent = await realpath(
      await mkdtemp(join(tmpdir(), "sotto-reference-wallet-key-")),
    );
    cleanups.push(() => rm(parent, { force: true, recursive: true }));
    return parent;
  }

  describe("reference wallet private-key custody", () => {
    it("zeroes the exact private-key buffer after success and failure", async () => {
      const keyFile = join(await directory(), "payer.key");
      await writeFile(keyFile, Buffer.alloc(64, 9), { mode: 0o600 });
      const retained: Buffer[] = [];
      await withReferenceWalletPrivateKey(keyFile, (key) => {
        retained.push(key);
      });
      await expect(
        withReferenceWalletPrivateKey(keyFile, (key) => {
          retained.push(key);
          throw new Error("signing failed");
        }),
      ).rejects.toThrow("signing failed");
      expect(retained.every((key) => key.every((value) => value === 0))).toBe(
        true,
      );
    });

    it.each([
      ["short", 63, 0o600],
      ["long", 65, 0o600],
      ["accessible", 64, 0o640],
    ])("rejects a %s private-key file", async (_name, bytes, mode) => {
      const keyFile = join(await directory(), "payer.key");
      await writeFile(keyFile, Buffer.alloc(bytes, 7), { mode: 0o600 });
      await chmod(keyFile, mode);
      await expect(readReferenceWalletPrivateKey(keyFile)).rejects.toThrow(
        /owner-only/iu,
      );
    });

    it("rejects symlink and hard-link key paths", async () => {
      const parent = await directory();
      const keyFile = join(parent, "payer.key");
      const hardLink = join(parent, "payer-hard.key");
      const symbolicLink = join(parent, "payer-symbolic.key");
      await writeFile(keyFile, Buffer.alloc(64, 7), { mode: 0o600 });
      await link(keyFile, hardLink);
      await symlink(keyFile, symbolicLink);
      await expect(readReferenceWalletPrivateKey(keyFile)).rejects.toThrow(
        /owner-only/iu,
      );
      await expect(
        readReferenceWalletPrivateKey(symbolicLink),
      ).rejects.toBeDefined();
    });

    it("reads only a canonical owner-only wallet policy", async () => {
      const policyFile = join(await directory(), "wallet-policy.json");
      const policy = referenceWalletPolicy(`1220${"b".repeat(64)}`);
      await writeFile(policyFile, encodeCanonicalWalletHandoffJson(policy), {
        mode: 0o600,
      });
      await expect(readReferenceWalletPolicy(policyFile)).resolves.toEqual(
        policy,
      );
      await chmod(policyFile, 0o640);
      await expect(readReferenceWalletPolicy(policyFile)).rejects.toThrow(
        /owner-only/iu,
      );
    });
  });
}
