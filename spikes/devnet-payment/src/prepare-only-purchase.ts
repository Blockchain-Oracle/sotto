import {
  buildBoundedPurchasePrepareRequest,
  commitBoundedPurchase,
  commitHttpRequest,
  createPreparedPurchaseObserver,
  createPurchaseCapabilityObserver,
  createPurchaseHoldingObserver,
  createTransferFactoryObserver,
  FIVE_NORTH_TRANSFER_FACTORY_IMPLEMENTATION_ID,
  readBoundedPurchaseLedgerIntent,
  TOKEN_TRANSFER_FACTORY_INTERFACE_ID,
  type PreparedPurchaseObservation,
} from "@sotto/x402-canton";
import type { FiveNorthPurchaseReaders } from "./five-north-purchase-readers.js";
import { observeHttpChallenge } from "./http-observer.js";

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
type UrlAuthority = (url: URL) => Promise<void>;

export type PrepareOnlyPurchaseInput = Readonly<{
  authorizationInstanceId: string;
  authorizeUrl: UrlAuthority;
  capabilityContractId: string;
  expectedAdmin: string;
  expectedNetwork: `canton:${string}`;
  fetcher: Fetcher;
  method: string;
  payerParty: string;
  readers: FiveNorthPurchaseReaders;
  requestBody?: Uint8Array;
  resourceUrl: string;
  tokenFactoryContractId: string;
}>;

export type PrepareOnlyPurchaseResult = Readonly<{
  attemptId: `sha256:${string}`;
  prepared: PreparedPurchaseObservation;
  purchaseCommitment: `sha256:${string}`;
  status: "prepared-not-signed";
}>;

export async function prepareOnlyPurchase(
  input: PrepareOnlyPurchaseInput,
): Promise<PrepareOnlyPurchaseResult> {
  const requestBody =
    input.requestBody === undefined
      ? undefined
      : new Uint8Array(input.requestBody);
  const binding = commitHttpRequest({
    method: input.method,
    url: input.resourceUrl,
    ...(requestBody === undefined ? {} : { body: new Uint8Array(requestBody) }),
  });
  const challenge = await observeHttpChallenge({
    authorizeUrl: input.authorizeUrl,
    fetcher: input.fetcher,
    method: input.method,
    ...(requestBody === undefined
      ? {}
      : { requestBody: new Uint8Array(requestBody) }),
    resourceUrl: input.resourceUrl,
  });
  const capability = await createPurchaseCapabilityObserver(
    input.readers.capability,
  )(input.capabilityContractId);
  const purchase = commitBoundedPurchase({
    authorizationInstanceId: input.authorizationInstanceId,
    binding,
    capability,
    expectedNetwork: input.expectedNetwork,
    paymentObservation: challenge.paymentObservation,
    payerParty: input.payerParty,
    tokenFactory: {
      contractId: input.tokenFactoryContractId,
      expectedAdmin: input.expectedAdmin,
      implementationTemplateId: FIVE_NORTH_TRANSFER_FACTORY_IMPLEMENTATION_ID,
      interfaceId: TOKEN_TRANSFER_FACTORY_INTERFACE_ID,
    },
  });
  const intent = readBoundedPurchaseLedgerIntent(purchase);
  const holdings = await createPurchaseHoldingObserver(input.readers.holdings)(
    intent,
  );
  const registry = await createTransferFactoryObserver(input.readers.registry)(
    intent,
    holdings,
  );
  const prepareRequest = buildBoundedPurchasePrepareRequest(
    intent,
    holdings,
    registry,
  );
  const prepared = await createPreparedPurchaseObserver(input.readers.prepared)(
    prepareRequest,
  );
  return Object.freeze({
    attemptId: intent.attemptId,
    prepared,
    purchaseCommitment: intent.purchaseCommitment,
    status: "prepared-not-signed" as const,
  });
}
