import {
  createHumanWalletSigningSession,
  type HumanPreparedPurchaseApproval,
  type HumanWalletSigningDependencies,
  type HumanWalletSigningResult,
  type HumanWalletSigningSessionOptions,
} from "@sotto/x402-canton";
import { prepareHumanPurchaseAuthority } from "./prepare-human-purchase-authority.js";
import type { PrepareOnlyHumanPurchaseInput } from "./prepare-only-human-purchase-types.js";

export type PrepareAndSignHumanPurchaseResult = Readonly<{
  approval: HumanPreparedPurchaseApproval;
  signingSession: HumanWalletSigningResult;
  status:
    "wallet-rejected" | "wallet-signature-verified" | "wallet-unsupported";
}>;

export async function prepareAndSignHumanPurchase(
  input: PrepareOnlyHumanPurchaseInput,
  dependencies: HumanWalletSigningDependencies,
  options: HumanWalletSigningSessionOptions = {},
): Promise<PrepareAndSignHumanPurchaseResult> {
  const prepared = await prepareHumanPurchaseAuthority(input);
  const signingSession = await createHumanWalletSigningSession(
    { preflight: prepared.preflight, prepared: prepared.verified },
    dependencies,
    {
      ...options,
      ...(options.signal === undefined && input.signal !== undefined
        ? { signal: input.signal }
        : {}),
    },
  );
  const status =
    signingSession.outcome === "verified"
      ? ("wallet-signature-verified" as const)
      : signingSession.outcome === "rejected"
        ? ("wallet-rejected" as const)
        : ("wallet-unsupported" as const);
  return Object.freeze({
    approval: prepared.approval,
    signingSession,
    status,
  });
}
