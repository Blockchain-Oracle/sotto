import { loadEnvFile } from "node:process";
import {
  activeContracts,
  buildActiveContractRequest,
} from "../../spikes/devnet-payment/src/daml-evidence.js";
import { readSpikeConfig } from "../../spikes/devnet-payment/src/config.js";
import { createFiveNorthClient } from "../../spikes/devnet-payment/src/five-north.js";
import { FiveNorthRequestFailure } from "../../spikes/devnet-payment/src/five-north-response.js";

const root = new URL("../..", import.meta.url);
loadEnvFile(new URL(".env.local", root));
const config = readSpikeConfig(process.env);
const client = createFiveNorthClient(config.network);
const updateId =
  "1220a389588fc2b677ce956c03af93f65ce537b29aea244e815022cde54b492811e3";
const contextContractId =
  "0045489cef9040083ab47b7eca5c96e19de7fe1c16a408045aa0b68dd62eff34cbca121220b4985be823bd87c69df4ec645d58f321d7f5b3051a596bef7e0c5f1bd1174846";
const attemptId =
  "sha256:b2bfdc417cb1de5ee12bc3cb15b024ff6f99f691661ae891bd16355679631efa";
const payer =
  "sotto-external-payer::1220e5e6be928d5264069d480d0c30198236a71e2af7d42f519841483fc83fe8b012";
const agent =
  "sotto-external-agent::12206e0e95b6aa27cfb8836e30d432e19ab918a01a5507eb1601004ac2a007d5cdbf";
const readers = {
  agent,
  outsider: config.policy.outsiderParty,
  payer,
  provider: config.provider.party,
} as const;
const templateId =
  "#sotto-control:Sotto.Control.PurchaseCapability:PurchaseContext";

function transactionEvents(value: unknown): unknown[] {
  const record = value as { transaction?: { events?: unknown } };
  return Array.isArray(record?.transaction?.events)
    ? record.transaction.events
    : [];
}

const offset = await client.getLedgerEnd();
const visibility: Record<string, unknown> = {};
for (const [role, party] of Object.entries(readers)) {
  let context: unknown;
  try {
    const contexts = activeContracts(
      await client.postLedger(
        "/v2/state/active-contracts",
        buildActiveContractRequest(party, templateId, offset),
      ),
    );
    context = {
      count: contexts.filter(
        ({ contractId, createArgument }) =>
          contractId === contextContractId &&
          createArgument.attemptId === attemptId,
      ).length,
      status: "READ",
    };
  } catch (error) {
    if (!(error instanceof FiveNorthRequestFailure)) throw error;
    context = { status: `UNAVAILABLE_HTTP_${error.status}` };
  }
  let transaction: unknown;
  try {
    const events = transactionEvents(
      await client.getTransaction(updateId, party),
    );
    transaction = { eventCount: events.length, status: "VISIBLE" };
  } catch (error) {
    if (!(error instanceof FiveNorthRequestFailure)) throw error;
    transaction = { status: `ABSENT_HTTP_${error.status}` };
  }
  visibility[role] = {
    context,
    transaction,
  };
}

process.stdout.write(
  `${JSON.stringify({ offset, updateId, visibility, version: "sotto-external-agent-visibility-v1" })}\n`,
);
