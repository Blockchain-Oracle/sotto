import { SOTTO_CONTROL_PACKAGE_ID } from "@sotto/x402-canton";
import type { VerifiedSottoControlDar } from "./five-north-dar-artifact.js";
import type { FiveNorthPackageDeploymentAuthority } from "./five-north-package-deployment.js";
import { withOwnerOnlyBootstrapLease } from "./capability-bootstrap-lease.js";
import {
  prepareOwnerOnlyBootstrapJournalDirectory,
  readCapabilityBootstrapJournalJson,
  writeExclusiveCapabilityBootstrapJson,
} from "./capability-bootstrap-journal-storage.js";
import {
  fiveNorthPackageDeploymentIntent,
  isMissingPackageJournalRecord,
  packageIntentRecord,
  PACKAGE_JOURNAL_DIRECTORY,
  PACKAGE_JOURNAL_SCHEMA,
  PACKAGE_LEASE_SCHEMA,
  packageJournalSha256,
  parsePackageIntentRecord,
  parsePackageTerminalRecord,
  parsePackageUploadRecord,
  type FiveNorthPackageDeploymentTerminal,
  type PackageUploadRecord,
} from "./five-north-package-deployment-journal-records.js";

export {
  fiveNorthPackageDeploymentIntent,
  type FiveNorthPackageDeploymentIntent,
  type FiveNorthPackageDeploymentTerminal,
} from "./five-north-package-deployment-journal-records.js";

async function directory(workspaceRoot: string): Promise<string> {
  return prepareOwnerOnlyBootstrapJournalDirectory(
    workspaceRoot,
    PACKAGE_JOURNAL_DIRECTORY,
  );
}

export async function initializeFiveNorthPackageDeploymentJournal(input: {
  artifact: VerifiedSottoControlDar;
  authority: FiveNorthPackageDeploymentAuthority;
  workspaceRoot: string;
}) {
  const target = await directory(input.workspaceRoot);
  const record = packageIntentRecord(fiveNorthPackageDeploymentIntent(input));
  await writeExclusiveCapabilityBootstrapJson(target, "00-intent.json", record);
  return Object.freeze({ operationId: record.operationId });
}

export async function loadFiveNorthPackageDeploymentJournal(
  workspaceRoot: string,
) {
  const target = await directory(workspaceRoot);
  const record = parsePackageIntentRecord(
    await readCapabilityBootstrapJournalJson(target, "00-intent.json"),
  );
  const intentRecordSha256 = packageJournalSha256(JSON.stringify(record));
  let upload: PackageUploadRecord | undefined;
  try {
    upload = parsePackageUploadRecord(
      await readCapabilityBootstrapJournalJson(
        target,
        "10-upload-started.json",
      ),
      record.operationId,
      intentRecordSha256,
    );
  } catch (error) {
    if (!isMissingPackageJournalRecord(error)) throw error;
  }
  let terminal: FiveNorthPackageDeploymentTerminal | undefined;
  try {
    terminal = parsePackageTerminalRecord(
      await readCapabilityBootstrapJournalJson(target, "30-present.json"),
      record.operationId,
      intentRecordSha256,
      upload,
    );
  } catch (error) {
    if (!isMissingPackageJournalRecord(error)) throw error;
  }
  return Object.freeze({
    intent: record.payload,
    intentRecordSha256,
    operationId: record.operationId,
    terminal: terminal ?? null,
    uploadRecordSha256:
      upload === undefined
        ? null
        : packageJournalSha256(JSON.stringify(upload)),
    uploadStarted: upload !== undefined,
  });
}

export async function markFiveNorthPackageUploadStarted(input: {
  operationId: string;
  workspaceRoot: string;
}): Promise<void> {
  const target = await directory(input.workspaceRoot);
  const state = await loadFiveNorthPackageDeploymentJournal(
    input.workspaceRoot,
  );
  if (state.operationId !== input.operationId || state.terminal !== null) {
    throw new Error("package upload cannot start from current journal state");
  }
  await writeExclusiveCapabilityBootstrapJson(
    target,
    "10-upload-started.json",
    {
      kind: "upload-started",
      operationId: state.operationId,
      previousRecordSha256: state.intentRecordSha256,
      recordedAt: new Date().toISOString(),
      schema: PACKAGE_JOURNAL_SCHEMA,
    },
  );
}

export async function markFiveNorthPackagePresent(input: {
  operationId: string;
  outcome: "already-present" | "present-after-dispatch";
  workspaceRoot: string;
}): Promise<void> {
  const target = await directory(input.workspaceRoot);
  const state = await loadFiveNorthPackageDeploymentJournal(
    input.workspaceRoot,
  );
  const previousRecordSha256 =
    state.uploadRecordSha256 ?? state.intentRecordSha256;
  if (
    state.operationId !== input.operationId ||
    state.terminal !== null ||
    state.uploadStarted !== (input.outcome === "present-after-dispatch")
  ) {
    throw new Error("package presence cannot resolve current journal state");
  }
  await writeExclusiveCapabilityBootstrapJson(target, "30-present.json", {
    kind: "present",
    operationId: state.operationId,
    outcome: input.outcome,
    packageId: SOTTO_CONTROL_PACKAGE_ID,
    previousRecordSha256,
    recordedAt: new Date().toISOString(),
    schema: PACKAGE_JOURNAL_SCHEMA,
  });
}

export function withFiveNorthPackageDeploymentLease<T>(input: {
  action: (assertOwned: () => Promise<void>) => Promise<T>;
  operationId: string;
  workspaceRoot: string;
}): Promise<T> {
  return withOwnerOnlyBootstrapLease({
    ...input,
    directoryName: PACKAGE_JOURNAL_DIRECTORY,
    leaseSchema: PACKAGE_LEASE_SCHEMA,
  });
}
