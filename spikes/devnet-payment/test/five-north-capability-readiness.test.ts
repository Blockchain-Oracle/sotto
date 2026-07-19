import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SOTTO_CONTROL_PACKAGE_ID } from "@sotto/x402-canton";
import {
  createFiveNorthCapabilityReadinessObserver,
  readFiveNorthCapabilityReadiness,
} from "../src/five-north-capability-readiness.js";

const dso = `DSO::1220${"d".repeat(64)}`;
const synchronizerId = `global-domain::1220${"e".repeat(64)}`;
const payerParty = `sotto-payer::1220${"a".repeat(64)}`;
const agentParty = `sotto-agent::1220${"b".repeat(64)}`;
const scope = { agentParty, payerParty } as const;

function reader(overrides: Record<string, unknown> = {}) {
  return {
    readAmuletRules: vi.fn(async () => ({
      amulet_rules: {
        contract: { payload: { dso } },
        domain_id: synchronizerId,
      },
    })),
    readAuthenticatedUserId: vi.fn(async () => "ledger-user-6"),
    readPackagePresence: vi.fn(async () => ({
      archivePayloadSha256: SOTTO_CONTROL_PACKAGE_ID,
      packageId: SOTTO_CONTROL_PACKAGE_ID,
    })),
    readPreferredSottoPackage: vi.fn(async () => ({
      packageReferences: [
        {
          packageId: SOTTO_CONTROL_PACKAGE_ID,
          packageName: "sotto-control",
          packageVersion: "0.2.0",
        },
      ],
      synchronizerId,
    })),
    ...overrides,
  };
}

describe("Five North capability readiness", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: Date.parse("2026-07-13T23:30:00.000Z") });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("binds exact package preference and stable identity without factory ACS", async () => {
    const source = reader();
    const observation =
      await createFiveNorthCapabilityReadinessObserver(source)(scope);

    expect(source.readPackagePresence).toHaveBeenCalledWith(
      SOTTO_CONTROL_PACKAGE_ID,
    );
    expect(source.readPreferredSottoPackage).toHaveBeenCalledWith(
      payerParty,
      agentParty,
    );
    expect(source.readAuthenticatedUserId).toHaveBeenCalledTimes(2);
    expect(Object.keys(observation).sort()).toEqual([
      "observationId",
      "observedAt",
    ]);
    expect(readFiveNorthCapabilityReadiness(observation, scope)).toEqual({
      expectedAdmin: dso,
      packageId: SOTTO_CONTROL_PACKAGE_ID,
      synchronizerId,
      userId: "ledger-user-6",
    });
    expect(() =>
      readFiveNorthCapabilityReadiness({ ...observation }, scope),
    ).toThrow("not authenticated");
    expect(source).not.toHaveProperty("readTransferFactoryContracts");
  });

  it.each([
    [
      "changed user",
      {
        readAuthenticatedUserId: vi
          .fn()
          .mockResolvedValueOnce("ledger-user-6")
          .mockResolvedValueOnce("ledger-user-7"),
      },
      /user changed/u,
    ],
    [
      "missing package",
      { readPackagePresence: vi.fn(async () => null) },
      /package/u,
    ],
    [
      "wrong preference",
      {
        readPreferredSottoPackage: vi.fn(async () => ({
          packageReferences: [],
          synchronizerId,
        })),
      },
      /preferred/u,
    ],
    [
      "wrong synchronizer",
      {
        readPreferredSottoPackage: vi.fn(async () => ({
          packageReferences: [
            {
              packageId: SOTTO_CONTROL_PACKAGE_ID,
              packageName: "sotto-control",
              packageVersion: "0.2.0",
            },
          ],
          synchronizerId: `other::1220${"1".repeat(64)}`,
        })),
      },
      /preferred/u,
    ],
  ])("rejects %s", async (_label, override, error) => {
    await expect(
      createFiveNorthCapabilityReadinessObserver(reader(override))(scope),
    ).rejects.toThrow(error);
  });

  it("expires before reuse", async () => {
    const observation =
      await createFiveNorthCapabilityReadinessObserver(reader())(scope);
    await vi.advanceTimersByTimeAsync(60_001);

    expect(() => readFiveNorthCapabilityReadiness(observation, scope)).toThrow(
      "stale",
    );
  });
});
