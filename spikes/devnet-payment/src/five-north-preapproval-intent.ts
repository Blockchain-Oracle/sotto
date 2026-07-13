import { isDeepStrictEqual } from "node:util";
import {
  buildFiveNorthPreapprovalProposal,
  readFiveNorthPreapprovalProposalInput,
  type FiveNorthPreapprovalProposalInput,
  type FiveNorthPreapprovalProposalRequest,
} from "./five-north-preapproval-proposal.js";

const SOURCE_COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const INPUT_KEYS = [
  "expectedDso",
  "packageId",
  "receiverParty",
  "synchronizerId",
  "userId",
  "validatorParty",
] as const;

export type PersistedFiveNorthPreapprovalIntentV1 = Readonly<{
  input: FiveNorthPreapprovalProposalInput;
  request: FiveNorthPreapprovalProposalRequest;
  schema: "sotto-transfer-preapproval-intent-v1";
  sourceCommit: string;
}>;

function exactObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  if (
    JSON.stringify(Object.keys(record).sort()) !==
    JSON.stringify([...keys].sort())
  ) {
    throw new Error(`${label} keys are invalid`);
  }
  return record;
}

function sourceCommit(value: unknown): string {
  if (typeof value !== "string" || !SOURCE_COMMIT_PATTERN.test(value)) {
    throw new Error("preapproval source commit must be a full Git SHA-1");
  }
  return value;
}

export function exportFiveNorthPreapprovalIntent(
  request: FiveNorthPreapprovalProposalRequest,
  candidateSourceCommit: string,
): PersistedFiveNorthPreapprovalIntentV1 {
  return Object.freeze({
    input: readFiveNorthPreapprovalProposalInput(request),
    request,
    schema: "sotto-transfer-preapproval-intent-v1" as const,
    sourceCommit: sourceCommit(candidateSourceCommit),
  });
}

export function restoreFiveNorthPreapprovalIntent(
  value: unknown,
): FiveNorthPreapprovalProposalRequest {
  const intent = exactObject(
    value,
    ["input", "request", "schema", "sourceCommit"],
    "persisted preapproval intent",
  );
  if (intent.schema !== "sotto-transfer-preapproval-intent-v1") {
    throw new Error("persisted preapproval intent schema is unsupported");
  }
  sourceCommit(intent.sourceCommit);
  const rawInput = exactObject(
    intent.input,
    INPUT_KEYS,
    "persisted preapproval input",
  ) as FiveNorthPreapprovalProposalInput;
  const restored = buildFiveNorthPreapprovalProposal(rawInput);
  if (!isDeepStrictEqual(restored, intent.request)) {
    throw new Error("persisted preapproval request does not match its intent");
  }
  return restored;
}
