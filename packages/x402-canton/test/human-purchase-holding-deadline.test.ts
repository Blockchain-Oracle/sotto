import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createHumanPurchaseHoldingObserver,
  type HumanPurchaseHoldingReader,
} from "../src/index.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  authenticatedHumanPurchaseIntent,
  humanHoldingEntry,
} from "./human-purchase-holding.fixtures.js";

describe("human holding acquisition deadline", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) });
  });

  afterEach(() => vi.useRealTimers());

  it("settles a hung Ledger-end read and never continues after a late result", async () => {
    const intent = await authenticatedHumanPurchaseIntent();
    let resolveLedgerEnd!: (value: unknown) => void;
    let signal: AbortSignal | undefined;
    const readActiveContracts = vi.fn();
    const observe = createHumanPurchaseHoldingObserver({
      readLedgerEnd: async (options) => {
        signal = options.signal;
        return await new Promise((resolve) => (resolveLedgerEnd = resolve));
      },
      readActiveContracts,
    });
    const purchase = observe(intent, { timeoutMilliseconds: 10 });
    const rejection = expect(purchase).rejects.toThrow(
      "human holding observation deadline exceeded",
    );

    await vi.advanceTimersByTimeAsync(10);
    await rejection;
    expect(signal?.aborted).toBe(true);
    resolveLedgerEnd({ offset: 42 });
    await Promise.resolve();
    await Promise.resolve();

    expect(readActiveContracts).not.toHaveBeenCalled();
  });

  it("does not parse or authenticate an ACS result arriving after timeout", async () => {
    const intent = await authenticatedHumanPurchaseIntent();
    let resolveContracts!: (value: unknown) => void;
    let propertyReads = 0;
    const readActiveContracts = vi.fn<
      HumanPurchaseHoldingReader["readActiveContracts"]
    >(async () => await new Promise((resolve) => (resolveContracts = resolve)));
    const observe = createHumanPurchaseHoldingObserver({
      readLedgerEnd: async () => ({ offset: 42 }),
      readActiveContracts,
    });
    const purchase = observe(intent, { timeoutMilliseconds: 10 });
    let failure: unknown;
    const settled = purchase.catch((error: unknown) => {
      failure = error;
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(readActiveContracts).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(10);
    await settled;
    expect(failure).toEqual(
      new Error("human holding observation deadline exceeded"),
    );
    const late = new Proxy([], {
      get(target, property, receiver) {
        if (property === "length" || property === "map") propertyReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    resolveContracts(late);
    await Promise.resolve();
    await Promise.resolve();

    expect(propertyReads).toBe(0);
  });

  it("uses a fresh Ledger end for every observation", async () => {
    const intent = await authenticatedHumanPurchaseIntent();
    let offset = 41;
    const requests: number[] = [];
    const reader: HumanPurchaseHoldingReader = {
      readLedgerEnd: async () => ({ offset: ++offset }),
      readActiveContracts: async (request) => {
        requests.push(request.activeAtOffset);
        return [humanHoldingEntry(`00holding-${offset}`, "0.3250000000")];
      },
    };
    const observe = createHumanPurchaseHoldingObserver(reader);

    await observe(intent);
    await observe(intent);

    expect(requests).toEqual([42, 43]);
  });

  it("cancels a hung read without exposing the caller reason", async () => {
    const intent = await authenticatedHumanPurchaseIntent();
    const controller = new AbortController();
    let resolveLedgerEnd!: (value: unknown) => void;
    let innerSignal: AbortSignal | undefined;
    const readActiveContracts = vi.fn();
    const observe = createHumanPurchaseHoldingObserver({
      readLedgerEnd: async ({ signal }) => {
        innerSignal = signal;
        return await new Promise((resolve) => (resolveLedgerEnd = resolve));
      },
      readActiveContracts,
    });
    const purchase = observe(intent, { signal: controller.signal });
    let failure: unknown;
    const settled = purchase.catch((error: unknown) => {
      failure = error;
    });
    await Promise.resolve();

    controller.abort("private-caller-reason");
    await settled;
    expect(failure).toEqual(new Error("human holding observation cancelled"));
    expect(String(failure)).not.toMatch(/private|reason/iu);
    expect(innerSignal?.aborted).toBe(true);
    resolveLedgerEnd({ offset: 42 });
    await Promise.resolve();
    await Promise.resolve();
    expect(readActiveContracts).not.toHaveBeenCalled();
  });

  it.each([0, 10_001])(
    "rejects invalid timeout %i before a Ledger read",
    async (timeoutMilliseconds) => {
      const intent = await authenticatedHumanPurchaseIntent();
      const readLedgerEnd = vi.fn();
      await expect(
        createHumanPurchaseHoldingObserver({
          readLedgerEnd,
          readActiveContracts: vi.fn(),
        })(intent, { timeoutMilliseconds }),
      ).rejects.toThrow(/timeout is invalid/iu);
      expect(readLedgerEnd).not.toHaveBeenCalled();
    },
  );

  it("rejects a pre-cancelled request before a Ledger read", async () => {
    const intent = await authenticatedHumanPurchaseIntent();
    const controller = new AbortController();
    controller.abort("private-caller-reason");
    const readLedgerEnd = vi.fn();

    await expect(
      createHumanPurchaseHoldingObserver({
        readLedgerEnd,
        readActiveContracts: vi.fn(),
      })(intent, { signal: controller.signal }),
    ).rejects.toThrow("human holding observation cancelled");
    expect(readLedgerEnd).not.toHaveBeenCalled();
  });

  it.each(["ledger-end", "contracts"] as const)(
    "redacts an upstream %s failure",
    async (phase) => {
      const intent = await authenticatedHumanPurchaseIntent();
      const reader: HumanPurchaseHoldingReader = {
        readLedgerEnd: async () => {
          if (phase === "ledger-end") throw new Error("private-ledger-secret");
          return { offset: 42 };
        },
        readActiveContracts: async () => {
          throw new Error("private-contract-secret");
        },
      };

      await expect(
        createHumanPurchaseHoldingObserver(reader)(intent),
      ).rejects.toThrow(`human holding ${phase} read failed`);
      await expect(
        createHumanPurchaseHoldingObserver(reader)(intent),
      ).rejects.not.toThrow(/private|secret/iu);
    },
  );
});
