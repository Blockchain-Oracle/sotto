import { PURCHASE_ATTEMPT_VERSION } from "./purchase-commitment.js";
import type { ParsedPurchaseCanonical } from "./purchase-ledger-intent-parser.js";
import { SHA256_PATTERN, sha256Hex } from "./purchase-commitment-primitives.js";

export function purchaseSha256(
  value: unknown,
  label: string,
): `sha256:${string}` {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be a SHA-256 identifier`);
  }
  return value as `sha256:${string}`;
}

export function derivePurchaseAttemptId({
  root,
  request,
  challenge,
  capability,
  tokenFactory,
  packageSelection,
}: ParsedPurchaseCanonical): `sha256:${string}` {
  const purchase = {
    version: root.version,
    authorizationMode: root.authorizationMode,
    request,
    challenge,
    capability,
    tokenFactory,
    packageSelection,
    authorizationInstanceId: root.authorizationInstanceId,
  };
  return `sha256:${sha256Hex(
    JSON.stringify({ version: PURCHASE_ATTEMPT_VERSION, purchase }),
  )}`;
}
