import {
  buildDirectTransferAuthorityControl,
  buildTransferFactoryBootstrapProbe,
  claimPackagePreferenceObservation,
  createPackagePreferenceObserver,
  parseTransferFactoryBootstrapResponse,
  selectPurchaseHoldingsByCriteria,
} from "@sotto/x402-canton";
import { randomBytes } from "node:crypto";
import { loadEnvFile } from "node:process";
import { readSpikeConfig } from "./config.js";
import { buildFiveNorthPackagePreferenceManifest } from "./five-north-package-preference-manifest.js";
import { createFiveNorthPackagePreferenceReader } from "./five-north-package-preference.js";
import { createFiveNorthPrepareTransport } from "./five-north-prepare-transport.js";
import { runFiveNorthDirectTransferAuthorityControl } from "./five-north-direct-transfer-authority-control.js";

const AGENT =
  "sotto-external-agent::12206e0e95b6aa27cfb8836e30d432e19ab918a01a5507eb1601004ac2a007d5cdbf";
const PAYER =
  "sotto-external-payer::1220e5e6be928d5264069d480d0c30198236a71e2af7d42f519841483fc83fe8b012";
const ADMIN =
  "DSO::1220be58c29e65de40bf273be1dc2b266d43a9a002ea5b18955aeef7aac881bb471a";
const SYNCHRONIZER =
  "global-domain::1220be58c29e65de40bf273be1dc2b266d43a9a002ea5b18955aeef7aac881bb471a";
const AMOUNT_ATOMIC = "100000000";

function ledgerOffset(value: unknown): number {
  const offset = (value as { offset?: unknown })?.offset;
  if (!Number.isSafeInteger(offset) || (offset as number) < 0) {
    throw new Error("direct transfer control ledger end is invalid");
  }
  return offset as number;
}

loadEnvFile(new URL("../../../.env.local", import.meta.url));
const config = readSpikeConfig(process.env);
const controller = new AbortController();

try {
  const transport = createFiveNorthPrepareTransport(config.network, PAYER, {
    signal: controller.signal,
  });
  const offset = ledgerOffset(await transport.readLedgerEnd());
  const holdings = selectPurchaseHoldingsByCriteria(
    await transport.readHoldingContracts(offset),
    {
      debitCeilingAtomic: AMOUNT_ATOMIC,
      instrument: { admin: ADMIN, id: "Amulet" },
      payerParty: PAYER,
      synchronizerId: SYNCHRONIZER,
    },
  );
  const now = Date.now();
  const probe = buildTransferFactoryBootstrapProbe({
    amountAtomic: AMOUNT_ATOMIC,
    executeBefore: new Date(now + 120_000).toISOString(),
    expectedAdmin: ADMIN,
    inputHoldingCids: holdings.map(({ disclosure }) => disclosure.contractId),
    payerParty: PAYER,
    recipientParty: config.provider.party,
    requestedAt: new Date(now - 5_000).toISOString(),
  });
  const factory = parseTransferFactoryBootstrapResponse(
    await transport.readRegistry(
      JSON.stringify({
        choiceArguments: probe.choiceArguments,
        excludeDebugFields: true,
      }),
    ),
    {
      choiceArgumentsDigest: probe.choiceArgumentsDigest,
      synchronizerId: SYNCHRONIZER,
    },
  );
  const closure = buildFiveNorthPackagePreferenceManifest({
    sottoDarSha256:
      "07483431fb6b56b1b609067e72e124afbbc54b6a89ca89f774a90b70bd2d88e8",
    sottoSourceCommit: "f4ad4ba518eab712dd3b904cf400f07d7754798f",
  });
  const packageReader = createFiveNorthPackagePreferenceReader(config.network, {
    signal: controller.signal,
  });
  const vettingValidAt = new Date(now + 10_000).toISOString();
  const packageObservation = await createPackagePreferenceObserver(
    packageReader,
  )({
    adminParty: ADMIN,
    agentParty: AGENT,
    closure,
    payerParty: PAYER,
    providerParty: config.provider.party,
    synchronizerId: SYNCHRONIZER,
    vettingValidAt,
  });
  const authenticatedSubject = await packageReader.readAuthenticatedSubject();
  if (typeof authenticatedSubject !== "string") {
    throw new Error("direct transfer authenticated subject is invalid");
  }
  const packageSelection = claimPackagePreferenceObservation(
    packageObservation,
    {
      authenticatedSubject,
      closure,
      synchronizerId: SYNCHRONIZER,
      vettingValidAt,
    },
  );
  const control = buildDirectTransferAuthorityControl({
    agentParty: AGENT,
    controlId: `sha256:${randomBytes(32).toString("hex")}`,
    factory,
    holdings,
    packageSelection,
    payerParty: PAYER,
    probe,
    synchronizerId: SYNCHRONIZER,
  });
  const result = await runFiveNorthDirectTransferAuthorityControl(
    control,
    transport.readPrepare,
  );
  process.stdout.write(
    `${JSON.stringify({ ...result, holdingCount: holdings.length, offset })}\n`,
  );
} finally {
  controller.abort();
}
