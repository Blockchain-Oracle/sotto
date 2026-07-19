import { prepareHumanPurchaseAuthority } from "./prepare-human-purchase-authority.js";
import type {
  PrepareOnlyHumanPurchaseInput,
  PrepareOnlyHumanPurchaseResult,
} from "./prepare-only-human-purchase-types.js";

export type {
  PrepareOnlyHumanPackageSelectionScope,
  PrepareOnlyHumanPurchaseInput,
  PrepareOnlyHumanPurchaseResult,
} from "./prepare-only-human-purchase-types.js";

export async function prepareOnlyHumanPurchase(
  input: PrepareOnlyHumanPurchaseInput,
): Promise<PrepareOnlyHumanPurchaseResult> {
  const prepared = await prepareHumanPurchaseAuthority(input);
  return Object.freeze({
    approval: prepared.approval,
    status: "prepared-hash-verified-not-signed" as const,
    verified: prepared.verified,
  });
}
