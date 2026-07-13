import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FIVE_NORTH_TRANSFER_FACTORY_IMPLEMENTATION_ID,
  SOTTO_CONTROL_PACKAGE_ID,
} from "@sotto/x402-canton";
import {
  buildFiveNorthCapabilityBootstrap,
  createFiveNorthCapabilityAuthorityObserver,
} from "../src/five-north-capability-authority.js";
import { transferFactoryContractsBody } from "../src/five-north-prepare-requests.js";

const dso = `DSO::1220${"d".repeat(64)}`;
const synchronizerId = `global-domain::1220${"e".repeat(64)}`;
const factoryContractId = "00external-party-amulet-rules";
const now = Date.parse("2026-07-13T19:30:00.000Z");
const policy = {
  agentParty: `sotto-policy-agent::1220${"a".repeat(64)}`,
  allowedRecipient: `sotto-spike-provider::1220${"b".repeat(64)}`,
  allowedResourceHash: `sha256:${"c".repeat(64)}` as const,
  expiresAt: "2026-07-13T20:30:00.000Z",
  maximumTotalDebitAtomic: "3250000000",
  payerParty: `sotto-spike-payer::1220${"f".repeat(64)}`,
  perCallLimitAtomic: "2500000000",
  remainingAllowanceAtomic: "10000000000",
} as const;

function factoryEntry(overrides: Record<string, unknown> = {}) {
  const { createdEvent: eventOverrides, ...activeOverrides } = overrides;
  const createdEvent = {
    contractId: factoryContractId,
    createArgument: { dso },
    observers: [],
    packageName: "splice-amulet",
    representativePackageId:
      FIVE_NORTH_TRANSFER_FACTORY_IMPLEMENTATION_ID.split(":")[0],
    signatories: [dso],
    templateId: FIVE_NORTH_TRANSFER_FACTORY_IMPLEMENTATION_ID,
    ...(eventOverrides as Record<string, unknown> | undefined),
  };
  return {
    contractEntry: {
      JsActiveContract: {
        createdEvent,
        reassignmentCounter: 0,
        synchronizerId,
        ...activeOverrides,
      },
    },
  };
}

function reader(overrides: Record<string, unknown> = {}) {
  return {
    readAmuletRules: vi.fn(async () => ({
      amulet_rules: {
        contract: { payload: { dso } },
        domain_id: synchronizerId,
      },
    })),
    readAuthenticatedUserId: vi.fn(async () => "ledger-user-6"),
    readLedgerEnd: vi.fn(async () => ({ offset: 42 })),
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
    readTransferFactoryContracts: vi.fn(async () => [factoryEntry()]),
    ...overrides,
  };
}

describe("Five North capability authority", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("derives factory, admin, synchronizer, package, and ledger user", async () => {
    const source = reader();
    const observation =
      await createFiveNorthCapabilityAuthorityObserver(source)(policy);
    expect(source.readPackagePresence).toHaveBeenCalledWith(
      SOTTO_CONTROL_PACKAGE_ID,
    );
    expect(source.readTransferFactoryContracts).toHaveBeenCalledWith(dso, 42);
    expect(source.readPreferredSottoPackage).toHaveBeenCalledWith(
      policy.payerParty,
      policy.agentParty,
    );
    expect(source.readAuthenticatedUserId).toHaveBeenCalledTimes(2);
    expect(Object.keys(observation).sort()).toEqual([
      "observationId",
      "observedAt",
    ]);
    expect(() =>
      buildFiveNorthCapabilityBootstrap({ ...observation }, policy),
    ).toThrow("not authenticated");
    expect(() =>
      buildFiveNorthCapabilityBootstrap(observation, {
        ...policy,
        agentParty: `sotto-other-agent::1220${"9".repeat(64)}`,
      }),
    ).toThrow("actors do not match");
    const request = buildFiveNorthCapabilityBootstrap(observation, policy);
    const create = request.commands[0]!.CreateCommand;
    expect(request.userId).toBe("ledger-user-6");
    expect(request.synchronizerId).toBe(synchronizerId);
    expect(request.packageIdSelectionPreference).toEqual([
      SOTTO_CONTROL_PACKAGE_ID,
    ]);
    expect(create.createArguments).toMatchObject({
      expectedAdmin: dso,
      instrumentId: { admin: dso, id: "Amulet" },
      transferFactoryCid: factoryContractId,
    });
    expect(() =>
      buildFiveNorthCapabilityBootstrap(observation, policy),
    ).toThrow("already claimed");
  });

  it("queries only the pinned factory implementation for the DSO", () => {
    expect(transferFactoryContractsBody(dso, 42)).toEqual({
      filter: {
        filtersByParty: {
          [dso]: {
            cumulative: [
              {
                identifierFilter: {
                  TemplateFilter: {
                    value: {
                      includeCreatedEventBlob: false,
                      templateId: FIVE_NORTH_TRANSFER_FACTORY_IMPLEMENTATION_ID,
                    },
                  },
                },
              },
            ],
          },
        },
      },
      verbose: true,
      activeAtOffset: 42,
    });
  });

  it.each([
    [
      "wrong package vetting",
      {
        readPreferredSottoPackage: vi.fn(async () => ({
          packageReferences: [],
          synchronizerId,
        })),
      },
      /preferred/u,
    ],
    [
      "changed authenticated user",
      {
        readAuthenticatedUserId: vi
          .fn()
          .mockResolvedValueOnce("ledger-user-6")
          .mockResolvedValueOnce("other-ledger-user"),
      },
      /user changed/u,
    ],
    [
      "missing package",
      {
        readPackagePresence: vi.fn(async () => null),
      },
      /package/u,
    ],
    [
      "wrong package digest",
      {
        readPackagePresence: vi.fn(async () => ({
          archivePayloadSha256: "0".repeat(64),
          packageId: SOTTO_CONTROL_PACKAGE_ID,
        })),
      },
      /package/u,
    ],
    [
      "duplicate factory",
      {
        readTransferFactoryContracts: vi.fn(async () => [
          factoryEntry(),
          factoryEntry(),
        ]),
      },
      /exactly one/u,
    ],
    [
      "wrong factory signer",
      {
        readTransferFactoryContracts: vi.fn(async () => [
          factoryEntry({ createdEvent: { signatories: [policy.payerParty] } }),
        ]),
      },
      /factory/u,
    ],
    [
      "wrong synchronizer",
      {
        readTransferFactoryContracts: vi.fn(async () => [
          factoryEntry({ synchronizerId: `other::1220${"1".repeat(64)}` }),
        ]),
      },
      /synchronizer/u,
    ],
  ])("rejects %s", async (_label, override, error) => {
    await expect(
      createFiveNorthCapabilityAuthorityObserver(reader(override))(policy),
    ).rejects.toThrow(error);
  });

  it("expires before it can build a capability", async () => {
    const observation =
      await createFiveNorthCapabilityAuthorityObserver(reader())(policy);
    await vi.advanceTimersByTimeAsync(60_001);

    expect(() =>
      buildFiveNorthCapabilityBootstrap(observation, policy),
    ).toThrow("stale");
  });
});
