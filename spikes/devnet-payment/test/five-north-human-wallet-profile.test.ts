import { chmod, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFiveNorthHumanWalletProfile } from "../src/five-north-human-wallet-profile.js";

const FINGERPRINT = `1220${"a".repeat(64)}`;
const PARTY = `sotto-external-payer::${FINGERPRINT}`;
const SYNCHRONIZER = `global-domain::1220${"b".repeat(64)}`;
const TOPOLOGY_HASH = Buffer.from([
  0x12,
  0x20,
  ...new Uint8Array(32).fill(7),
]).toString("base64");
let directory: string;
let keyFile: string;

function journal() {
  return {
    fingerprint: FINGERPRINT,
    partyId: PARTY,
    schema: "sotto-external-payer-onboarding-v1",
    startedAt: "2026-07-16T10:00:00.000Z",
    state: "execution-started",
    synchronizerId: SYNCHRONIZER,
    topologyHash: TOPOLOGY_HASH,
  };
}

async function writeJournal(text = `${JSON.stringify(journal())}\n`) {
  await writeFile(`${keyFile}.onboarding.json`, text, { mode: 0o600 });
}

beforeEach(async () => {
  directory = await realpath(
    await mkdtemp(join(tmpdir(), "sotto-human-wallet-")),
  );
  await chmod(directory, 0o700);
  keyFile = join(directory, "payer.key");
  await writeFile(keyFile, new Uint8Array(64), { mode: 0o600 });
  await writeJournal();
});

afterEach(async () => rm(directory, { force: true, recursive: true }));

describe("Five North human wallet profile", () => {
  it("binds the exact owner-only journal to the isolated public identity", async () => {
    const readIdentity = vi.fn(async () => ({
      fingerprint: FINGERPRINT as `1220${string}`,
      publicKey: Buffer.alloc(32, 9).toString("base64"),
      publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW" as const,
    }));
    const signal = new AbortController().signal;

    await expect(
      readFiveNorthHumanWalletProfile(
        { keyFile, signal, workspaceRoot: "/workspace" },
        { readIdentity },
      ),
    ).resolves.toEqual({
      fingerprint: FINGERPRINT,
      party: PARTY,
      publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
      synchronizerId: SYNCHRONIZER,
      topologyHash: TOPOLOGY_HASH,
    });
    expect(readIdentity).toHaveBeenCalledWith({
      expectedFingerprint: FINGERPRINT,
      keyFile,
      signal,
      workspaceRoot: "/workspace",
    });
  });

  it("rejects a non-owner-only journal before reading the wallet key", async () => {
    await chmod(`${keyFile}.onboarding.json`, 0o644);
    const readIdentity = vi.fn();

    await expect(
      readFiveNorthHumanWalletProfile(
        {
          keyFile,
          signal: new AbortController().signal,
          workspaceRoot: "/workspace",
        },
        { readIdentity },
      ),
    ).rejects.toThrow(/owner-only/iu);
    expect(readIdentity).not.toHaveBeenCalled();
  });

  it("rejects duplicate-key or otherwise noncanonical journal bytes", async () => {
    const value = journal();
    await writeJournal(
      `{"fingerprint":"${FINGERPRINT}","fingerprint":"${FINGERPRINT}","partyId":"${PARTY}","schema":"${value.schema}","startedAt":"${value.startedAt}","state":"${value.state}","synchronizerId":"${SYNCHRONIZER}","topologyHash":"${TOPOLOGY_HASH}"}\n`,
    );

    await expect(
      readFiveNorthHumanWalletProfile(
        {
          keyFile,
          signal: new AbortController().signal,
          workspaceRoot: "/workspace",
        },
        { readIdentity: vi.fn() },
      ),
    ).rejects.toThrow(/canonical/iu);
  });

  it("rejects a wallet fingerprint that drifts from its onboarding record", async () => {
    await expect(
      readFiveNorthHumanWalletProfile(
        {
          keyFile,
          signal: new AbortController().signal,
          workspaceRoot: "/workspace",
        },
        {
          readIdentity: async () => ({
            fingerprint: `1220${"d".repeat(64)}` as `1220${string}`,
            publicKey: Buffer.alloc(32, 9).toString("base64"),
            publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
          }),
        },
      ),
    ).rejects.toThrow(/fingerprint/iu);
  });

  it("rejects a non-SHA-256 topology hash before reading the wallet key", async () => {
    const value = {
      ...journal(),
      topologyHash: Buffer.alloc(34, 7).toString("base64"),
    };
    await writeJournal(`${JSON.stringify(value)}\n`);
    const readIdentity = vi.fn();

    await expect(
      readFiveNorthHumanWalletProfile(
        {
          keyFile,
          signal: new AbortController().signal,
          workspaceRoot: "/workspace",
        },
        { readIdentity },
      ),
    ).rejects.toThrow(/canonical|topology/iu);
    expect(readIdentity).not.toHaveBeenCalled();
  });

  it.each(["\0", "\ud800"])(
    "rejects unsafe journal text %j before reading the wallet key",
    async (unsafe) => {
      const value = {
        ...journal(),
        partyId: `sotto-${unsafe}::${FINGERPRINT}`,
      };
      await writeJournal(`${JSON.stringify(value)}\n`);
      const readIdentity = vi.fn();

      await expect(
        readFiveNorthHumanWalletProfile(
          {
            keyFile,
            signal: new AbortController().signal,
            workspaceRoot: "/workspace",
          },
          { readIdentity },
        ),
      ).rejects.toThrow();
      expect(readIdentity).not.toHaveBeenCalled();
    },
  );
});
