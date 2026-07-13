import { isDeepStrictEqual } from "node:util";
import {
  exportFiveNorthPreapprovalIntent,
  restoreFiveNorthPreapprovalIntent,
} from "./five-north-preapproval-intent.js";
import {
  initializeFiveNorthPreapprovalJournal,
  loadFiveNorthPreapprovalJournalState,
  markFiveNorthPreapprovalSubmissionStarted,
  withFiveNorthPreapprovalLease,
} from "./five-north-preapproval-journal.js";
import type { FiveNorthPreapprovalProposalRequest } from "./five-north-preapproval-proposal.js";
import {
  recoverFiveNorthPreapproval,
  runFiveNorthPreapproval,
} from "./five-north-preapproval-runner.js";

type LiveDependencies = Readonly<{
  readStateContracts: () => Promise<unknown>;
  sourceCommit: string;
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
  request: FiveNorthPreapprovalProposalRequest;
  sourceCommit: string;
  workspaceRoot: string;
}) {
  try {
    return await initializeFiveNorthPreapprovalJournal(input);
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
    const state = await loadFiveNorthPreapprovalJournalState(
      input.workspaceRoot,
    );
    const candidate = exportFiveNorthPreapprovalIntent(
      input.request,
      input.sourceCommit,
    );
    if (!isDeepStrictEqual(candidate, state.intent)) {
      throw new Error("existing preapproval journal intent does not match", {
        cause: error,
      });
    }
    return Object.freeze({ operationId: state.operationId });
  }
}

export async function startJournaledFiveNorthPreapproval(
  input: LiveDependencies &
    Readonly<{
      request: FiveNorthPreapprovalProposalRequest;
      sourceCommit: string;
      submit: (
        request: FiveNorthPreapprovalProposalRequest,
      ) => Promise<unknown>;
    }>,
) {
  const initialized = await initializeOrAdopt(input);
  return withFiveNorthPreapprovalLease({
    operationId: initialized.operationId,
    workspaceRoot: input.workspaceRoot,
    action: async (assertOwned) => {
      const state = await loadFiveNorthPreapprovalJournalState(
        input.workspaceRoot,
      );
      const request = restoreFiveNorthPreapprovalIntent(state.intent);
      if (state.operationId !== initialized.operationId) {
        throw new Error("preapproval durable operation changed");
      }
      if (state.submissionStarted) {
        return recoverFiveNorthPreapproval({
          readStateContracts: input.readStateContracts,
          request,
        });
      }
      return runFiveNorthPreapproval({
        persistIntent: async (candidate) => {
          if (!isDeepStrictEqual(candidate, request)) {
            throw new Error(
              "preapproval durable intent does not match request",
            );
          }
        },
        persistSubmissionStarted: async () => {
          await assertOwned();
          await markFiveNorthPreapprovalSubmissionStarted({
            operationId: state.operationId,
            workspaceRoot: input.workspaceRoot,
          });
        },
        readStateContracts: input.readStateContracts,
        request,
        submit: async (candidate) => {
          await assertOwned();
          return input.submit(candidate);
        },
      });
    },
  });
}

export async function recoverJournaledFiveNorthPreapproval(
  input: LiveDependencies,
) {
  const state = await loadFiveNorthPreapprovalJournalState(input.workspaceRoot);
  if (state.intent.sourceCommit !== input.sourceCommit) {
    throw new Error("preapproval recovery source commit does not match");
  }
  return withFiveNorthPreapprovalLease({
    operationId: state.operationId,
    workspaceRoot: input.workspaceRoot,
    action: async (assertOwned) => {
      await assertOwned();
      const current = await loadFiveNorthPreapprovalJournalState(
        input.workspaceRoot,
      );
      if (current.intent.sourceCommit !== input.sourceCommit) {
        throw new Error("preapproval recovery source commit changed");
      }
      return recoverFiveNorthPreapproval({
        readStateContracts: input.readStateContracts,
        request: restoreFiveNorthPreapprovalIntent(current.intent),
      });
    },
  });
}
