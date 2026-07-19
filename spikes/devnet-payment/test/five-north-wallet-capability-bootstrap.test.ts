import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  startFiveNorthWalletCapabilityBootstrap,
  type FiveNorthWalletCapabilityBootstrapPorts,
} from "../src/five-north-wallet-capability-bootstrap.js";

const PAYER =
  "sotto-external-payer::1220e5e6be928d5264069d480d0c30198236a71e2af7d42f519841483fc83fe8b012";
const AGENT =
  "sotto-policy-agent-20260713::1220a14ca128063b8dc9d1ebb0bd22633be9f2168500f4dbc1ecaeb1855b14e5acf8";
const PROVIDER =
  "sotto-spike-provider-20260713::1220a14ca128063b8dc9d1ebb0bd22633be9f2168500f4dbc1ecaeb1855b14e5acf8";
const ADMIN =
  "DSO::1220be58c29e65de40bf273be1dc2b266d43a9a002ea5b18955aeef7aac881bb471a";
const SYNCHRONIZER =
  "global-domain::1220be58c29e65de40bf273be1dc2b266d43a9a002ea5b18955aeef7aac881bb471a";
const FACTORY =
  "009f00e5bf00640118d849080aaf22bc963a8458d322585cebf1119cb7bf37a955ca11122065b775fb8a4199904ed32fa9277fd9c0e82bb82319a7151249df124182072381";

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-07-16T05:40:00.000Z") });
});

afterEach(() => vi.useRealTimers());

it("passes one exact external-payer create to the wallet runner", async () => {
  const readAuthenticatedUserId = vi.fn(async () => "validator-devnet-m2m");
  const ports = {
    connector: {},
    connectorId: "wallet-sdk-reference",
    connectorOrigin: "wallet://sotto-reference",
    execute: vi.fn(),
    prepare: vi.fn(),
    readActiveCapabilities: vi.fn(),
    readAuthenticatedUserId,
    readCompletion: vi.fn(),
    readLedgerEndOffset: vi.fn(),
    recomputeOfficialHash: vi.fn(),
    resolveRegisteredPublicKey: vi.fn(),
    signal: new AbortController().signal,
    timeoutMilliseconds: 60_000,
  } as unknown as FiveNorthWalletCapabilityBootstrapPorts;
  const start = vi.fn(async (input) => input.request);

  const request = await startFiveNorthWalletCapabilityBootstrap(
    {
      approval: {
        agentParty: AGENT,
        expiresAt: "2026-07-16T06:25:52.383Z",
        instrumentAdmin: ADMIN,
        payerParty: PAYER,
        providerParty: PROVIDER,
        resourceHash:
          "sha256:e4d84d746e3ffa301d0c3b36e0deeeda7e278ec7dc33a79874bd9651bb1369da",
        synchronizerId: SYNCHRONIZER,
        transferFactoryContractId: FACTORY,
      },
      ports,
      sourceCommit: "c".repeat(40),
      workspaceRoot: "/tmp/sotto-wallet-live",
    },
    { start },
  );

  expect(readAuthenticatedUserId).toHaveBeenCalledOnce();
  expect(start).toHaveBeenCalledOnce();
  expect(request).toMatchObject({
    actAs: [PAYER],
    readAs: [],
    synchronizerId: SYNCHRONIZER,
    userId: "validator-devnet-m2m",
  });
  expect(request.commands).toHaveLength(1);
  expect(request.commands[0]!.CreateCommand.createArguments).toMatchObject({
    agent: AGENT,
    allowedRecipient: PROVIDER,
    allowedResourceHash:
      "sha256:e4d84d746e3ffa301d0c3b36e0deeeda7e278ec7dc33a79874bd9651bb1369da",
    maximumTotalDebit: "0.3250000000",
    payer: PAYER,
    perCallLimit: "0.2500000000",
    remainingAllowance: "0.3250000000",
    transferFactoryCid: FACTORY,
  });
  expect(start.mock.calls[0]![0]).not.toHaveProperty("submit");
});
