import type { PreparedCapabilityBootstrapApproval } from "@sotto/x402-canton";

const APPROVAL_FIELDS = [
  "action",
  "agentParty",
  "expiresAt",
  "instrument",
  "limits",
  "network",
  "packageId",
  "payerParty",
  "preparedTransactionHash",
  "recipientParty",
  "resourceHash",
  "revision",
  "synchronizerId",
  "templateId",
  "transferFactoryContractId",
  "version",
] as const;
const HASH = /^sha256:[0-9a-f]{64}$/u;
const PACKAGE_ID = /^[0-9a-f]{64}$/u;
const ATOMIC = /^(?:0|[1-9][0-9]{0,20})$/u;
const REVISION = /^(?:0|[1-9][0-9]{0,18})$/u;

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`reference wallet ${label} is invalid`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  if (
    JSON.stringify(Object.keys(value).sort()) !==
    JSON.stringify([...expected].sort())
  ) {
    throw new Error(`reference wallet ${label} keys are invalid`);
  }
}

function identifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    !value.isWellFormed() ||
    Buffer.byteLength(value, "utf8") > 512 ||
    [...value].some((character) => character.trim() === "")
  ) {
    throw new Error(`reference wallet ${label} is invalid`);
  }
  return value;
}

function timestamp(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(Date.parse(value)).toISOString() !== value
  ) {
    throw new Error(`reference wallet ${label} is invalid`);
  }
  return value;
}

export function parseReferenceWalletApproval(
  value: unknown,
  preparedTransactionHash: `sha256:${string}`,
): PreparedCapabilityBootstrapApproval {
  const approval = record(value, "approval");
  exactKeys(approval, APPROVAL_FIELDS, "approval");
  if (approval.action !== "create-purchase-capability") {
    throw new Error("reference wallet approval action is invalid");
  }
  if (approval.version !== "sotto-capability-approval-v1") {
    throw new Error("reference wallet approval version is invalid");
  }
  if (approval.preparedTransactionHash !== preparedTransactionHash) {
    throw new Error("reference wallet approval prepared hash does not match");
  }
  const instrument = record(approval.instrument, "approval instrument");
  exactKeys(instrument, ["admin", "id"], "approval instrument");
  const limits = record(approval.limits, "approval limits");
  exactKeys(
    limits,
    [
      "maximumTotalDebitAtomic",
      "perCallLimitAtomic",
      "remainingAllowanceAtomic",
    ],
    "approval limits",
  );
  const maximumTotalDebitAtomic = String(limits.maximumTotalDebitAtomic);
  const perCallLimitAtomic = String(limits.perCallLimitAtomic);
  const remainingAllowanceAtomic = String(limits.remainingAllowanceAtomic);
  if (
    !ATOMIC.test(maximumTotalDebitAtomic) ||
    !ATOMIC.test(perCallLimitAtomic) ||
    !ATOMIC.test(remainingAllowanceAtomic) ||
    BigInt(perCallLimitAtomic) <= 0n ||
    BigInt(maximumTotalDebitAtomic) < BigInt(perCallLimitAtomic) ||
    BigInt(remainingAllowanceAtomic) < BigInt(maximumTotalDebitAtomic)
  ) {
    throw new Error("reference wallet approval limits are invalid");
  }
  if (
    typeof approval.network !== "string" ||
    !approval.network.startsWith("canton:") ||
    !PACKAGE_ID.test(String(approval.packageId)) ||
    !HASH.test(String(approval.resourceHash)) ||
    !REVISION.test(String(approval.revision))
  ) {
    throw new Error("reference wallet approval identity is invalid");
  }
  return Object.freeze({
    action: "create-purchase-capability" as const,
    agentParty: identifier(approval.agentParty, "approval agent"),
    expiresAt: timestamp(approval.expiresAt, "approval expiry"),
    instrument: Object.freeze({
      admin: identifier(instrument.admin, "approval instrument admin"),
      id: identifier(instrument.id, "approval instrument ID"),
    }),
    limits: Object.freeze({
      maximumTotalDebitAtomic,
      perCallLimitAtomic,
      remainingAllowanceAtomic,
    }),
    network: approval.network as `canton:${string}`,
    packageId: approval.packageId as string,
    payerParty: identifier(approval.payerParty, "approval payer"),
    preparedTransactionHash,
    recipientParty: identifier(approval.recipientParty, "approval recipient"),
    resourceHash: approval.resourceHash as `sha256:${string}`,
    revision: approval.revision as string,
    synchronizerId: identifier(
      approval.synchronizerId,
      "approval synchronizer",
    ),
    templateId: identifier(approval.templateId, "approval template"),
    transferFactoryContractId: identifier(
      approval.transferFactoryContractId,
      "approval transfer factory",
    ),
    version: "sotto-capability-approval-v1" as const,
  });
}
