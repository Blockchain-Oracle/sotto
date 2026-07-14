import type { AuthenticatedPackagePreferenceProjection } from "@sotto/x402-canton";

export type PrepareOnlyPackageSelectionScope = Readonly<{
  adminParty: string;
  agentParty: string;
  challengeObservedAt: string;
  executeBefore: string;
  payerParty: string;
  providerParty: string;
  signal: AbortSignal;
  synchronizerId: string;
}>;

export type PrepareOnlyPackageSelectionClaimer = (
  scope: PrepareOnlyPackageSelectionScope,
) => Promise<AuthenticatedPackagePreferenceProjection>;

export function acquirePrepareOnlyPackageSelection(
  claim: PrepareOnlyPackageSelectionClaimer,
  candidateScope: PrepareOnlyPackageSelectionScope,
): Promise<AuthenticatedPackagePreferenceProjection> {
  if (typeof claim !== "function") {
    throw new Error("prepare-only package selection claimer is required");
  }
  const scope = Object.freeze({ ...candidateScope });
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => scope.signal.removeEventListener("abort", onAbort);
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      complete();
    };
    const onAbort = () =>
      finish(() =>
        reject(new Error("prepare-only package selection interrupted")),
      );
    scope.signal.addEventListener("abort", onAbort, { once: true });
    if (scope.signal.aborted) {
      onAbort();
      return;
    }
    try {
      void claim(scope).then(
        (selection) => finish(() => resolve(selection)),
        (error: unknown) => finish(() => reject(error)),
      );
    } catch (error) {
      finish(() => reject(error));
    }
  });
}
