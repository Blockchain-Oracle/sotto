import { readAuthenticatedHumanSettlementExpectation } from "@sotto/x402-canton";
import type { HumanReconciliationClaimResult } from "@sotto/database";
import {
  reconciliationExactKeys,
  reconciliationInteger,
  reconciliationObject,
  reconciliationSha256,
  reconciliationText,
} from "./human-reconciliation-worker-primitives.js";
import type { HumanReconciliationProbeRequest } from "./human-reconciliation-worker-types.js";

export function reconciliationClaim(
  candidate: HumanReconciliationClaimResult,
  leaseOwner: string,
): HumanReconciliationClaimResult {
  const value = reconciliationObject(candidate, "human reconciliation claim");
  reconciliationExactKeys(
    value,
    ["lease", "scope"],
    "human reconciliation claim",
  );
  const lease = reconciliationObject(value.lease, "human reconciliation lease");
  reconciliationExactKeys(
    lease,
    [
      "jobId",
      "attemptId",
      "leaseGeneration",
      "leaseOwner",
      "claimedAt",
      "leaseExpiresAt",
    ],
    "human reconciliation lease",
  );
  const scope = reconciliationObject(value.scope, "human reconciliation scope");
  reconciliationExactKeys(
    scope,
    [
      "attemptId",
      "beginExclusive",
      "commandId",
      "executionUserId",
      "reconciliationOffset",
      "submissionId",
      "expectation",
    ],
    "human reconciliation scope",
  );
  const expectation = readAuthenticatedHumanSettlementExpectation(
    scope.expectation,
  );
  const attemptId = reconciliationSha256(
    scope.attemptId,
    "reconciliation attempt ID",
  );
  const beginExclusive = reconciliationInteger(
    scope.beginExclusive,
    0,
    "completion begin",
  );
  const reconciliationOffset = reconciliationInteger(
    scope.reconciliationOffset,
    beginExclusive,
    "reconciliation offset",
  );
  const commandId = reconciliationText(
    scope.commandId,
    "reconciliation command ID",
  );
  if (
    lease.attemptId !== attemptId ||
    lease.leaseOwner !== leaseOwner ||
    expectation.attemptId !== attemptId ||
    expectation.commandId !== commandId
  ) {
    throw new Error("human reconciliation claim authority does not match");
  }
  return Object.freeze({
    lease: Object.freeze({
      jobId: reconciliationText(lease.jobId, "reconciliation job ID"),
      attemptId,
      leaseGeneration: reconciliationInteger(
        lease.leaseGeneration,
        1,
        "lease generation",
      ),
      leaseOwner,
      claimedAt: reconciliationText(lease.claimedAt, "lease claimed time"),
      leaseExpiresAt: reconciliationText(
        lease.leaseExpiresAt,
        "lease expiry time",
      ),
    }),
    scope: Object.freeze({
      attemptId,
      beginExclusive,
      commandId,
      executionUserId: reconciliationText(
        scope.executionUserId,
        "execution user ID",
      ),
      reconciliationOffset,
      submissionId: reconciliationText(scope.submissionId, "submission ID"),
      expectation,
    }),
  });
}

export function reconciliationProbeRequest(
  claim: HumanReconciliationClaimResult,
): HumanReconciliationProbeRequest {
  return Object.freeze({
    beginExclusive: claim.scope.reconciliationOffset,
    commandId: claim.scope.commandId,
    payerParty: claim.scope.expectation.payerParty,
    providerParty: claim.scope.expectation.providerParty,
    submissionId: claim.scope.submissionId,
    synchronizerId: claim.scope.expectation.synchronizerId,
    userId: claim.scope.executionUserId,
  });
}
