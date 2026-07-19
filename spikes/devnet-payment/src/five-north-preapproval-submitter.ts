import type { SpikeConfig } from "./config.js";
import { approveFiveNorthPrepareNetwork } from "./five-north-prepare-network.js";
import {
  readFiveNorthPreapprovalProposalBinding,
  type FiveNorthPreapprovalProposalRequest,
} from "./five-north-preapproval-proposal.js";
import { createFiveNorthTokenProvider } from "./five-north-token.js";
import { createFiveNorthTransactionSubmitter } from "./five-north-transaction-submit.js";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export function createFiveNorthPreapprovalSubmitter(
  candidateNetwork: SpikeConfig["network"],
  options: Readonly<{ fetcher?: Fetcher; signal: AbortSignal }>,
) {
  const network = approveFiveNorthPrepareNetwork(candidateNetwork);
  const fetcher = options.fetcher ?? fetch;
  if (!(options.signal instanceof AbortSignal)) {
    throw new Error("Five North preapproval submitter requires an AbortSignal");
  }
  const tokens = createFiveNorthTokenProvider(network, fetcher, options.signal);
  const scopedFetcher: Fetcher = (url, init = {}) => {
    if (options.signal.aborted) {
      throw new Error("Five North preapproval scope cancelled");
    }
    const signal =
      init.signal == null
        ? options.signal
        : AbortSignal.any([options.signal, init.signal]);
    return fetcher(url, { ...init, signal });
  };
  const submit = createFiveNorthTransactionSubmitter({
    accessToken: tokens.accessToken,
    fetcher: scopedFetcher,
    ledgerUrl: network.ledgerUrl,
    result: "transaction",
  });
  return async (request: FiveNorthPreapprovalProposalRequest) => {
    readFiveNorthPreapprovalProposalBinding(request);
    return submit(request);
  };
}
