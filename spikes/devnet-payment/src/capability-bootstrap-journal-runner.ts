import { isDeepStrictEqual } from "node:util";
import {
  exportBoundedCapabilityBootstrapIntent,
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

function isAlreadyExists(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  );
}

async function initializeOrAdopt(input: {
  request: BoundedCapabilityBootstrapRequest;
  sourceCommit: string;
  workspaceRoot: string;
}) {
  try {
    return await initializeCapabilityBootstrapJournal(input);
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
    const state = await loadCapabilityBootstrapJournalState(
      input.workspaceRoot,
    );
    const candidate = exportBoundedCapabilityBootstrapIntent(
      input.request,
      input.sourceCommit,
    );
    if (
      candidate.sourceCommit !== state.intent.sourceCommit ||
      !isDeepStrictEqual(candidate.request, state.intent.request)
    ) {
      throw new Error("existing bootstrap journal intent does not match", {
        cause: error,
      });
    }
    return Object.freeze({ operationId: state.operationId });
  }
}

async function recoverAndPersist(input: {
  assertOwned: () => Promise<void>;
  readActiveCapabilities: () => Promise<unknown>;
  state: Awaited<ReturnType<typeof loadCapabilityBootstrapJournalState>>;
  workspaceRoot: string;
}) {
  if (input.state.resolution !== null) return input.state.resolution;
  const result = await recoverBoundedCapabilityBootstrap({
    intent: input.state.intent,
    readActiveCapabilities: input.readActiveCapabilities,
  });
  await input.assertOwned();
  await markCapabilityBootstrapResolved({
    ...result,
    operationId: input.state.operationId,
    workspaceRoot: input.workspaceRoot,
  });
  return result;
}

export async function startJournaledCapabilityBootstrap(
  input: LiveBootstrapDependencies &
    Readonly<{
      request: BoundedCapabilityBootstrapRequest;
      sourceCommit: string;
      submit: (request: BoundedCapabilityBootstrapRequest) => Promise<unknown>;
    }>,
) {
  const initialized = await initializeOrAdopt({
    request: input.request,
    sourceCommit: input.sourceCommit,
    workspaceRoot: input.workspaceRoot,
  });
  return withCapabilityBootstrapLease({
    operationId: initialized.operationId,
    workspaceRoot: input.workspaceRoot,
    action: async (assertOwned) => {
      const state = await loadCapabilityBootstrapJournalState(
        input.workspaceRoot,
      );
      if (state.operationId !== initialized.operationId) {
        throw new Error("bootstrap durable operation changed");
      }
      if (state.submissionStarted) {
        return recoverAndPersist({
          assertOwned,
          readActiveCapabilities: input.readActiveCapabilities,
          state,
          workspaceRoot: input.workspaceRoot,
        });
      }
      const request = restoreBoundedCapabilityBootstrapIntent(state.intent);
      const result = await runBoundedCapabilityBootstrap({
        persistIntent: async (candidate) => {
          const loaded = await loadCapabilityBootstrapJournalIntent(
            input.workspaceRoot,
          );
          const persisted = restoreBoundedCapabilityBootstrapIntent(
            loaded.intent,
          );
          if (
            loaded.operationId !== initialized.operationId ||
            !isDeepStrictEqual(persisted, candidate)
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
        request,
        submit: async (candidate) => {
          await assertOwned();
          return input.submit(candidate);
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
  input: LiveBootstrapDependencies & Readonly<{ sourceCommit: string }>,
) {
  const state = await loadCapabilityBootstrapJournalState(input.workspaceRoot);
  if (state.resolution !== null) return state.resolution;
  if (!state.submissionStarted) {
    throw new Error(
      "bootstrap submission was not started; recovery cannot submit",
    );
  }
  if (state.intent.sourceCommit !== input.sourceCommit) {
    throw new Error("bootstrap recovery source commit does not match");
  }
  return withCapabilityBootstrapLease({
    operationId: state.operationId,
    workspaceRoot: input.workspaceRoot,
    action: async (assertOwned) => {
      await assertOwned();
      const current = await loadCapabilityBootstrapJournalState(
        input.workspaceRoot,
      );
      if (current.operationId !== state.operationId) {
        throw new Error("bootstrap durable operation changed");
      }
      if (
        current.resolution === null &&
        current.intent.sourceCommit !== input.sourceCommit
      ) {
        throw new Error("bootstrap recovery source commit changed");
      }
      return recoverAndPersist({
        assertOwned,
        readActiveCapabilities: input.readActiveCapabilities,
        state: current,
        workspaceRoot: input.workspaceRoot,
      });
    },
  });
}
