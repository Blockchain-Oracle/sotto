import {
  createFiveNorthCapabilityCompletionPageReader,
  createFiveNorthClient,
  createFiveNorthTokenProvider,
  parseFiveNorthJson,
  readCapabilityBootstrapCompletion,
  readFiveNorthResponse,
  type FiveNorthTokenProvider,
} from "@sotto/devnet-payment-spike";
import type {
  HumanReconciliationProbeRequest,
  HumanReconciliationReadOnlyAdapter,
} from "@sotto/purchase-worker";
import type { FiveNorthNetworkConfig } from "./network-config.js";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type FiveNorthHumanReconciliationAdapterOptions = Readonly<{
  fetcher?: Fetcher;
  signal?: AbortSignal;
}>;

const LEDGER_END_LIMIT = 65_536;
const LEDGER_END_TIMEOUT_MS = 10_000;
const UPDATE_ID_PATTERN = /^1220[0-9a-f]{64}$/u;

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function boundedText(value: unknown, label: string, maximum: number): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.trim() !== value ||
    new TextEncoder().encode(value).byteLength > maximum ||
    hasControlCharacter(value)
  ) {
    throw new Error(`human reconciliation ${label} is invalid`);
  }
  return value;
}

function requireProbeRequest(
  candidate: HumanReconciliationProbeRequest,
): HumanReconciliationProbeRequest {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate) ||
    JSON.stringify(Object.keys(candidate).sort()) !==
      JSON.stringify([
        "beginExclusive",
        "commandId",
        "payerParty",
        "providerParty",
        "submissionId",
        "synchronizerId",
        "userId",
      ])
  ) {
    throw new Error("human reconciliation probe request is invalid");
  }
  if (
    !Number.isSafeInteger(candidate.beginExclusive) ||
    candidate.beginExclusive < 0
  ) {
    throw new Error("human reconciliation begin offset is invalid");
  }
  return Object.freeze({
    beginExclusive: candidate.beginExclusive,
    commandId: boundedText(candidate.commandId, "command ID", 512),
    payerParty: boundedText(candidate.payerParty, "payer Party", 512),
    providerParty: boundedText(candidate.providerParty, "provider Party", 512),
    submissionId: boundedText(candidate.submissionId, "submission ID", 512),
    synchronizerId: boundedText(
      candidate.synchronizerId,
      "synchronizer ID",
      512,
    ),
    userId: boundedText(candidate.userId, "user ID", 255),
  });
}

function requireAdapterOptions(
  candidate: FiveNorthHumanReconciliationAdapterOptions,
): FiveNorthHumanReconciliationAdapterOptions {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate) ||
    Object.keys(candidate).some((key) => key !== "fetcher" && key !== "signal")
  ) {
    throw new Error("human reconciliation adapter options are invalid");
  }
  if (
    candidate.fetcher !== undefined &&
    typeof candidate.fetcher !== "function"
  ) {
    throw new Error("human reconciliation adapter fetcher is invalid");
  }
  if (
    candidate.signal !== undefined &&
    !(candidate.signal instanceof AbortSignal)
  ) {
    throw new Error("human reconciliation adapter signal is invalid");
  }
  return candidate;
}

function requireActive(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("human reconciliation probe cancelled");
  }
}

async function readLedgerEndOffset(
  ledgerUrl: string,
  fetcher: Fetcher,
  tokens: FiveNorthTokenProvider,
  signal: AbortSignal,
): Promise<number> {
  const token = await tokens.accessToken();
  const response = await fetcher(`${ledgerUrl}/v2/state/ledger-end`, {
    headers: { authorization: `Bearer ${token}` },
    method: "GET",
    redirect: "error",
    signal: AbortSignal.any([
      signal,
      AbortSignal.timeout(LEDGER_END_TIMEOUT_MS),
    ]),
  });
  const value = parseFiveNorthJson(
    await readFiveNorthResponse(response, LEDGER_END_LIMIT),
    "Five North reconciliation Ledger end",
  );
  const offset =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>).offset
      : undefined;
  if (!Number.isSafeInteger(offset) || (offset as number) < 0) {
    throw new Error("human reconciliation Ledger end is invalid");
  }
  return offset as number;
}

/**
 * Read-only Five North reconciliation probe. It scans command completions
 * from a begin-exclusive offset and, on success, fetches the raw settlement
 * transaction as the provider party. It performs no settlement verification
 * and holds no signing, prepare, or execute capability; the reconciliation
 * worker authenticates every returned transaction itself.
 */
export function createFiveNorthHumanReconciliationAdapter(
  network: FiveNorthNetworkConfig,
  candidateOptions: FiveNorthHumanReconciliationAdapterOptions = {},
): HumanReconciliationReadOnlyAdapter {
  const options = requireAdapterOptions(candidateOptions);
  const fetcher = options.fetcher ?? fetch;
  const scopeSignal = options.signal ?? new AbortController().signal;
  const tokens = createFiveNorthTokenProvider(network, fetcher, scopeSignal);

  return async (candidateRequest, callOptions) => {
    const request = requireProbeRequest(candidateRequest);
    if (!(callOptions?.signal instanceof AbortSignal)) {
      throw new Error("human reconciliation probe requires an AbortSignal");
    }
    const signal = AbortSignal.any([scopeSignal, callOptions.signal]);
    requireActive(signal);
    const readPage = createFiveNorthCapabilityCompletionPageReader({
      fetcher,
      ledgerUrl: network.ledgerUrl,
      payerParty: request.payerParty,
      signal,
      tokenProvider: tokens,
    });
    const completion = await readCapabilityBootstrapCompletion({
      beginExclusive: request.beginExclusive,
      readLedgerEndOffset: () =>
        readLedgerEndOffset(network.ledgerUrl, fetcher, tokens, signal),
      readPage,
      request: Object.freeze({
        actAs: Object.freeze([request.payerParty]) as readonly [string],
        commandId: request.commandId,
        userId: request.userId,
      }),
    });
    requireActive(signal);
    if (completion.classification === "ABSENT_COMPLETE") {
      return Object.freeze({
        outcome: "pending",
        scannedThroughOffset: completion.completionOffset,
      });
    }
    if (completion.classification === "REJECTED") {
      return Object.freeze({
        outcome: "rejected",
        completionOffset: completion.completionOffset,
        statusCode: completion.statusCode,
        submissionId: request.submissionId,
        synchronizerId: request.synchronizerId,
      });
    }
    if (!UPDATE_ID_PATTERN.test(completion.updateId)) {
      throw new Error("human reconciliation update ID is invalid");
    }
    const transaction = await createFiveNorthClient(
      network,
      fetcher,
    ).getTransaction(completion.updateId, request.providerParty);
    requireActive(signal);
    return Object.freeze({
      outcome: "succeeded",
      completionOffset: completion.completionOffset,
      updateId: completion.updateId,
      submissionId: request.submissionId,
      synchronizerId: request.synchronizerId,
      transaction,
    });
  };
}
