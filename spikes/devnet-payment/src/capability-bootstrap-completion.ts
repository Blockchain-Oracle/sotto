import type { BoundedCapabilityBootstrapRequest } from "@sotto/x402-canton";
import { isGoogleRpcStatusCode } from "./canton-status-code.js";
import {
  completionExactKeys as exactKeys,
  completionObject as objectValue,
  completionOffset as offset,
} from "./capability-bootstrap-completion-validation.js";

export type CapabilityBootstrapCompletionQuery = Readonly<{
  beginExclusive: number;
  limit: 1_000;
  parties: readonly [string];
  userId: string;
}>;

export type CapabilityBootstrapCompletion =
  | Readonly<{
      classification: "ABSENT_COMPLETE";
      completionOffset: number;
    }>
  | Readonly<{
      classification: "REJECTED";
      completionOffset: number;
      statusCode: number;
    }>
  | Readonly<{
      classification: "SUCCEEDED";
      completionOffset: number;
      updateId: string;
    }>;

type CompletionReaderInput = Readonly<{
  beginExclusive: number;
  readLedgerEndOffset: () => Promise<number>;
  readPage: (query: CapabilityBootstrapCompletionQuery) => Promise<unknown>;
  request: BoundedCapabilityBootstrapRequest;
}>;

function completionValue(value: unknown): Record<string, unknown> {
  const wrapper = objectValue(value, "completion variant");
  exactKeys(wrapper, ["value"], "completion variant");
  return objectValue(wrapper.value, "completion value");
}

export async function readCapabilityBootstrapCompletion(
  input: CompletionReaderInput,
): Promise<CapabilityBootstrapCompletion> {
  const beginExclusive = offset(input.beginExclusive, "completion begin");
  const reconciliationEnd = offset(
    await input.readLedgerEndOffset(),
    "completion end",
  );
  if (reconciliationEnd < beginExclusive) {
    throw new Error("completion end moved backwards");
  }
  let reachedOffset = beginExclusive;
  let match: Record<string, unknown> | undefined;
  let pageCount = 0;
  while (reachedOffset < reconciliationEnd) {
    pageCount += 1;
    if (pageCount > 32) {
      throw new Error("completion page limit exceeded");
    }
    const page = await input.readPage(
      Object.freeze({
        beginExclusive: reachedOffset,
        limit: 1_000 as const,
        parties: Object.freeze([...input.request.actAs]) as readonly [string],
        userId: input.request.userId,
      }),
    );
    if (!Array.isArray(page) || page.length > 1_000) {
      throw new Error("completion page is invalid");
    }
    let pageOffset = reachedOffset;
    let lastEntryOffset = reachedOffset;
    for (const candidate of page) {
      const entry = objectValue(candidate, "completion stream entry");
      exactKeys(entry, ["completionResponse"], "completion stream entry");
      const response = objectValue(
        entry.completionResponse,
        "completion stream response",
      );
      const variants = Object.keys(response);
      if (
        variants.length !== 1 ||
        !["Completion", "Empty", "OffsetCheckpoint"].includes(variants[0]!)
      ) {
        throw new Error("completion response variant is invalid");
      }
      if (response.Empty !== undefined) {
        exactKeys(
          objectValue(response.Empty, "empty completion variant"),
          [],
          "empty completion variant",
        );
        continue;
      }
      if (response.OffsetCheckpoint !== undefined) {
        const wrapper = objectValue(
          response.OffsetCheckpoint,
          "completion checkpoint",
        );
        exactKeys(wrapper, ["value"], "completion checkpoint");
        const checkpoint = objectValue(
          wrapper.value,
          "completion checkpoint value",
        );
        const checkpointOffset = offset(
          checkpoint.offset,
          "completion checkpoint",
        );
        if (checkpointOffset < lastEntryOffset) {
          throw new Error("completion offsets are not monotonic");
        }
        lastEntryOffset = checkpointOffset;
        pageOffset = Math.max(pageOffset, checkpointOffset);
        continue;
      }
      const value = completionValue(response.Completion);
      const completionOffset = offset(value.offset, "command completion");
      if (
        completionOffset <= reachedOffset ||
        completionOffset < lastEntryOffset
      ) {
        throw new Error(
          "command completion offset violates begin-exclusive order",
        );
      }
      lastEntryOffset = completionOffset;
      pageOffset = Math.max(pageOffset, completionOffset);
      if (
        completionOffset > reconciliationEnd ||
        value.commandId !== input.request.commandId
      ) {
        continue;
      }
      if (match !== undefined) {
        throw new Error("duplicate command completions observed");
      }
      match = value;
    }
    if (pageOffset <= reachedOffset) {
      continue;
    }
    reachedOffset = pageOffset;
  }
  if (match === undefined) {
    return Object.freeze({
      classification: "ABSENT_COMPLETE" as const,
      completionOffset: reconciliationEnd,
    });
  }
  if (
    match.userId !== input.request.userId ||
    JSON.stringify(match.actAs) !== JSON.stringify(input.request.actAs)
  ) {
    throw new Error("command completion authority does not match");
  }
  const completionOffset = offset(match.offset, "command completion");
  const status = objectValue(match.status, "command completion status");
  if (!isGoogleRpcStatusCode(status.code)) {
    throw new Error("command completion status is invalid");
  }
  if (status.code !== 0) {
    return Object.freeze({
      classification: "REJECTED" as const,
      completionOffset,
      statusCode: status.code as number,
    });
  }
  if (
    typeof match.updateId !== "string" ||
    match.updateId === "" ||
    match.updateId.trim() !== match.updateId ||
    new TextEncoder().encode(match.updateId).byteLength > 512
  ) {
    throw new Error("successful completion update ID is invalid");
  }
  return Object.freeze({
    classification: "SUCCEEDED" as const,
    completionOffset,
    updateId: match.updateId,
  });
}
