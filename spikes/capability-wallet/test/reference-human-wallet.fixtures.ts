import { createHash } from "node:crypto";
import { PreparedTransaction } from "@canton-network/core-ledger-proto";
import {
  HUMAN_WALLET_SIGNING_REQUEST_VERSION,
  projectHumanPreparedPurchaseApproval,
  verifyHumanPreparedPurchaseHash,
  type HumanPreparedPurchaseApproval,
  type HumanPurchaseLedgerIntent,
  type HumanPurchasePrepareRequest,
  type HumanWalletApprovalRequest,
} from "../../../packages/x402-canton/src/index.js";
import { digestHumanTransferContext } from "../../../packages/x402-canton/src/human-transfer-context-digest.js";
import { recomputeWalletPreparedHashPrecheck } from "../../../packages/x402-canton/src/prepared-purchase-wallet-precheck.js";
import { humanPreparedHashInputs } from "../../../packages/x402-canton/test/human-prepared-purchase-hash.fixtures.js";
import { HUMAN_PURCHASE_NOW } from "../../../packages/x402-canton/test/human-purchase-commitment.fixtures.js";

type ReferenceHumanWalletInputs = Readonly<{
  approval: HumanPreparedPurchaseApproval;
  intent: HumanPurchaseLedgerIntent;
  request: HumanPurchasePrepareRequest;
  transaction: Uint8Array;
}>;

export async function referenceHumanWalletInputs(): Promise<ReferenceHumanWalletInputs> {
  const input = await humanPreparedHashInputs();
  const verified = await verifyHumanPreparedPurchaseHash(input.observation, {
    recomputeOfficialHash: async () => input.digest,
  });
  return {
    approval: projectHumanPreparedPurchaseApproval(verified),
    intent: input.intent,
    request: input.request,
    transaction: input.transaction,
  };
}

export function referenceHumanWalletApprovalRequest(
  preparedTransaction: Uint8Array,
  approval: HumanPreparedPurchaseApproval,
): HumanWalletApprovalRequest {
  const digest = createHash("sha256").update(preparedTransaction).digest("hex");
  const preparedTransactionHash = `sha256:${digest}` as const;
  return Object.freeze({
    version: HUMAN_WALLET_SIGNING_REQUEST_VERSION,
    approval: Object.freeze({ ...approval, preparedTransactionHash }),
    connectorId: "wallet-sdk-reference",
    connectorKind: "wallet-sdk",
    connectorOrigin: "wallet://sotto-reference",
    createdAt: HUMAN_PURCHASE_NOW,
    expiresAt: "2026-07-16T15:10:00.000Z",
    hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
    preparedTransaction: new Uint8Array(preparedTransaction),
    preparedTransactionHash,
    sessionId: `sha256:${"a".repeat(64)}`,
  });
}

export async function validReferenceHumanWalletRequest(): Promise<HumanWalletApprovalRequest> {
  const input = await referenceHumanWalletInputs();
  return referenceHumanWalletApprovalRequest(input.transaction, input.approval);
}

function sdkFixtureContractId(value: string): string {
  return `00${createHash("sha256").update(`human-wallet:${value}`).digest("hex")}`;
}

function rewriteSdkFixtureContractIds(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  if (Array.isArray(value)) {
    value.forEach(rewriteSdkFixtureContractIds);
    return;
  }
  const record = value as Record<string, unknown>;
  for (const [key, entry] of Object.entries(record)) {
    if (key === "contractId" && typeof entry === "string") {
      record[key] = sdkFixtureContractId(entry);
    } else if (
      key === "value" &&
      record.tag === "AV_ContractId" &&
      typeof entry === "string"
    ) {
      record[key] = sdkFixtureContractId(entry);
    } else {
      rewriteSdkFixtureContractIds(entry);
    }
  }
}

export async function sdkCompatibleReferenceHumanWalletRequest(): Promise<HumanWalletApprovalRequest> {
  const input = await referenceHumanWalletInputs();
  const prepared = PreparedTransaction.fromBinary(input.transaction, {
    readUnknownField: "throw",
  });
  rewriteSdkFixtureContractIds(prepared);
  const transaction = PreparedTransaction.toBinary(prepared, {
    writeUnknownFields: false,
  });
  const context = structuredClone(
    input.request.commands[0].ExerciseCommand.choiceArgument.extraArgs.context,
  );
  rewriteSdkFixtureContractIds(context);
  const digest = await recomputeWalletPreparedHashPrecheck(transaction);
  const preparedTransactionHash =
    `sha256:${Buffer.from(digest).toString("hex")}` as const;
  const approval = {
    ...input.approval,
    preparedTransactionHash,
    tokenFactory: {
      ...input.approval.tokenFactory,
      contractId: sdkFixtureContractId(input.approval.tokenFactory.contractId),
    },
    transferContextHash: digestHumanTransferContext(context),
  };
  return Object.freeze({
    ...referenceHumanWalletApprovalRequest(transaction, approval),
    approval: Object.freeze(approval),
    preparedTransactionHash,
  });
}
