import {
  assertBoundedCapabilityBootstrapFresh,
  SOTTO_CONTROL_PACKAGE_ID,
  TRANSFER_FACTORY_REGISTRY_PATH,
  type BoundedCapabilityBootstrapRequest,
} from "@sotto/x402-canton";
import type { SpikeConfig } from "./config.js";
import {
  CAPABILITY_COMPLETION_QUERY,
  createFiveNorthCapabilityCompletionPageReader,
} from "./five-north-capability-completion-transport.js";
import { createFiveNorthCapabilityReadinessTransport } from "./five-north-capability-readiness-transport.js";
import { approveFiveNorthPrepareNetwork } from "./five-north-prepare-network.js";
import { createFiveNorthPrepareTransport } from "./five-north-prepare-transport.js";
import { createFiveNorthPurchaseReaders } from "./five-north-purchase-readers.js";
import {
  createFiveNorthTokenProvider,
  readFiveNorthAccessTokenSubject,
} from "./five-north-token.js";
import { createFiveNorthTransactionSubmitter } from "./five-north-transaction-submit.js";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
type Options = Readonly<{ fetcher?: Fetcher; signal: AbortSignal }>;
type Route =
  | "acs"
  | "completion"
  | "ledgerEnd"
  | "package"
  | "preferred"
  | "registry"
  | "rules"
  | "submit"
  | "token";

const LIMITS: Readonly<Record<Route, number>> = Object.freeze({
  acs: 3,
  completion: 32,
  ledgerEnd: 5,
  package: 1,
  preferred: 1,
  registry: 1,
  rules: 1,
  submit: 1,
  token: 1,
});

function allowedRoutes(network: SpikeConfig["network"]): Map<string, Route> {
  return new Map([
    [`POST ${network.tokenUrl}`, "token"],
    [`POST ${network.ledgerUrl}${CAPABILITY_COMPLETION_QUERY}`, "completion"],
    [`GET ${network.validatorUrl}/v0/scan-proxy/amulet-rules`, "rules"],
    [
      `GET ${network.ledgerUrl}/v2/packages/${SOTTO_CONTROL_PACKAGE_ID}`,
      "package",
    ],
    [
      `POST ${network.ledgerUrl}/v2/interactive-submission/preferred-packages`,
      "preferred",
    ],
    [`GET ${network.ledgerUrl}/v2/state/ledger-end`, "ledgerEnd"],
    [`POST ${network.ledgerUrl}/v2/state/active-contracts`, "acs"],
    [
      `POST ${network.validatorUrl}/v0/scan-proxy${TRANSFER_FACTORY_REGISTRY_PATH}`,
      "registry",
    ],
    [
      `POST ${network.ledgerUrl}/v2/commands/submit-and-wait-for-transaction`,
      "submit",
    ],
  ]);
}

export function createFiveNorthCapabilityBootstrapNetworkGuard(
  candidateNetwork: SpikeConfig["network"],
  options: Options,
): Fetcher & { counts: () => Readonly<Record<Route, number>> } {
  const network = approveFiveNorthPrepareNetwork(candidateNetwork);
  if (!(options.signal instanceof AbortSignal)) {
    throw new Error("Five North capability bootstrap requires an AbortSignal");
  }
  const fetcher = options.fetcher ?? fetch;
  const routes = allowedRoutes(network);
  const counts: Record<Route, number> = {
    acs: 0,
    completion: 0,
    ledgerEnd: 0,
    package: 0,
    preferred: 0,
    registry: 0,
    rules: 0,
    submit: 0,
    token: 0,
  };
  const guarded = async (url: string, init: RequestInit = {}) => {
    if (options.signal.aborted) {
      throw new Error("Five North capability bootstrap scope cancelled");
    }
    const route = routes.get(`${init.method ?? "GET"} ${url}`);
    if (route === undefined) {
      throw new Error(
        "Five North capability bootstrap network boundary failed",
      );
    }
    counts[route] += 1;
    if (counts[route] > LIMITS[route]) {
      throw new Error("Five North capability bootstrap network limit exceeded");
    }
    const signal =
      init.signal == null
        ? options.signal
        : AbortSignal.any([options.signal, init.signal]);
    return fetcher(url, { ...init, signal });
  };
  guarded.counts = () => Object.freeze({ ...counts });
  return guarded;
}

function ledgerOffset(value: unknown): number {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("capability bootstrap ledger end is invalid");
  }
  const record = value as Record<string, unknown>;
  if (!Number.isSafeInteger(record.offset) || (record.offset as number) < 0) {
    throw new Error("capability bootstrap ledger offset is invalid");
  }
  return record.offset as number;
}

export function createFiveNorthCapabilityBootstrapTransport(
  candidateNetwork: SpikeConfig["network"],
  payerParty: string,
  options: Options,
) {
  const network = approveFiveNorthPrepareNetwork(candidateNetwork);
  const guarded = createFiveNorthCapabilityBootstrapNetworkGuard(
    network,
    options,
  );
  const tokens = createFiveNorthTokenProvider(network, guarded, options.signal);
  const shared = {
    fetcher: guarded,
    signal: options.signal,
    tokenProvider: tokens,
  };
  const readiness = createFiveNorthCapabilityReadinessTransport(
    network,
    shared,
  );
  const prepare = createFiveNorthPrepareTransport(network, payerParty, shared);
  const purchase = createFiveNorthPurchaseReaders(prepare, payerParty);
  const readCompletionPage = createFiveNorthCapabilityCompletionPageReader({
    fetcher: guarded,
    ledgerUrl: network.ledgerUrl,
    payerParty,
    signal: options.signal,
    tokenProvider: tokens,
  });
  let submissionClaimed = false;
  const submitTransaction = async (
    request: BoundedCapabilityBootstrapRequest,
  ): Promise<unknown> => {
    assertBoundedCapabilityBootstrapFresh(request);
    if (submissionClaimed) {
      throw new Error(
        "Five North capability bootstrap submission limit exceeded",
      );
    }
    submissionClaimed = true;
    return createFiveNorthTransactionSubmitter({
      accessToken: async () => {
        const token = await tokens.accessToken();
        if (readFiveNorthAccessTokenSubject(token) !== request.userId) {
          throw new Error("capability bootstrap token subject does not match");
        }
        assertBoundedCapabilityBootstrapFresh(request);
        return token;
      },
      fetcher: guarded,
      ledgerUrl: network.ledgerUrl,
    })(request);
  };
  return Object.freeze({
    factory: Object.freeze({
      holdings: purchase.holdings,
      readAuthenticatedUserId: prepare.readAuthenticatedUserId,
      registry: purchase.registry,
    }),
    networkCallCounts: guarded.counts,
    readActiveCapabilities: async () =>
      prepare.readCapabilityContracts(
        ledgerOffset(await prepare.readLedgerEnd()),
      ),
    readCompletionPage,
    readLedgerEndOffset: async () =>
      ledgerOffset(await prepare.readLedgerEnd()),
    readiness,
    submit: submitTransaction,
  });
}
