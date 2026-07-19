import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const executeFile = promisify(execFile);
const cleanups: Array<() => Promise<void>> = [];
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sdkUrl = pathToFileURL(
  resolve(packageRoot, "node_modules/@canton-network/wallet-sdk/dist/index.js"),
).href;
const coreUrl = pathToFileURL(
  resolve(packageRoot, "src/five-north-external-payer.ts"),
).href;

async function keyFile(): Promise<string> {
  const parent = await realpath(
    await mkdtemp(join(tmpdir(), "sotto-external-payer-process-")),
  );
  cleanups.push(() => rm(parent, { force: true, recursive: true }));
  const directory = join(parent, "wallet-owned");
  await mkdir(directory, { mode: 0o700 });
  return join(directory, "payer.key");
}

const childProgram = String.raw`
  const path = process.argv[1];
  const { SDK } = await import(process.argv[2]);
  const { runFiveNorthExternalPayer } = await import(process.argv[3]);
  const offline = SDK.createOffline();
  const transactions = ["AA=="];
  const multiHash = await offline.utils.hash.topologyTransaction(transactions);
  let publicKey = "";
  const result = await runFiveNorthExternalPayer({
    keyFile: path,
    mode: "dry-run",
    partyHint: "sotto-external-payer",
    signal: new AbortController().signal,
    synchronizerId: "global-domain::1220sync",
  }, {
    createExternalParty: (candidate) => {
      publicKey = candidate;
      return {
        execute: async () => { throw new Error("execute must not run"); },
        topology: async () => {
          const fingerprint = await offline.keys.fingerprint(publicKey);
          return {
            multiHash,
            partyId: "sotto-external-payer::" + fingerprint,
            publicKeyFingerprint: fingerprint,
            topologyTransactions: transactions,
          };
        },
      };
    },
  });
  process.stdout.write(JSON.stringify(result));
`;

export function registerFiveNorthExternalPayerProcessCases(): void {
  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  describe("Five North external payer process isolation", () => {
    it("returns only redacted metadata from the wallet child process", async () => {
      const path = await keyFile();
      const { stderr, stdout } = await executeFile(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "--eval",
          childProgram,
          path,
          sdkUrl,
          coreUrl,
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          maxBuffer: 16_384,
          timeout: 5_000,
        },
      );

      expect(stderr).toBe("");
      expect(JSON.parse(stdout)).toEqual({
        fingerprint: expect.stringMatching(/^1220[0-9a-f]{64}$/u),
        mode: "dry-run",
        mutationSubmitted: false,
        partyHint: "sotto-external-payer",
        proposedPartyId: expect.stringMatching(/^sotto-external-payer::1220/u),
        synchronizerId: "global-domain::1220sync",
        version: "sotto-five-north-external-payer-v1",
      });
      expect(stdout).not.toMatch(
        /private|publicKey|signature|topology|multiHash/iu,
      );
      const status = await lstat(path);
      expect(status.mode & 0o777).toBe(0o600);
      expect(status.size).toBe(64);
    });
  });
}
