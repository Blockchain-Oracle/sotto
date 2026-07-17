import type { SpikeConfig } from "./config.js";
import {
  readCapabilityBootstrapCompletion,
  type CommandCompletionIdentity,
} from "./capability-bootstrap-completion.js";
import { createFiveNorthCapabilityCompletionPageReader } from "./five-north-capability-completion-transport.js";
import { approveFiveNorthPrepareNetwork } from "./five-north-prepare-network.js";
import {
  parseFiveNorthJson,
  readFiveNorthResponse,
} from "./five-north-response.js";
import { createFiveNorthTokenProvider } from "./five-north-token.js";
import { awaitTerminalCommandCompletion } from "./terminal-command-completion.js";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
type Options = Readonly<{ fetcher?: Fetcher; signal: AbortSignal }>;
type CompletionInput = Readonly<{
  beginExclusive: number;
  commandId: string;
  userId: string;
}>;

const LEDGER_END_LIMIT = 65_536;
const LEDGER_END_TIMEOUT_MS = 10_000;
const COMPLETION_ATTEMPT_LIMIT = 20;
const COMPLETION_RETRY_MS = 250;

function identifier(value: unknown, label: string, maximum: number): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.trim() !== value ||
    new TextEncoder().encode(value).byteLength > maximum
  ) {
    throw new Error(`human wallet completion ${label} is invalid`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      throw new Error(`human wallet completion ${label} is invalid`);
    }
  }
  return value;
}

function offset(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error("human wallet completion Ledger end is invalid");
  }
  return value as number;
}

function delay(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("human wallet completion cancelled"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, COMPLETION_RETRY_MS);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

export function createFiveNorthHumanWalletCompletionTransport(
  candidateNetwork: SpikeConfig["network"],
  candidatePayerParty: string,
  options: Options,
) {
  const network = approveFiveNorthPrepareNetwork(candidateNetwork);
  const payerParty = identifier(candidatePayerParty, "payer Party", 512);
  if (!(options.signal instanceof AbortSignal)) {
    throw new Error("human wallet completion requires an AbortSignal");
  }
  const fetcher = options.fetcher ?? fetch;
  const tokens = createFiveNorthTokenProvider(network, fetcher, options.signal);
  const readPage = createFiveNorthCapabilityCompletionPageReader({
    fetcher,
    ledgerUrl: network.ledgerUrl,
    payerParty,
    signal: options.signal,
    tokenProvider: tokens,
  });

  const readLedgerEnd = async (): Promise<number> => {
    const token = await tokens.accessToken();
    const response = await fetcher(`${network.ledgerUrl}/v2/state/ledger-end`, {
      headers: { authorization: `Bearer ${token}` },
      method: "GET",
      redirect: "error",
      signal: AbortSignal.any([
        options.signal,
        AbortSignal.timeout(LEDGER_END_TIMEOUT_MS),
      ]),
    });
    const value = parseFiveNorthJson(
      await readFiveNorthResponse(response, LEDGER_END_LIMIT),
      "Five North human wallet Ledger end",
    );
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("human wallet completion Ledger end is invalid");
    }
    return offset((value as Record<string, unknown>).offset);
  };

  return Object.freeze({
    readLedgerEnd,
    awaitCompletion: async (input: CompletionInput) => {
      const request: CommandCompletionIdentity = Object.freeze({
        actAs: Object.freeze([payerParty]) as readonly [string],
        commandId: identifier(input.commandId, "command ID", 512),
        userId: identifier(input.userId, "user ID", 255),
      });
      return await awaitTerminalCommandCompletion({
        attemptLimit: COMPLETION_ATTEMPT_LIMIT,
        readCompletion: () =>
          readCapabilityBootstrapCompletion({
            beginExclusive: input.beginExclusive,
            readLedgerEndOffset: readLedgerEnd,
            readPage,
            request,
          }),
        signal: options.signal,
        waitForRetry: () => delay(options.signal),
      });
    },
  });
}
