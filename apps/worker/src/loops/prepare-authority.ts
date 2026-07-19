import {
  createFiveNorthHumanPackageSelectionClaimer,
  type FiveNorthNetworkConfig,
} from "@sotto/canton-client";
import {
  createHumanPayerIdentityObserver,
  createHumanWalletConnectorPreflight,
} from "@sotto/x402-canton";
import type { HumanPrepareWorkerAuthorityResolver } from "@sotto/purchase-worker";
import type { SignerClient } from "../signer-client.js";
import { createSignerHumanWalletConnector } from "../signer-wallet.js";
import { createFiveNorthPayerIdentityReader } from "./payer-identity.js";

export type PrepareAuthorityResolverInput = Readonly<{
  network: FiveNorthNetworkConfig;
  signer: SignerClient;
}>;

/**
 * Restores prepare authority claimed from the repository: every durable
 * fact (challenge, payer identity, trusted configuration) arrives in the
 * keyring-authenticated scope, and this resolver re-proves it against the
 * live network — a fresh signer-service wallet preflight with real payer
 * liveness reads plus a fresh Five North package-preference claim. The
 * repository rejects the restoration if anything drifted.
 */
export function createPrepareAuthorityResolver(
  input: PrepareAuthorityResolverInput,
): HumanPrepareWorkerAuthorityResolver {
  return async (_resolution, scope, { signal }) => {
    const connector = createSignerHumanWalletConnector({
      signer: input.signer,
      scope,
    });
    const preflight = await createHumanWalletConnectorPreflight(
      {
        connector,
        connectorId: scope.connector.connectorId,
        connectorKind: scope.connector.connectorKind,
        connectorOrigin: scope.connector.origin,
        expectedPackageId: scope.connector.expectedPackageId,
        observePayerIdentity: createHumanPayerIdentityObserver(
          createFiveNorthPayerIdentityReader({
            network: input.network,
            scope,
            signal,
          }),
        ),
      },
      { signal },
    );
    if (preflight.outcome !== "compatible") {
      throw new Error(
        `signer wallet preflight is ${preflight.reason} for this purchase`,
      );
    }
    const claimPackageSelection = createFiveNorthHumanPackageSelectionClaimer(
      input.network,
      { signal },
    );
    const packageSelection = await claimPackageSelection({
      adminParty: scope.challenge.adminParty,
      challengeId: scope.challenge.challengeId,
      challengeObservedAt: scope.challenge.observedAt,
      executeBefore: scope.challenge.executeBefore,
      providerParty: scope.challenge.providerParty,
      signal,
      walletPreflight: preflight,
    });
    return Object.freeze({
      packageSelection,
      trustedConfiguration: scope.trustedConfiguration,
      walletPreflight: preflight,
    });
  };
}
