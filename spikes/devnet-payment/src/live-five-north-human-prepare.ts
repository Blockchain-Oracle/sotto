import { recomputeReferenceWalletPreparedHash } from "@sotto/capability-wallet";
import type { SpikeConfig } from "./config.js";
import { parseCapabilityAmuletRules } from "./five-north-capability-readiness-validation.js";
import { createFiveNorthHumanPackageSelectionClaimer } from "./five-north-human-package-preference.js";
import { startFiveNorthHumanProviderSession } from "./five-north-human-provider-session.js";
import { createFiveNorthHumanPurchaseReaders } from "./five-north-human-purchase-readers.js";
import { withFiveNorthHumanWalletDeadline } from "./five-north-human-wallet-deadline.js";
import { readFiveNorthHumanWalletProfile } from "./five-north-human-wallet-profile.js";
import { createFiveNorthReferenceHumanWalletPreflight } from "./five-north-reference-human-wallet.js";
import { createFiveNorthPrepareTransport } from "./five-north-prepare-transport.js";
import {
  prepareOnlyHumanPurchase,
  type PrepareOnlyHumanPurchaseResult,
} from "./prepare-only-human-purchase.js";

const FIVE_NORTH_TRANSFER_FACTORY_CONTRACT_ID =
  "009f00e5bf00640118d849080aaf22bc963a8458d322585cebf1119cb7bf37a955ca11122065b775fb8a4199904ed32fa9277fd9c0e82bb82319a7151249df124182072381";
const MAXIMUM_ALLOWED_FEE_ATOMIC = "1000000000";
const MAXIMUM_FEE_ATOMIC = "750000000";
const PREPARE_TIMEOUT_MS = 30_000;

type LiveInput = Readonly<{
  keyFile: string;
  network: SpikeConfig["network"];
  port: number;
  providerParty: string;
  signal: AbortSignal;
  workspaceRoot: string;
}>;

export type LiveFiveNorthHumanPrepareDependencies = Readonly<{
  createPackageSelectionClaimer: typeof createFiveNorthHumanPackageSelectionClaimer;
  createPrepareTransport: typeof createFiveNorthPrepareTransport;
  createPurchaseReaders: typeof createFiveNorthHumanPurchaseReaders;
  createWalletPreflight: typeof createFiveNorthReferenceHumanWalletPreflight;
  preparePurchase: typeof prepareOnlyHumanPurchase;
  readProfile: typeof readFiveNorthHumanWalletProfile;
  recomputeOfficialHash: typeof recomputeReferenceWalletPreparedHash;
  startProviderSession: typeof startFiveNorthHumanProviderSession;
}>;

const DEFAULT_DEPENDENCIES: LiveFiveNorthHumanPrepareDependencies = {
  createPackageSelectionClaimer: createFiveNorthHumanPackageSelectionClaimer,
  createPrepareTransport: createFiveNorthPrepareTransport,
  createPurchaseReaders: createFiveNorthHumanPurchaseReaders,
  createWalletPreflight: createFiveNorthReferenceHumanWalletPreflight,
  preparePurchase: prepareOnlyHumanPurchase,
  readProfile: readFiveNorthHumanWalletProfile,
  recomputeOfficialHash: recomputeReferenceWalletPreparedHash,
  startProviderSession: startFiveNorthHumanProviderSession,
};

function active(signal: unknown): asserts signal is AbortSignal {
  if (!(signal instanceof AbortSignal)) {
    throw new Error("live Five North human preparation signal is invalid");
  }
  if (signal.aborted) {
    throw new Error("live Five North human preparation cancelled");
  }
}

export async function runLiveFiveNorthHumanPrepare(
  input: LiveInput,
  dependencies: LiveFiveNorthHumanPrepareDependencies = DEFAULT_DEPENDENCIES,
): Promise<PrepareOnlyHumanPurchaseResult> {
  active(input.signal);
  if (
    !Number.isSafeInteger(input.port) ||
    input.port < 1_024 ||
    input.port > 65_535
  ) {
    throw new Error("live Five North human provider port is invalid");
  }
  const profile = await withFiveNorthHumanWalletDeadline(
    input.signal,
    (signal) =>
      dependencies.readProfile({
        keyFile: input.keyFile,
        signal,
        workspaceRoot: input.workspaceRoot,
      }),
  );
  active(input.signal);
  const transport = dependencies.createPrepareTransport(
    input.network,
    profile.party,
    { signal: input.signal },
  );
  const rules = parseCapabilityAmuletRules(
    await transport.readAmuletRules(input.signal),
  );
  active(input.signal);
  if (rules.synchronizerId !== profile.synchronizerId) {
    throw new Error("live Five North human wallet synchronizer does not match");
  }
  const provider = await dependencies.startProviderSession({
    dsoParty: rules.expectedAdmin,
    payerParty: profile.party,
    port: input.port,
    providerParty: input.providerParty,
    signal: input.signal,
    synchronizerId: profile.synchronizerId,
  });
  try {
    const claimPackageSelection = dependencies.createPackageSelectionClaimer(
      input.network,
      {
        signal: input.signal,
      },
    );
    return await dependencies.preparePurchase({
      claimPackageSelection,
      createReaders: () =>
        dependencies.createPurchaseReaders(transport, profile.party),
      createWalletPreflight: (signal) =>
        dependencies.createWalletPreflight({
          keyFile: input.keyFile,
          network: input.network,
          signal,
          workspaceRoot: input.workspaceRoot,
        }),
      expectedProviderParty: input.providerParty,
      fetchAuthorized: provider.fetchAuthorized,
      maximumFeeAtomic: MAXIMUM_FEE_ATOMIC,
      recomputeOfficialHash: async (transaction, { signal }) => {
        active(signal);
        const digest = await dependencies.recomputeOfficialHash(transaction);
        active(signal);
        return digest;
      },
      request: { method: "GET", url: provider.resourceUrl },
      signal: input.signal,
      timeoutMilliseconds: PREPARE_TIMEOUT_MS,
      trustedConfiguration: {
        contractId: FIVE_NORTH_TRANSFER_FACTORY_CONTRACT_ID,
        expectedAdmin: rules.expectedAdmin,
        expectedAsset: "CC",
        expectedInstrumentId: "Amulet",
        maximumAllowedFeeAtomic: MAXIMUM_ALLOWED_FEE_ATOMIC,
      },
    });
  } finally {
    await provider.close();
  }
}
