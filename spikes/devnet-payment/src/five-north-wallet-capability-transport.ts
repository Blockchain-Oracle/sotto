import {
  MAX_PREPARED_CAPABILITY_RESPONSE_BYTES,
  PREPARED_CAPABILITY_BOOTSTRAP_PATH,
  PREPARED_CAPABILITY_BOOTSTRAP_TIMEOUT_MS,
  type PreparedCapabilityBootstrapTransportRequest,
} from "@sotto/x402-canton";
import type { CapabilityWalletBootstrapRunnerInput } from "./capability-wallet-bootstrap-runner.js";
import type { FiveNorthPrepareTransport } from "./five-north-prepare-transport.js";

type Input = Readonly<{
  execute: CapabilityWalletBootstrapRunnerInput["execute"];
  prepareTransport: FiveNorthPrepareTransport;
  readCompletion: CapabilityWalletBootstrapRunnerInput["readCompletion"];
}>;

function ledgerOffset(value: unknown): number {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("wallet capability ledger end is invalid");
  }
  const offset = (value as Record<string, unknown>).offset;
  if (!Number.isSafeInteger(offset) || (offset as number) < 0) {
    throw new Error("wallet capability ledger offset is invalid");
  }
  return offset as number;
}

function requirePrepareEnvelope(
  request: PreparedCapabilityBootstrapTransportRequest,
): void {
  if (
    request.path !== PREPARED_CAPABILITY_BOOTSTRAP_PATH ||
    request.method !== "POST" ||
    request.contentType !== "application/json" ||
    request.redirect !== "error" ||
    request.timeoutMilliseconds !== PREPARED_CAPABILITY_BOOTSTRAP_TIMEOUT_MS ||
    request.maximumResponseBytes !== MAX_PREPARED_CAPABILITY_RESPONSE_BYTES
  ) {
    throw new Error("wallet capability prepare envelope is not approved");
  }
}

export function createFiveNorthWalletCapabilityTransport(input: Input) {
  const readLedgerEndOffset = async () =>
    ledgerOffset(await input.prepareTransport.readLedgerEnd());
  return Object.freeze({
    execute: input.execute,
    prepare: async (request: PreparedCapabilityBootstrapTransportRequest) => {
      requirePrepareEnvelope(request);
      return input.prepareTransport.readPrepare(request.body as never);
    },
    readActiveCapabilities: async () =>
      input.prepareTransport.readCapabilityContracts(
        await readLedgerEndOffset(),
      ),
    readAuthenticatedUserId: input.prepareTransport.readAuthenticatedUserId,
    readCompletion: input.readCompletion,
    readLedgerEndOffset,
  });
}
