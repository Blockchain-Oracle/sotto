import {
  restoreBoundedCapabilityBootstrapIntent,
  type BoundedCapabilityBootstrapRequest,
} from "@sotto/x402-canton";
import {
  initializeCapabilityBootstrapJournal,
  loadCapabilityBootstrapJournalIntent,
  loadCapabilityBootstrapJournalState,
  markCapabilityBootstrapResolved,
  markCapabilityBootstrapSubmissionStarted,
  withCapabilityBootstrapLease,
} from "./capability-bootstrap-journal.js";
import {
  recoverBoundedCapabilityBootstrap,
  runBoundedCapabilityBootstrap,
} from "./capability-bootstrap-runner.js";

type LiveBootstrapDependencies = Readonly<{
  readActiveCapabilities: () => Promise<unknown>;
  workspaceRoot: string;
}>;

export async function startJournaledCapabilityBootstrap(
  input: LiveBootstrapDependencies &
    Readonly<{
      request: BoundedCapabilityBootstrapRequest;
      sourceCommit: string;
      submit: (request: BoundedCapabilityBootstrapRequest) => Promise<unknown>;
    }>,
) {
  const initialized = await initializeCapabilityBootstrapJournal({
    request: input.request,
    sourceCommit: input.sourceCommit,
    workspaceRoot: input.workspaceRoot,
  });
  return withCapabilityBootstrapLease({
    operationId: initialized.operationId,
    workspaceRoot: input.workspaceRoot,
    action: async (assertOwned) => {
      const result = await runBoundedCapabilityBootstrap({
        persistIntent: async (request) => {
          const loaded = await loadCapabilityBootstrapJournalIntent(
            input.workspaceRoot,
          );
          const persisted = restoreBoundedCapabilityBootstrapIntent(
            loaded.intent,
          );
          if (
            loaded.operationId !== initialized.operationId ||
            persisted.commandId !== request.commandId
          ) {
            throw new Error("bootstrap durable intent does not match request");
          }
        },
        persistSubmissionStarted: async () => {
          await assertOwned();
          await markCapabilityBootstrapSubmissionStarted({
            operationId: initialized.operationId,
            workspaceRoot: input.workspaceRoot,
          });
        },
        readActiveCapabilities: input.readActiveCapabilities,
        request: input.request,
        submit: async (request) => {
          await assertOwned();
          return input.submit(request);
        },
      });
      await markCapabilityBootstrapResolved({
        ...result,
        operationId: initialized.operationId,
        workspaceRoot: input.workspaceRoot,
      });
      return result;
    },
  });
}

export async function recoverJournaledCapabilityBootstrap(
  input: LiveBootstrapDependencies,
) {
  const state = await loadCapabilityBootstrapJournalState(input.workspaceRoot);
  if (!state.submissionStarted) {
    throw new Error(
      "bootstrap submission was not started; recovery cannot submit",
    );
  }
  return withCapabilityBootstrapLease({
    operationId: state.operationId,
    workspaceRoot: input.workspaceRoot,
    action: async (assertOwned) => {
      await assertOwned();
      const current = await loadCapabilityBootstrapJournalState(
        input.workspaceRoot,
      );
      const result = await recoverBoundedCapabilityBootstrap({
        intent: current.intent,
        readActiveCapabilities: input.readActiveCapabilities,
      });
      if (current.resolution !== null) {
        if (
          current.resolution.commandId !== result.commandId ||
          current.resolution.contractId !== result.contractId
        ) {
          throw new Error("bootstrap terminal result does not match ACS");
        }
        return current.resolution;
      }
      await markCapabilityBootstrapResolved({
        ...result,
        operationId: current.operationId,
        workspaceRoot: input.workspaceRoot,
      });
      return result;
    },
  });
}
