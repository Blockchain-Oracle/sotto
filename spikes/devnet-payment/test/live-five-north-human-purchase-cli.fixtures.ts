import { expect, vi } from "vitest";
import type {
  LiveFiveNorthHumanPurchaseCliDependencies,
  LiveFiveNorthHumanPurchaseCliPlatform,
} from "../src/live-five-north-human-purchase-cli.js";

export const SOURCE_COMMIT = "a".repeat(40);
export const OPERATION = `sha256:${"b".repeat(64)}`;
export const PROVIDER = `sotto-provider::1220${"c".repeat(64)}`;
export const UPDATE = `1220${"d".repeat(64)}`;
export const WORKSPACE = "/workspace";
export const network = Object.freeze({
  ledgerUrl: "https://ledger.example",
});

export function humanPurchaseCliHarness() {
  const events: string[] = [];
  const lines: string[] = [];
  const listeners = new Map<string, () => void>();
  const environment: Record<string, string | undefined> = {};
  const platform: LiveFiveNorthHumanPurchaseCliPlatform = {
    arguments: ["start"],
    environment,
    loadEnvironment: (path) => {
      events.push(`load:${path}`);
      environment.PROVIDER_PARTY = PROVIDER;
    },
    onSignal: (name, listener) => {
      events.push(`on:${name}`);
      listeners.set(name, listener);
    },
    removeSignal: (name) => {
      events.push(`off:${name}`);
      listeners.delete(name);
    },
    workspaceRoot: WORKSPACE,
    writeStdout: (line) => {
      events.push("stdout");
      lines.push(line);
    },
  };
  const dependencies: LiveFiveNorthHumanPurchaseCliDependencies = {
    readCleanSourceCheckpoint: vi.fn(async () => {
      events.push("checkpoint");
      expect(environment.PROVIDER_PARTY).toBeUndefined();
      return SOURCE_COMMIT;
    }),
    readNetwork: vi.fn(() => {
      events.push("network");
      return network as never;
    }),
    readProviderParty: vi.fn((value) => {
      events.push("provider");
      expect(value).toBe(PROVIDER);
      return PROVIDER;
    }),
    recover: vi.fn(async () => {
      throw new Error("recovery must not run");
    }),
    start: vi.fn(async (input) => {
      events.push("start");
      await input.onJournalInitialized({ operationId: OPERATION });
      events.push("after-journal");
      return {
        completion: { completionOffset: 44, updateId: UPDATE },
        delivery: {
          bodyByteCount: 94,
          bodySha256: `sha256:${"e".repeat(64)}`,
          status: 200,
          privateBody: "must-not-leak",
        },
        operationId: OPERATION,
        privateKey: "must-not-leak",
        signature: "must-not-leak",
        status: "paid-resource-delivered",
      } as never;
    }),
  };
  return { dependencies, events, lines, listeners, platform };
}
