import {
  buildHumanPurchasePrepareRequest,
  createHumanPaymentObserver,
  createHumanPreparedPurchaseObserver,
  createHumanPurchaseCommitter,
  createHumanPurchaseHoldingObserver,
  createHumanTransferFactoryObserver,
  projectHumanPreparedPurchaseApproval,
  readHumanPurchaseLedgerIntent,
  verifyHumanPreparedPurchaseHash,
  type AuthenticatedHumanWalletConnectorPreflight,
  type HashVerifiedHumanPreparedPurchase,
  type HumanPreparedPurchaseApproval,
} from "@sotto/x402-canton";
import {
  createPrepareOnlyScope,
  type PrepareOnlyScope,
} from "./prepare-only-deadline.js";
import type { PrepareOnlyHumanPurchaseInput } from "./prepare-only-human-purchase-types.js";

const HUMAN_CHALLENGE_WINDOW_MS = 600_000;

export type PreparedHumanPurchaseAuthority = Readonly<{
  approval: HumanPreparedPurchaseApproval;
  preflight: AuthenticatedHumanWalletConnectorPreflight;
  verified: HashVerifiedHumanPreparedPurchase;
}>;

function requireActive(scope: PrepareOnlyScope): void {
  if (scope.callerSignal?.aborted === true) {
    throw new Error("prepare-only human purchase cancelled");
  }
  if (scope.outerDeadlineSignal.aborted) {
    throw new Error("prepare-only human purchase deadline exceeded");
  }
}

function callback<T>(
  scope: PrepareOnlyScope,
  label: string,
  call: () => Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      scope.signal.removeEventListener("abort", onAbort);
      complete();
    };
    const onAbort = () =>
      finish(() => {
        try {
          requireActive(scope);
          reject(new Error(`${label} interrupted`));
        } catch (error) {
          reject(error);
        }
      });
    scope.signal.addEventListener("abort", onAbort, { once: true });
    if (scope.signal.aborted) return onAbort();
    try {
      void call().then(
        (value) => finish(() => resolve(value)),
        (error: unknown) => finish(() => reject(error)),
      );
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

function executeBefore(observedAt: string): string {
  const milliseconds = Date.parse(observedAt) + HUMAN_CHALLENGE_WINDOW_MS;
  if (!Number.isSafeInteger(milliseconds)) {
    throw new Error("prepare-only human challenge deadline is invalid");
  }
  return new Date(milliseconds).toISOString();
}

function validateCallbacks(input: PrepareOnlyHumanPurchaseInput): void {
  for (const [label, value] of [
    ["package selection", input.claimPackageSelection],
    ["reader factory", input.createReaders],
    ["wallet preflight", input.createWalletPreflight],
    ["payment fetcher", input.fetchAuthorized],
    ["official hash", input.recomputeOfficialHash],
  ] as const) {
    if (typeof value !== "function") {
      throw new Error(`prepare-only human ${label} is required`);
    }
  }
  if (
    typeof input.expectedProviderParty !== "string" ||
    input.expectedProviderParty.trim() !== input.expectedProviderParty ||
    input.expectedProviderParty === ""
  ) {
    throw new Error("prepare-only human provider Party is invalid");
  }
}

export async function prepareHumanPurchaseAuthority(
  input: PrepareOnlyHumanPurchaseInput,
): Promise<PreparedHumanPurchaseAuthority> {
  const scope = createPrepareOnlyScope(input.signal, input.timeoutMilliseconds);
  validateCallbacks(input);
  const commitPurchase = createHumanPurchaseCommitter(
    input.trustedConfiguration,
  );
  try {
    requireActive(scope);
    const preflight = await callback(scope, "wallet preflight", () =>
      input.createWalletPreflight(scope.signal),
    );
    requireActive(scope);
    const payment = await createHumanPaymentObserver(input.fetchAuthorized)(
      input.request,
      { signal: scope.signal },
    );
    requireActive(scope);
    const packageSelection = await callback(scope, "package selection", () =>
      input.claimPackageSelection(
        Object.freeze({
          adminParty: input.trustedConfiguration.expectedAdmin,
          challengeId: payment.challengeId,
          challengeObservedAt: payment.observedAt,
          executeBefore: executeBefore(payment.observedAt),
          providerParty: input.expectedProviderParty,
          signal: scope.signal,
          walletPreflight: preflight,
        }),
      ),
    );
    const intent = readHumanPurchaseLedgerIntent(
      commitPurchase({
        maximumFeeAtomic: input.maximumFeeAtomic,
        packageSelection,
        paymentObservation: payment,
        walletPreflight: preflight,
      }),
    );
    const readers = input.createReaders(scope.signal, intent);
    const holdings = await createHumanPurchaseHoldingObserver(readers.holdings)(
      intent,
      { signal: scope.signal },
    );
    requireActive(scope);
    const registry = await createHumanTransferFactoryObserver(readers.registry)(
      intent,
      holdings,
      { signal: scope.signal },
    );
    requireActive(scope);
    const request = buildHumanPurchasePrepareRequest(
      intent,
      holdings,
      registry,
    );
    const prepared = await createHumanPreparedPurchaseObserver(
      readers.prepared,
    )(request, { signal: scope.signal });
    const verified = await verifyHumanPreparedPurchaseHash(
      prepared,
      { recomputeOfficialHash: input.recomputeOfficialHash },
      { signal: scope.signal },
    );
    requireActive(scope);
    return Object.freeze({
      approval: projectHumanPreparedPurchaseApproval(verified),
      preflight,
      verified,
    });
  } catch (error) {
    requireActive(scope);
    throw error;
  }
}
