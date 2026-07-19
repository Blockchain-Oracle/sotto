import type { SpikeConfig } from "./config.js";
import type { FiveNorthHumanProviderSession } from "./five-north-human-provider-session.js";
import {
  LIVE_FIVE_NORTH_HUMAN_PURCHASE_DEPENDENCIES,
  type LiveFiveNorthHumanPurchaseDependencies,
} from "./live-five-north-human-purchase-dependencies.js";
import { executeLiveFiveNorthHumanPurchase } from "./live-five-north-human-purchase-execution.js";
import { prepareLiveFiveNorthHumanAuthority } from "./live-five-north-human-purchase-prepare.js";
import { createDeferredHumanSettlementVerifier } from "./live-five-north-human-purchase-settlement.js";
import {
  requireLiveHumanPurchaseActive,
  withLiveHumanPurchaseDeadline,
} from "./live-five-north-human-purchase-scope.js";

export type LiveFiveNorthHumanPurchaseInput = Readonly<{
  keyFile: string;
  network: SpikeConfig["network"];
  onJournalInitialized: (
    journal: Readonly<{ operationId: string }>,
  ) => void | Promise<void>;
  port: number;
  providerParty: string;
  signal: AbortSignal;
  sourceCommit: string;
  workspaceRoot: string;
}>;

function validate(input: LiveFiveNorthHumanPurchaseInput): void {
  requireLiveHumanPurchaseActive(input.signal);
  if (
    !Number.isSafeInteger(input.port) ||
    input.port < 1_024 ||
    input.port > 65_535
  ) {
    throw new Error("live Five North human provider port is invalid");
  }
  if (!/^[0-9a-f]{40}$/u.test(input.sourceCommit)) {
    throw new Error("live Five North human source commit is invalid");
  }
  if (typeof input.onJournalInitialized !== "function") {
    throw new Error("live Five North human journal callback is invalid");
  }
}

function exactExpectation(
  expectation: ReturnType<
    LiveFiveNorthHumanPurchaseDependencies["projectSettlementExpectation"]
  >,
  expected: {
    admin: string;
    payer: string;
    provider: string;
    synchronizer: string;
  },
): void {
  if (
    expectation.dsoParty !== expected.admin ||
    expectation.payerParty !== expected.payer ||
    expectation.providerParty !== expected.provider ||
    expectation.synchronizerId !== expected.synchronizer
  ) {
    throw new Error("live human settlement authority does not match");
  }
}

async function runWithinDeadline(
  input: LiveFiveNorthHumanPurchaseInput,
  signal: AbortSignal,
  dependencies: LiveFiveNorthHumanPurchaseDependencies,
) {
  const profile = await dependencies.readProfile({
    keyFile: input.keyFile,
    signal,
    workspaceRoot: input.workspaceRoot,
  });
  requireLiveHumanPurchaseActive(signal);
  await dependencies.requirePayerRightsAbsent({
    network: input.network,
    profile,
    signal,
  });
  const wallet = await dependencies.createInteractiveWallet({
    keyFile: input.keyFile,
    profile,
    signal,
    workspaceRoot: input.workspaceRoot,
  });
  const transport = dependencies.createPrepareTransport(
    input.network,
    profile.party,
    { signal },
  );
  const rules = dependencies.parseRules(
    await transport.readAmuletRules(signal),
  );
  if (rules.synchronizerId !== profile.synchronizerId) {
    throw new Error("live Five North human wallet synchronizer does not match");
  }
  const readTransaction = dependencies.createProviderTransactionReader(
    input.network,
    input.providerParty,
    { signal },
  );
  const deferred = createDeferredHumanSettlementVerifier({
    readTransaction,
    reconcile: dependencies.reconcileProviderTransaction,
  });
  let provider: FiveNorthHumanProviderSession | undefined;
  try {
    provider = await dependencies.startProviderSession({
      dsoParty: rules.expectedAdmin,
      payerParty: profile.party,
      port: input.port,
      providerParty: input.providerParty,
      signal,
      synchronizerId: profile.synchronizerId,
      verifySettlement: deferred.verify,
    });
    const prepared = await prepareLiveFiveNorthHumanAuthority({
      dependencies,
      liveInput: input,
      profile,
      provider,
      rules,
      signal,
      transport,
      wallet,
    });
    const expectation = dependencies.projectSettlementExpectation(
      prepared.verified,
    );
    exactExpectation(expectation, {
      admin: rules.expectedAdmin,
      payer: profile.party,
      provider: input.providerParty,
      synchronizer: profile.synchronizerId,
    });
    const completion = dependencies.createCompletionTransport(
      input.network,
      profile.party,
      { signal },
    );
    const beginExclusive = await completion.readLedgerEnd();
    const journal = await dependencies.initializeJournal({
      beginExclusive,
      expectation: dependencies.exportSettlementExpectation(expectation),
      sourceCommit: input.sourceCommit,
      workspaceRoot: input.workspaceRoot,
    });
    await input.onJournalInitialized({ operationId: journal.operationId });
    requireLiveHumanPurchaseActive(signal);
    return await executeLiveFiveNorthHumanPurchase({
      beginExclusive,
      completion,
      deferred,
      dependencies,
      expectation,
      journal,
      liveInput: input,
      prepared,
      provider,
      readTransaction,
      signal,
      wallet,
    });
  } finally {
    await provider?.close();
  }
}

export async function runLiveFiveNorthHumanPurchase(
  input: LiveFiveNorthHumanPurchaseInput,
  dependencies: LiveFiveNorthHumanPurchaseDependencies = LIVE_FIVE_NORTH_HUMAN_PURCHASE_DEPENDENCIES,
) {
  validate(input);
  return await withLiveHumanPurchaseDeadline(input.signal, (signal) =>
    runWithinDeadline(input, signal, dependencies),
  );
}
