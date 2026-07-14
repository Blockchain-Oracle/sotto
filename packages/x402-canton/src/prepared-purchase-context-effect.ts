import type { Create } from "@canton-network/core-ledger-proto";
import type { BoundedPurchasePrepareRequest } from "./bounded-purchase-command-types.js";
import {
  preparedRecord,
  preparedScalar,
} from "./prepared-purchase-effect-values.js";
import type { PreparedPurchaseResult } from "./prepared-purchase-sotto-result.js";
import { validatePreparedSottoCreateIdentity } from "./prepared-purchase-sotto-identity.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";

const CONTEXT_FIELDS = [
  "payer",
  "agent",
  "provider",
  "attemptId",
  "purchaseCommitment",
  "requestCommitment",
  "challengeId",
  "resourceHash",
  "capabilityRevision",
  "amount",
  "totalDebit",
] as const;

export function validatePreparedPurchaseContext(
  create: Create,
  intent: BoundedPurchaseLedgerIntent,
  request: BoundedPurchasePrepareRequest,
  result: PreparedPurchaseResult,
): void {
  const packageId = intent.capability.templateId.split(":")[0]!;
  const templateId = `${packageId}:Sotto.Control.PurchaseCapability:PurchaseContext`;
  validatePreparedSottoCreateIdentity(
    create,
    templateId,
    intent.challenge.payerParty,
    [
      intent.challenge.payerParty,
      intent.capability.agentParty,
      intent.challenge.recipientParty,
    ],
    "PurchaseContext create",
  );
  const argument = preparedRecord(
    create.argument,
    CONTEXT_FIELDS,
    "PurchaseContext argument",
    templateId,
  );
  const choice = request.commands[0]!.ExerciseCommand.choiceArgument;
  const scalars = [
    ["payer", "party", intent.challenge.payerParty],
    ["agent", "party", intent.capability.agentParty],
    ["provider", "party", intent.challenge.recipientParty],
    ["attemptId", "text", intent.attemptId],
    ["purchaseCommitment", "text", intent.purchaseCommitment],
    ["requestCommitment", "text", intent.request.requestCommitment],
    ["challengeId", "text", intent.challenge.challengeId],
    ["resourceHash", "text", intent.capability.resourceHash],
    ["capabilityRevision", "int64", intent.capability.expectedRevision],
    ["amount", "numeric", choice.amount],
    ["totalDebit", "numeric", result.totalDebitDecimal],
  ] as const;
  for (const [field, kind, expected] of scalars) {
    preparedScalar(
      argument.get(field),
      kind,
      expected,
      `PurchaseContext ${field}`,
    );
  }
}
