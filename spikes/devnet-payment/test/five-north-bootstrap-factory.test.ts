import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID,
  FIVE_NORTH_HOLDING_TEMPLATE_PACKAGE_ID,
  FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID,
  HOLDING_INTERFACE_ID,
  SOTTO_CONTROL_PACKAGE_ID,
  type PurchaseHoldingAcsRequest,
  type TransferFactoryRegistryRequest,
} from "@sotto/x402-canton";
import {
  buildFiveNorthCapabilityBootstrap,
  createFiveNorthBootstrapFactoryObserver,
} from "../src/five-north-bootstrap-factory.js";
import { createFiveNorthCapabilityReadinessObserver } from "../src/five-north-capability-readiness.js";

const dso = `DSO::1220${"d".repeat(64)}`;
const synchronizerId = `global-domain::1220${"e".repeat(64)}`;
const payerParty = `sotto-payer::1220${"a".repeat(64)}`;
const agentParty = `sotto-agent::1220${"b".repeat(64)}`;
const recipientParty = `sotto-provider::1220${"c".repeat(64)}`;
const factoryId = "00factory";
const policy = {
  agentParty,
  allowedRecipient: recipientParty,
  allowedResourceHash: `sha256:${"f".repeat(64)}` as const,
  expiresAt: "2026-07-14T00:30:00.000Z",
  maximumTotalDebitAtomic: "2750000000",
  payerParty,
  perCallLimitAtomic: "2500000000",
  remainingAllowanceAtomic: "10000000000",
} as const;

function readinessReader() {
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
  };
}

function holdingEntry() {
  return {
    contractEntry: {
      JsActiveContract: {
        createdEvent: {
          contractId: "00holding",
          templateId: `${FIVE_NORTH_HOLDING_TEMPLATE_PACKAGE_ID}:Splice.Amulet:Amulet`,
          packageName: "splice-amulet",
          createdEventBlob: Buffer.from("holding").toString("base64"),
          interfaceViews: [
            {
              interfaceId: HOLDING_INTERFACE_ID,
              viewStatus: { code: 0 },
              viewValue: {
                owner: payerParty,
                instrumentId: { admin: dso, id: "Amulet" },
                amount: "0.3000000000",
                lock: null,
                meta: { values: {} },
              },
              implementationPackageId:
                FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID,
            },
          ],
          witnessParties: [payerParty],
        },
        synchronizerId,
        reassignmentCounter: 0,
      },
    },
  };
}

function factoryResponse(overrides: Record<string, unknown> = {}) {
  return new TextEncoder().encode(
    JSON.stringify({
      factoryId,
      transferKind: "direct",
      choiceContext: {
        choiceContextData: { values: {} },
        disclosedContracts: [
          {
            templateId: FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID,
            contractId: factoryId,
            createdEventBlob: Buffer.from("factory").toString("base64"),
            synchronizerId,
          },
        ],
      },
      ...overrides,
    }),
  );
}

describe("Five North bootstrap factory", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: Date.parse("2026-07-13T23:30:00.000Z") });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("derives a one-use factory from policy-scoped holdings and registry", async () => {
    const readiness =
      await createFiveNorthCapabilityReadinessObserver(readinessReader())(
        policy,
      );
    const readActiveContracts = vi.fn(
      async (request: PurchaseHoldingAcsRequest) => {
        void request;
        return [holdingEntry()];
      },
    );
    const registry = vi.fn(async (request: TransferFactoryRegistryRequest) => {
      void request;
      return factoryResponse();
    });
    const observe = createFiveNorthBootstrapFactoryObserver({
      readAuthenticatedUserId: vi.fn(async () => "ledger-user-6"),
      holdings: {
        readLedgerEnd: vi.fn(async () => ({ offset: 42 })),
        readActiveContracts,
      },
      registry,
    });

    const factory = await observe(readiness, policy);

    expect(Object.keys(factory).sort()).toEqual([
      "observationId",
      "observedAt",
    ]);
    expect(JSON.stringify(factory)).not.toContain(factoryId);
    const acsRequest = readActiveContracts.mock.calls[0]![0];
    expect(Object.keys(acsRequest.filter.filtersByParty)).toEqual([payerParty]);
    const registryRequest = registry.mock.calls[0]![0];
    const choiceArguments = JSON.parse(registryRequest.body).choiceArguments;
    expect(choiceArguments).toMatchObject({
      expectedAdmin: dso,
      transfer: {
        amount: "0.2500000000",
        executeBefore: "2026-07-13T23:31:00.000Z",
        inputHoldingCids: ["00holding"],
        receiver: recipientParty,
        requestedAt: "2026-07-13T23:30:00.000Z",
        sender: payerParty,
      },
    });
    expect(registryRequest).not.toHaveProperty("factoryId");

    const request = buildFiveNorthCapabilityBootstrap(
      readiness,
      factory,
      policy,
    );
    expect(request.commands[0]!.CreateCommand.createArguments).toMatchObject({
      expectedAdmin: dso,
      transferFactoryCid: factoryId,
    });
    expect(() =>
      buildFiveNorthCapabilityBootstrap(readiness, factory, policy),
    ).toThrow("already claimed");
  });

  it("rejects structural readiness before any holding read", async () => {
    const readiness =
      await createFiveNorthCapabilityReadinessObserver(readinessReader())(
        policy,
      );
    const readLedgerEnd = vi.fn();
    const observe = createFiveNorthBootstrapFactoryObserver({
      readAuthenticatedUserId: vi.fn(async () => "ledger-user-6"),
      holdings: { readLedgerEnd, readActiveContracts: vi.fn() },
      registry: vi.fn(),
    });

    await expect(observe({ ...readiness }, policy)).rejects.toThrow(
      "not authenticated",
    );
    expect(readLedgerEnd).not.toHaveBeenCalled();
  });

  it("binds the factory observation to the exact policy", async () => {
    const readiness =
      await createFiveNorthCapabilityReadinessObserver(readinessReader())(
        policy,
      );
    const factory = await createFiveNorthBootstrapFactoryObserver({
      readAuthenticatedUserId: vi.fn(async () => "ledger-user-6"),
      holdings: {
        readLedgerEnd: vi.fn(async () => ({ offset: 42 })),
        readActiveContracts: vi.fn(async () => [holdingEntry()]),
      },
      registry: vi.fn(async () => factoryResponse()),
    })(readiness, policy);

    expect(() =>
      buildFiveNorthCapabilityBootstrap(readiness, factory, {
        ...policy,
        allowedResourceHash: `sha256:${"1".repeat(64)}`,
      }),
    ).toThrow("policy");
    expect(() =>
      buildFiveNorthCapabilityBootstrap(readiness, { ...factory }, policy),
    ).toThrow("not authenticated");
  });

  it("rejects token subject drift and stale registry acquisition", async () => {
    const readiness =
      await createFiveNorthCapabilityReadinessObserver(readinessReader())(
        policy,
      );
    const readers = () => ({
      readAuthenticatedUserId: vi
        .fn()
        .mockResolvedValueOnce("ledger-user-6")
        .mockResolvedValueOnce("ledger-user-7"),
      holdings: {
        readLedgerEnd: vi.fn(async () => ({ offset: 42 })),
        readActiveContracts: vi.fn(async () => [holdingEntry()]),
      },
      registry: vi.fn(async () => factoryResponse()),
    });
    await expect(
      createFiveNorthBootstrapFactoryObserver(readers())(readiness, policy),
    ).rejects.toThrow("user changed");

    const staleReaders = readers();
    staleReaders.readAuthenticatedUserId
      .mockReset()
      .mockResolvedValue("ledger-user-6");
    staleReaders.registry.mockImplementation(async () => {
      vi.advanceTimersByTime(60_001);
      return factoryResponse();
    });
    await expect(
      createFiveNorthBootstrapFactoryObserver(staleReaders)(readiness, policy),
    ).rejects.toThrow("stale");
  });

  it("rejects caller factory fields before reading holdings", async () => {
    const readiness =
      await createFiveNorthCapabilityReadinessObserver(readinessReader())(
        policy,
      );
    const readLedgerEnd = vi.fn();
    const observe = createFiveNorthBootstrapFactoryObserver({
      readAuthenticatedUserId: vi.fn(),
      holdings: { readLedgerEnd, readActiveContracts: vi.fn() },
      registry: vi.fn(),
    });

    await expect(
      observe(readiness, {
        ...policy,
        transferFactoryContractId: "00caller-controlled",
      } as typeof policy),
    ).rejects.toThrow("keys");
    expect(readLedgerEnd).not.toHaveBeenCalled();
  });
});
