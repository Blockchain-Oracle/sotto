import { dirname, join, resolve } from "node:path";
import { encodeCanonicalWalletHandoffJson } from "./wallet-handoff-json.js";
import { publishWalletHandoffBytes } from "./wallet-handoff-files.js";
import { requireWalletHandoffRoot } from "./wallet-handoff-path.js";
import {
  readReferenceWalletPolicy,
  requireReferenceWalletPolicy,
} from "./reference-wallet-policy.js";
import { isPolicyAuthorizedReferenceWallet } from "./reference-wallet-policy-validation.js";
import type {
  ReferenceWalletPolicy,
  SerializedReferenceWalletRequest,
} from "./reference-wallet-types.js";

export async function claimReferenceWalletPolicyAuthorization(
  policyFile: string,
  request: SerializedReferenceWalletRequest,
): Promise<ReferenceWalletPolicy> {
  const path = resolve(policyFile);
  const root = dirname(path);
  await requireWalletHandoffRoot(root);
  const policy = requireReferenceWalletPolicy(
    request,
    await readReferenceWalletPolicy(path),
  );
  if (!isPolicyAuthorizedReferenceWallet(policy)) {
    throw new Error("reference wallet policy authorization is required");
  }
  const authorizationId = policy.authorizationId.slice(7);
  const bytes = encodeCanonicalWalletHandoffJson({
    authorizationId: policy.authorizationId,
    capabilityIntentHash: request.capabilityIntentHash,
    claimedAt: new Date().toISOString(),
    preparedTransactionHash: request.preparedTransactionHash,
    sessionId: request.sessionId,
    version: "sotto-reference-wallet-policy-claim-v1",
  });
  try {
    await publishWalletHandoffBytes(
      root,
      join(root, `.used-reference-wallet-policy-${authorizationId}.json`),
      bytes,
    );
  } catch (error) {
    throw new Error("reference wallet policy authorization is already used", {
      cause: error,
    });
  }
  return policy;
}
