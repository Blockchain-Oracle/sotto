import { openSync, closeSync, rmSync, writeSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { externalPayerTapJournalPath } from "@sotto/capability-wallet";
import type { FiveNorthRunner } from "../src/five-north.js";
import { createSignerKeystore } from "../src/keystore.js";
import { createWalletDirectory } from "../src/wallets.js";
import {
  bearer,
  buildServer,
  provisionWallet,
  temporaryKeyDirectory,
} from "./fixtures.js";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

function fakeRunner(overrides: Partial<FiveNorthRunner> = {}): {
  calls: { onboard: number; tap: number };
  runner: FiveNorthRunner;
} {
  const calls = { onboard: 0, tap: 0 };
  const runner: FiveNorthRunner = {
    onboard: async (input) => {
      calls.onboard += 1;
      return {
        partyId: `${input.partyHint}::${input.expectedFingerprint}`,
        synchronizerId: "sync::test",
      };
    },
    tap: async (input) => {
      calls.tap += 1;
      return {
        amount: "1.0000000000",
        submissionId: `sotto-external-payer-tap-v1-${"a".repeat(64)}`,
        updateId: `1220update-${input.payerParty.slice(0, 8)}`,
      };
    },
    ...overrides,
  };
  return { calls, runner };
}

async function harness(runner?: FiveNorthRunner) {
  const directory = temporaryKeyDirectory();
  const server = await buildServer(
    directory,
    runner === undefined ? {} : { fiveNorth: runner },
  );
  cleanups.push(async () => {
    await server.close();
    rmSync(directory, { force: true, recursive: true });
  });
  return { directory, server };
}

describe("wallet onboarding", () => {
  it("honestly refuses live operations when Five North is absent", async () => {
    const { server } = await harness();
    const onboard = await server.inject({
      headers: bearer(),
      method: "POST",
      payload: { ownerHint: "judge one" },
      url: "/internal/wallets",
    });
    expect(onboard.statusCode).toBe(503);
    expect(onboard.json()).toEqual({ error: "five-north-unavailable" });
    const fund = await server.inject({
      headers: bearer(),
      method: "POST",
      url: `/internal/wallets/${"0".repeat(32)}/fund`,
    });
    expect(fund.statusCode).toBe(503);
    expect(fund.json()).toEqual({ error: "five-north-unavailable" });
  });

  it("onboards a wallet and persists the party before responding", async () => {
    const { runner } = fakeRunner();
    const { directory, server } = await harness(runner);
    const response = await server.inject({
      headers: bearer(),
      method: "POST",
      payload: { ownerHint: "Judge One" },
      url: "/internal/wallets",
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      fingerprint: string;
      partyId: string;
      walletId: string;
    };
    expect(body.fingerprint).toMatch(/^1220[0-9a-f]{64}$/u);
    expect(body.partyId).toContain("sotto-judge-one-");
    const wallets = await createWalletDirectory(directory);
    const record = await wallets.read(body.walletId);
    expect(record?.state).toBe("onboarded");
    expect(record?.partyId).toBe(body.partyId);
    expect(record?.synchronizerId).toBe("sync::test");
  });

  it("persists an uncertain state when onboarding fails after start", async () => {
    const { runner } = fakeRunner({
      onboard: () => Promise.reject(new Error("execution uncertain")),
    });
    const { directory, server } = await harness(runner);
    const response = await server.inject({
      headers: bearer(),
      method: "POST",
      payload: { ownerHint: "judge two" },
      url: "/internal/wallets",
    });
    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ error: "five-north-onboarding-failed" });
    const wallets = await createWalletDirectory(directory);
    const keystore = await createSignerKeystore(directory);
    // Exactly one wallet record exists and it landed in the uncertain state.
    const { readdirSync } = await import("node:fs");
    const names = readdirSync(`${directory}/wallets`);
    expect(names).toHaveLength(1);
    const record = await wallets.read(String(names[0]).replace(".json", ""));
    expect(record?.state).toBe("onboarding-uncertain");
    expect(() => keystore.keyFilePath(record!.walletId)).not.toThrow();
  });
});

describe("wallet funding", () => {
  it("taps once and reports the update ID", async () => {
    const { calls, runner } = fakeRunner();
    const { directory, server } = await harness(runner);
    const wallet = await provisionWallet(directory);
    const response = await server.inject({
      headers: bearer(),
      method: "POST",
      url: `/internal/wallets/${wallet.walletId}/fund`,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { amount: string; updateId: string };
    expect(body.amount).toBe("1.0000000000");
    expect(body.updateId).toContain("1220update-");
    expect(calls.tap).toBe(1);
    const wallets = await createWalletDirectory(directory);
    const record = await wallets.read(wallet.walletId);
    expect(record?.funding?.state).toBe("funded");
    expect(record?.funding?.updateId).toBe(body.updateId);
  });

  it("reports already-funded from the tap journal without re-tapping", async () => {
    const { calls, runner } = fakeRunner();
    const { directory, server } = await harness(runner);
    const wallet = await provisionWallet(directory);
    const keystore = await createSignerKeystore(directory);
    const journalPath = externalPayerTapJournalPath(
      keystore.keyFilePath(wallet.walletId),
    );
    const handle = openSync(journalPath, "wx", 0o600);
    writeSync(
      handle,
      `${JSON.stringify({
        amount: "1.0000000000",
        submissionId: `sotto-external-payer-tap-v1-${"b".repeat(64)}`,
      })}\n`,
    );
    closeSync(handle);
    const response = await server.inject({
      headers: bearer(),
      method: "POST",
      url: `/internal/wallets/${wallet.walletId}/fund`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      alreadyFunded: true,
      balance: {
        amount: "1.0000000000",
        asset: "CC",
        source: "tap-journal",
      },
    });
    expect(calls.tap).toBe(0);
  });

  it("refuses to fund a wallet that is not onboarded", async () => {
    const { runner } = fakeRunner();
    const { directory, server } = await harness(runner);
    const wallet = await provisionWallet(directory, false);
    const response = await server.inject({
      headers: bearer(),
      method: "POST",
      url: `/internal/wallets/${wallet.walletId}/fund`,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "wallet-not-onboarded" });
  });
});
