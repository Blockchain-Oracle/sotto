import { buildFiveNorthPreapprovalProposal } from "./five-north-preapproval-proposal.js";

const PARTY_PATTERN = /^[^\s:]+::1220[0-9a-f]{64}$/u;
const PACKAGE_PATTERN = /^[0-9a-f]{64}$/u;
export const APPROVED_FIVE_NORTH_SPLICE_WALLET_PACKAGE_ID =
  "f799a58fa53dfe48bae52bd5dbcc2b578a7d4dfee3ae3f4eb7635fe9a8cc67d3" as const;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  if (
    JSON.stringify(Object.keys(value).sort()) !==
    JSON.stringify([...keys].sort())
  ) {
    throw new Error(`${label} keys are invalid`);
  }
}

function identifier(value: unknown, label: string, maximum = 512): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.trim() !== value ||
    Buffer.byteLength(value, "utf8") > maximum
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function party(value: unknown, label: string, sottoOnly = false): string {
  const result = identifier(value, label);
  if (
    !PARTY_PATTERN.test(result) ||
    (sottoOnly && !result.startsWith("sotto-"))
  ) {
    throw new Error(`${label} is invalid`);
  }
  return result;
}

export function discoverFiveNorthPreapprovalProposal(
  input: Readonly<{
    amuletRules: unknown;
    authenticatedUserId: string;
    preferredWalletPackage: unknown;
    receiverParty: string;
    validatorUser: unknown;
  }>,
) {
  const validatorParty = readFiveNorthValidatorParty(input.validatorUser);

  const preferred = objectValue(
    input.preferredWalletPackage,
    "preferred wallet package",
  );
  exactKeys(
    preferred,
    ["packageReferences", "synchronizerId"],
    "preferred wallet package",
  );
  if (
    !Array.isArray(preferred.packageReferences) ||
    preferred.packageReferences.length !== 1
  ) {
    throw new Error("preferred wallet package must have one reference");
  }
  const reference = objectValue(
    preferred.packageReferences[0],
    "preferred wallet package reference",
  );
  exactKeys(
    reference,
    ["packageId", "packageName", "packageVersion"],
    "preferred wallet package reference",
  );
  const packageId = identifier(
    reference.packageId,
    "splice-wallet package ID",
    64,
  );
  if (
    !PACKAGE_PATTERN.test(packageId) ||
    packageId !== APPROVED_FIVE_NORTH_SPLICE_WALLET_PACKAGE_ID ||
    reference.packageName !== "splice-wallet" ||
    reference.packageVersion !== "0.1.21"
  ) {
    throw new Error("preferred splice-wallet package is unsupported");
  }

  const rulesRoot = objectValue(input.amuletRules, "AmuletRules response");
  const rules = objectValue(rulesRoot.amulet_rules, "AmuletRules contract");
  const contract = objectValue(rules.contract, "AmuletRules payload wrapper");
  const payload = objectValue(contract.payload, "AmuletRules payload");
  const expectedDso = party(payload.dso, "AmuletRules DSO Party");
  const synchronizerId = party(rules.domain_id, "AmuletRules synchronizer ID");
  if (preferred.synchronizerId !== synchronizerId) {
    throw new Error(
      "preferred package synchronizer does not match AmuletRules",
    );
  }

  return buildFiveNorthPreapprovalProposal({
    expectedDso,
    packageId,
    receiverParty: party(
      input.receiverParty,
      "preapproval receiver Party",
      true,
    ),
    synchronizerId,
    userId: identifier(input.authenticatedUserId, "authenticated user ID", 256),
    validatorParty,
  });
}

export function readFiveNorthValidatorParty(value: unknown): string {
  const validator = objectValue(value, "validator user");
  exactKeys(validator, ["featured", "party_id", "user_name"], "validator user");
  if (validator.featured !== true) {
    throw new Error("validator operator must be featured");
  }
  identifier(validator.user_name, "validator user name", 256);
  return party(validator.party_id, "validator operator Party");
}
