import { isDeepStrictEqual } from "node:util";
import {
  verifiedSottoControlDarBytes,
  type VerifiedSottoControlDar,
} from "./five-north-dar-artifact.js";
import {
  fiveNorthHasApprovedSottoPackage,
  proveFiveNorthSottoControlPackagePresent,
  type FiveNorthPackageDeploymentAuthority,
  type FiveNorthPackageDeploymentTransport,
} from "./five-north-package-deployment.js";
import {
  fiveNorthPackageDeploymentIntent,
  initializeFiveNorthPackageDeploymentJournal,
  loadFiveNorthPackageDeploymentJournal,
  markFiveNorthPackagePresent,
  markFiveNorthPackageUploadStarted,
  withFiveNorthPackageDeploymentLease,
} from "./five-north-package-deployment-journal.js";

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function isAlreadyExists(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  );
}

function terminalResult(
  state: Awaited<ReturnType<typeof loadFiveNorthPackageDeploymentJournal>>,
) {
  if (state.terminal === null) return null;
  return Object.freeze({
    darSha256: state.intent.darSha256,
    operationId: state.operationId,
    outcome: state.terminal.outcome,
    packageId: state.intent.packageId,
    sourceCommit: state.intent.sourceCommit,
    status: "present" as const,
  });
}

function assertArtifact(
  artifact: VerifiedSottoControlDar,
  state: Awaited<ReturnType<typeof loadFiveNorthPackageDeploymentJournal>>,
): void {
  if (
    artifact.darByteLength !== state.intent.darByteLength ||
    artifact.darSha256 !== state.intent.darSha256 ||
    artifact.packageId !== state.intent.packageId ||
    artifact.sourceCommit !== state.intent.sourceCommit
  ) {
    throw new Error("package deployment artifact does not match journal");
  }
}

async function loadOptional(workspaceRoot: string) {
  try {
    return await loadFiveNorthPackageDeploymentJournal(workspaceRoot);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

async function initializeOrAdopt(input: {
  artifact: VerifiedSottoControlDar;
  authority: FiveNorthPackageDeploymentAuthority;
  workspaceRoot: string;
}) {
  const expected = fiveNorthPackageDeploymentIntent(input);
  try {
    await initializeFiveNorthPackageDeploymentJournal(input);
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
    const existing = await loadFiveNorthPackageDeploymentJournal(
      input.workspaceRoot,
    );
    if (!isDeepStrictEqual(existing.intent, expected)) {
      throw new Error("existing package deployment intent does not match", {
        cause: error,
      });
    }
  }
  return loadFiveNorthPackageDeploymentJournal(input.workspaceRoot);
}

function unknownResult(
  state: Awaited<ReturnType<typeof loadFiveNorthPackageDeploymentJournal>>,
) {
  return Object.freeze({
    darSha256: state.intent.darSha256,
    operationId: state.operationId,
    outcome: "dispatch-unresolved" as const,
    packageId: state.intent.packageId,
    sourceCommit: state.intent.sourceCommit,
    status: "unknown" as const,
  });
}

async function reconcileOnly(input: {
  state: Awaited<ReturnType<typeof loadFiveNorthPackageDeploymentJournal>>;
  transport: FiveNorthPackageDeploymentTransport;
  workspaceRoot: string;
}) {
  try {
    const result = await ensureFiveNorthSottoControlPackagePresenceOnly(
      input.transport,
    );
    if (!result) return unknownResult(input.state);
    await markFiveNorthPackagePresent({
      operationId: input.state.operationId,
      outcome: "present-after-dispatch",
      workspaceRoot: input.workspaceRoot,
    });
    return terminalResult(
      await loadFiveNorthPackageDeploymentJournal(input.workspaceRoot),
    )!;
  } catch {
    return unknownResult(input.state);
  }
}

async function ensureFiveNorthSottoControlPackagePresenceOnly(
  transport: FiveNorthPackageDeploymentTransport,
): Promise<boolean> {
  const value = await transport.listPackageIds();
  if (!fiveNorthHasApprovedSottoPackage(value)) return false;
  await proveFiveNorthSottoControlPackagePresent(transport);
  return true;
}

export async function startJournaledFiveNorthPackageDeployment(input: {
  artifact: VerifiedSottoControlDar;
  transport: FiveNorthPackageDeploymentTransport;
  workspaceRoot: string;
}) {
  verifiedSottoControlDarBytes(input.artifact);
  let state = await loadOptional(input.workspaceRoot);
  if (state !== null) {
    assertArtifact(input.artifact, state);
    const terminal = terminalResult(state);
    if (terminal !== null) return terminal;
  }

  let authority: FiveNorthPackageDeploymentAuthority | undefined;
  if (state === null || !state.uploadStarted) {
    authority = await input.transport.observeDeploymentAuthority();
  }
  if (state === null) {
    state = await initializeOrAdopt({
      artifact: input.artifact,
      authority: authority!,
      workspaceRoot: input.workspaceRoot,
    });
  } else if (
    authority !== undefined &&
    !isDeepStrictEqual(
      fiveNorthPackageDeploymentIntent({ artifact: input.artifact, authority }),
      state.intent,
    )
  ) {
    throw new Error("package deployment authority does not match journal");
  }

  return withFiveNorthPackageDeploymentLease({
    operationId: state.operationId,
    workspaceRoot: input.workspaceRoot,
    action: async (assertOwned) => {
      await assertOwned();
      const current = await loadFiveNorthPackageDeploymentJournal(
        input.workspaceRoot,
      );
      assertArtifact(input.artifact, current);
      const completed = terminalResult(current);
      if (completed !== null) return completed;
      if (current.uploadStarted) {
        return reconcileOnly({
          state: current,
          transport: input.transport,
          workspaceRoot: input.workspaceRoot,
        });
      }
      if (authority === undefined) {
        throw new Error("package deployment authority is unavailable");
      }
      const before = await ensureFiveNorthSottoControlPackagePresenceOnly(
        input.transport,
      );
      if (before) {
        await markFiveNorthPackagePresent({
          operationId: current.operationId,
          outcome: "already-present",
          workspaceRoot: input.workspaceRoot,
        });
        return terminalResult(
          await loadFiveNorthPackageDeploymentJournal(input.workspaceRoot),
        )!;
      }
      const bytes = verifiedSottoControlDarBytes(input.artifact);
      await input.transport.validateDar(bytes.slice(), authority);
      await assertOwned();
      let dispatchMarked = false;
      try {
        await input.transport.uploadDar(bytes.slice(), authority, async () => {
          await assertOwned();
          await markFiveNorthPackageUploadStarted({
            operationId: current.operationId,
            workspaceRoot: input.workspaceRoot,
          });
          dispatchMarked = true;
        });
      } catch (error) {
        if (!dispatchMarked) throw error;
      }
      return reconcileOnly({
        state: await loadFiveNorthPackageDeploymentJournal(input.workspaceRoot),
        transport: input.transport,
        workspaceRoot: input.workspaceRoot,
      });
    },
  });
}
