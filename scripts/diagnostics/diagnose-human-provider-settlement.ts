import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { readFiveNorthNetworkConfig } from "../../spikes/devnet-payment/src/config.js";
import { readinessParty } from "../../spikes/devnet-payment/src/five-north-capability-readiness-validation.js";
import { createFiveNorthHumanProviderTransactionReader } from "../../spikes/devnet-payment/src/five-north-human-provider-transaction.js";
import { loadHumanPurchaseJournal } from "../../spikes/devnet-payment/src/human-purchase-journal.js";
import { reconcileHumanPurchaseProviderTransaction } from "../../spikes/devnet-payment/src/human-purchase-provider-reconciliation.js";

const workspaceRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
loadEnvFile(resolve(workspaceRoot, ".env.local"));
const operationId =
  "sha256:1fe4760aa7c66acebda2bf898c3deace878a229cf9dd34e904cf4467099ed41a";
const state = await loadHumanPurchaseJournal({ operationId, workspaceRoot });
if (state.completion?.classification !== "SUCCEEDED") {
  throw new Error("diagnostic requires a successful completion");
}
const signal = new AbortController().signal;
const network = readFiveNorthNetworkConfig(process.env);
const providerParty = readinessParty(
  process.env.PROVIDER_PARTY,
  "human provider",
  true,
);
const read = createFiveNorthHumanProviderTransactionReader(
  network,
  providerParty,
  { signal },
);
const response = await read(state.completion.updateId);
const proof = {
  attemptId: state.expectation.attemptId,
  challengeId: state.expectation.challengeId,
  purchaseCommitment: state.expectation.purchaseCommitment,
  requestCommitment: state.expectation.requestCommitment,
  updateId: state.completion.updateId,
} as const;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function keys(value: unknown): string[] {
  return Object.keys(record(value) ?? {}).sort();
}

const transaction = record(record(response)?.transaction);
const events = Array.isArray(transaction?.events) ? transaction.events : [];
const providerHoldingId = events.flatMap((wrapper) => {
  const created = record(record(wrapper)?.CreatedEvent);
  const argument = record(created?.createArgument);
  return created?.templateId === state.expectation.amuletTemplateId &&
    argument?.owner === state.expectation.providerParty &&
    typeof created.contractId === "string"
    ? [created.contractId]
    : [];
})[0];
const eventSummary = events.map((wrapper) => {
  const created = record(record(wrapper)?.CreatedEvent);
  if (created !== undefined) {
    const argument = record(created.createArgument);
    const amount = record(argument?.amount);
    return {
      argumentKeys: keys(argument),
      amountInitialMatches: amount?.initialAmount === state.expectation.amount,
      amountKeys: keys(amount),
      createdAtKeys: keys(record(amount?.createdAt)),
      dsoMatches: argument?.dso === state.expectation.dsoParty,
      eventKeys: keys(created),
      kind: "CreatedEvent",
      ownerMatches: argument?.owner === state.expectation.providerParty,
      rateKeys: keys(record(amount?.ratePerRound)),
      templateMatches:
        created.templateId === state.expectation.amuletTemplateId,
    };
  }
  const exercised = record(record(wrapper)?.ExercisedEvent);
  if (exercised !== undefined) {
    const argument = record(exercised.choiceArgument);
    const context = record(argument?.context);
    const meta = record(argument?.meta);
    const result = record(exercised.exerciseResult);
    const inner = record(result?.result);
    const inputs = Array.isArray(argument?.inputs) ? argument.inputs : [];
    const createdAmulets = Array.isArray(inner?.createdAmulets)
      ? inner.createdAmulets
      : [];
    return {
      actingPartiesMatch:
        JSON.stringify(exercised.actingParties) ===
        JSON.stringify([state.expectation.payerParty]),
      argumentKeys: keys(argument),
      choice: exercised.choice,
      consuming: exercised.consuming,
      contextKeys: keys(context),
      contextMatches:
        context?.externalPartyConfigState ===
          state.expectation.choiceContextContractIds[
            "external-party-config-state"
          ] &&
        context?.featuredAppRight ===
          state.expectation.choiceContextContractIds["featured-app-right"],
      contractMatches:
        exercised.contractId ===
        state.expectation.transferPreapprovalContractId,
      createdAmuletCount: createdAmulets.length,
      createdAmulets: createdAmulets.map((entry) => ({
        linksProviderHolding: record(entry)?.value === providerHoldingId,
        tag: record(entry)?.tag,
      })),
      eventKeys: keys(exercised),
      exerciseResultKeys: keys(result),
      innerResultKeys: keys(inner),
      inputCount: inputs.length,
      inputsMatch: inputs.every(
        (entry, index) =>
          record(entry)?.tag === "InputAmulet" &&
          record(entry)?.value ===
            state.expectation.inputHoldingContractIds[index],
      ),
      kind: "ExercisedEvent",
      principalMatches: argument?.amount === state.expectation.amount,
      metadataKeys: keys(record(meta?.values)),
      resultMetadataKeys: keys(record(record(result?.meta)?.values)),
      templateMatches:
        exercised.templateId ===
        state.expectation.transferPreapprovalTemplateId,
    };
  }
  return { kind: "Unknown", wrapperKeys: keys(wrapper) };
});
const commandVisibleResponse = structuredClone(response);
const commandVisibleTransaction = record(
  record(commandVisibleResponse)?.transaction,
);
if (commandVisibleTransaction !== undefined) {
  commandVisibleTransaction.commandId = state.expectation.commandId;
}

console.log(
  JSON.stringify(
    {
      actualCommandId: transaction?.commandId,
      commandMatches: transaction?.commandId === state.expectation.commandId,
      eventCount: events.length,
      events: eventSummary,
      offsetType: typeof transaction?.offset,
      reconciles: reconcileHumanPurchaseProviderTransaction(
        response,
        proof,
        state.expectation,
      ),
      reconcilesWithExpectedCommandId:
        reconcileHumanPurchaseProviderTransaction(
          commandVisibleResponse,
          proof,
          state.expectation,
        ),
      responseKeys: keys(response),
      expectedCommandId: state.expectation.commandId,
      synchronizerMatches:
        transaction?.synchronizerId === state.expectation.synchronizerId,
      transactionKeys: keys(transaction),
      updateMatches: transaction?.updateId === state.completion.updateId,
    },
    null,
    2,
  ),
);
