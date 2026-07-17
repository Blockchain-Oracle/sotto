import type { FiveNorthHumanProviderSession } from "./five-north-human-provider-session.js";
import type { FiveNorthHumanWalletProfile } from "./five-north-human-wallet-profile.js";
import type { FiveNorthInteractiveHumanWallet } from "./five-north-interactive-human-wallet.js";
import type { FiveNorthPrepareTransport } from "./five-north-prepare-transport.js";
import type { LiveFiveNorthHumanPurchaseDependencies } from "./live-five-north-human-purchase-dependencies.js";
import { requireLiveHumanPurchaseActive } from "./live-five-north-human-purchase-scope.js";
import type { LiveFiveNorthHumanPurchaseInput } from "./live-five-north-human-purchase.js";

const FIVE_NORTH_TRANSFER_FACTORY_CONTRACT_ID =
  "009f00e5bf00640118d849080aaf22bc963a8458d322585cebf1119cb7bf37a955ca11122065b775fb8a4199904ed32fa9277fd9c0e82bb82319a7151249df124182072381";
const MAXIMUM_ALLOWED_FEE_ATOMIC = "1000000000";
const MAXIMUM_FEE_ATOMIC = "750000000";
const PREPARE_TIMEOUT_MS = 30_000;

export function prepareLiveFiveNorthHumanAuthority(input: {
  dependencies: LiveFiveNorthHumanPurchaseDependencies;
  liveInput: LiveFiveNorthHumanPurchaseInput;
  profile: FiveNorthHumanWalletProfile;
  provider: FiveNorthHumanProviderSession;
  rules: Readonly<{ expectedAdmin: string; synchronizerId: string }>;
  signal: AbortSignal;
  transport: FiveNorthPrepareTransport;
  wallet: FiveNorthInteractiveHumanWallet;
}) {
  const dependencies = input.dependencies;
  const claimPackageSelection = dependencies.createPackageSelectionClaimer(
    input.liveInput.network,
    { signal: input.signal },
  );
  return dependencies.prepareAuthority({
    claimPackageSelection,
    createReaders: () =>
      dependencies.createPurchaseReaders(input.transport, input.profile.party),
    createWalletPreflight: (signal) =>
      dependencies.createWalletPreflight({
        connector: input.wallet.connector,
        keyFile: input.liveInput.keyFile,
        network: input.liveInput.network,
        signal,
        workspaceRoot: input.liveInput.workspaceRoot,
      }),
    expectedProviderParty: input.liveInput.providerParty,
    fetchAuthorized: input.provider.fetchAuthorized,
    maximumFeeAtomic: MAXIMUM_FEE_ATOMIC,
    recomputeOfficialHash: async (transaction, { signal }) => {
      requireLiveHumanPurchaseActive(signal);
      const digest = await dependencies.recomputeOfficialHash(transaction);
      requireLiveHumanPurchaseActive(signal);
      return digest;
    },
    request: { method: "GET", url: input.provider.resourceUrl },
    signal: input.signal,
    timeoutMilliseconds: PREPARE_TIMEOUT_MS,
    trustedConfiguration: {
      contractId: FIVE_NORTH_TRANSFER_FACTORY_CONTRACT_ID,
      expectedAdmin: input.rules.expectedAdmin,
      expectedAsset: "CC",
      expectedInstrumentId: "Amulet",
      maximumAllowedFeeAtomic: MAXIMUM_ALLOWED_FEE_ATOMIC,
    },
  });
}
