import { loadEnvFile } from "node:process";
import { readSpikeConfig } from "../../spikes/devnet-payment/src/config.js";
import { createFiveNorthClient } from "../../spikes/devnet-payment/src/five-north.js";

loadEnvFile(new URL("../../.env.local", import.meta.url));
const config = readSpikeConfig(process.env);
const client = createFiveNorthClient(config.network);
const response = (await client.getTransaction(
  "1220a389588fc2b677ce956c03af93f65ce537b29aea244e815022cde54b492811e3",
  config.provider.party,
)) as { transaction?: { events?: unknown[] } };
const events = (response.transaction?.events ?? []).map((wrapper) => {
  const record = wrapper as Record<string, Record<string, unknown>>;
  const event =
    record.ExercisedEvent ?? record.CreatedEvent ?? record.ArchivedEvent;
  return record.ExercisedEvent === undefined
    ? {
        contractId: event?.contractId,
        kind: record.CreatedEvent === undefined ? "archived" : "created",
        templateId: event?.templateId,
      }
    : {
        actingParties: event?.actingParties,
        choice: event?.choice,
        choiceArgument: event?.choiceArgument,
        consuming: event?.consuming,
        contractId: event?.contractId,
        exerciseResult: event?.exerciseResult,
        kind: "exercised",
        templateId: event?.templateId,
      };
});
process.stdout.write(`${JSON.stringify(events, null, 2)}\n`);
