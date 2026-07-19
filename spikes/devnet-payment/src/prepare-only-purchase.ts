import {
  buildBoundedPurchasePrepareRequest,
  commitBoundedPurchase,
  commitHttpRequest,
  createPreparedPurchaseObserver,
  createPurchaseCapabilityObserver,
  createPurchaseHoldingObserver,
  createTransferFactoryObserver,
  FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID,
  readBoundedPurchaseLedgerIntent,
  readPurchaseCapabilityAgentParty,
  TOKEN_TRANSFER_FACTORY_INTERFACE_ID,
  type PreparedPurchaseObservation,
} from "@sotto/x402-canton";
import type { FiveNorthPurchaseReaders } from "./five-north-purchase-readers.js";
import {
  observeHttpChallenge,
  type AuthorizedFetcher,
} from "./http-observer.js";
import {
  bindChallengeDeadline,
  challengeExecuteBefore,
  createPrepareOnlyScope,
  requirePrepareOnlyActive,
} from "./prepare-only-deadline.js";
import {
  acquirePrepareOnlyPackageSelection,
  type PrepareOnlyPackageSelectionClaimer,
  type PrepareOnlyPackageSelectionScope,
} from "./prepare-only-package-selection.js";

export type { PrepareOnlyPackageSelectionScope };

export type PrepareOnlyPurchaseInput = Readonly<{
  authorizationInstanceId: string;
  capabilityContractId: string;
  claimPackageSelection: PrepareOnlyPackageSelectionClaimer;
  createReaders: (signal: AbortSignal) => FiveNorthPurchaseReaders;
  expectedAdmin: string;
  expectedNetwork: `canton:${string}`;
  fetchAuthorized: AuthorizedFetcher;
  method: string;
  payerParty: string;
  requestBody?: Uint8Array;
  resourceUrl: string;
  signal?: AbortSignal;
  timeoutMilliseconds?: number;
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
  let scope = createPrepareOnlyScope(input.signal, input.timeoutMilliseconds);
  try {
    requirePrepareOnlyActive(scope);
    const requestBody =
      input.requestBody === undefined
        ? undefined
        : new Uint8Array(input.requestBody);
    const binding = commitHttpRequest({
      method: input.method,
      url: input.resourceUrl,
      ...(requestBody === undefined
        ? {}
        : { body: new Uint8Array(requestBody) }),
    });
    const challenge = await observeHttpChallenge({
      fetchAuthorized: input.fetchAuthorized,
      method: input.method,
      ...(requestBody === undefined
        ? {}
        : { requestBody: new Uint8Array(requestBody) }),
      resourceUrl: input.resourceUrl,
      signal: scope.signal,
    });
    requirePrepareOnlyActive(scope);
    const challengeObservedAt = challenge.paymentObservation.observedAt;
    scope = bindChallengeDeadline(
      scope,
      challengeObservedAt,
      challenge.challenge,
    );
    requirePrepareOnlyActive(scope);
    const readers = input.createReaders(scope.signal);
    const capability = await createPurchaseCapabilityObserver(
      readers.capability,
    )(input.capabilityContractId);
    requirePrepareOnlyActive(scope);
    const packageSelection = await acquirePrepareOnlyPackageSelection(
      input.claimPackageSelection,
      {
        adminParty: challenge.challenge.extra.instrumentId.admin,
        agentParty: readPurchaseCapabilityAgentParty(capability),
        challengeObservedAt,
        executeBefore: challengeExecuteBefore(
          challengeObservedAt,
          challenge.challenge,
        ),
        payerParty: input.payerParty,
        providerParty: challenge.challenge.payTo,
        signal: scope.signal,
        synchronizerId: challenge.challenge.extra.synchronizerId,
      },
    );
    requirePrepareOnlyActive(scope);
    const purchase = commitBoundedPurchase({
      authorizationInstanceId: input.authorizationInstanceId,
      binding,
      capability,
      expectedNetwork: input.expectedNetwork,
      packageSelection,
      paymentObservation: challenge.paymentObservation,
      payerParty: input.payerParty,
      tokenFactory: {
        contractId: input.tokenFactoryContractId,
        expectedAdmin: input.expectedAdmin,
        creationTemplateId: FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID,
        interfaceId: TOKEN_TRANSFER_FACTORY_INTERFACE_ID,
      },
    });
    const intent = readBoundedPurchaseLedgerIntent(purchase);
    const holdings = await createPurchaseHoldingObserver(readers.holdings)(
      intent,
    );
    requirePrepareOnlyActive(scope);
    const registry = await createTransferFactoryObserver(readers.registry)(
      intent,
      holdings,
    );
    requirePrepareOnlyActive(scope);
    const prepareRequest = buildBoundedPurchasePrepareRequest(
      intent,
      holdings,
      registry,
      packageSelection,
    );
    const prepared = await createPreparedPurchaseObserver(readers.prepared)(
      prepareRequest,
    );
    requirePrepareOnlyActive(scope);
    return Object.freeze({
      attemptId: intent.attemptId,
      prepared,
      purchaseCommitment: intent.purchaseCommitment,
      status: "prepared-not-signed" as const,
    });
  } catch (error) {
    requirePrepareOnlyActive(scope);
    throw error;
  }
}
