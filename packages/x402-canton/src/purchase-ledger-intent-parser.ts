import {
  assertAuthenticBoundedPurchase,
  type BoundedPurchaseCommitment,
} from "./purchase-commitment.js";
import { exactKeys, objectValue } from "./purchase-commitment-primitives.js";
import { assertStrictJson } from "./strict-json.js";

export type ParsedPurchaseCanonical = Readonly<{
  root: Record<string, unknown>;
  request: Record<string, unknown>;
  challenge: Record<string, unknown>;
  instrument: Record<string, unknown>;
  capability: Record<string, unknown>;
  tokenFactory: Record<string, unknown>;
  packageSelection: Record<string, unknown>;
  packageRequirements: ReadonlyArray<Record<string, unknown>>;
  packageReferences: ReadonlyArray<Record<string, unknown>>;
}>;

function exactObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  const result = objectValue(value, label);
  exactKeys(result, keys, label);
  if (JSON.stringify(Object.keys(result)) !== JSON.stringify(keys)) {
    throw new Error(`${label} keys must use canonical order`);
  }
  return result;
}

function exactArray(value: unknown, label: string, maximum: number): unknown[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > maximum ||
    Object.keys(value).length !== value.length
  ) {
    throw new Error(`${label} must be a non-empty bounded array`);
  }
  return value;
}

function decodeCanonical(
  commitment: BoundedPurchaseCommitment,
): Record<string, unknown> {
  assertAuthenticBoundedPurchase(commitment);
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      commitment.canonicalBytes,
    );
  } catch {
    throw new Error("bounded purchase canonical bytes are invalid");
  }
  assertStrictJson(source, 8, 128);
  const root = exactObject(
    JSON.parse(source),
    [
      "version",
      "authorizationMode",
      "request",
      "challenge",
      "capability",
      "tokenFactory",
      "packageSelection",
      "authorizationInstanceId",
      "attemptId",
    ],
    "bounded purchase canonical value",
  );
  if (JSON.stringify(root) !== source) {
    throw new Error("bounded purchase canonical bytes are not canonical JSON");
  }
  return root;
}

export function parseBoundedPurchaseCanonical(
  commitment: BoundedPurchaseCommitment,
): ParsedPurchaseCanonical {
  const root = decodeCanonical(commitment);
  const request = exactObject(
    root.request,
    ["bindingVersion", "requestCommitment", "bodyHash"],
    "purchase request",
  );
  const challenge = exactObject(
    root.challenge,
    [
      "x402Version",
      "challengeId",
      "observedAt",
      "expiresAt",
      "network",
      "scheme",
      "transferMethod",
      "payer",
      "recipient",
      "amountAtomic",
      "asset",
      "feePayer",
      "instrument",
      "synchronizerId",
    ],
    "purchase challenge",
  );
  const instrument = exactObject(
    challenge.instrument,
    ["admin", "id"],
    "purchase instrument",
  );
  const capability = exactObject(
    root.capability,
    [
      "agentParty",
      "contractId",
      "templateId",
      "revision",
      "resourceBindingVersion",
      "resourceHash",
      "recipient",
      "perCallLimitAtomic",
      "remainingAllowanceAtomic",
      "maximumTotalDebitAtomic",
      "expiresAt",
    ],
    "purchase capability",
  );
  const tokenFactory = exactObject(
    root.tokenFactory,
    ["interfaceId", "contractId", "creationTemplateId", "expectedAdmin"],
    "purchase token factory",
  );
  const packageSelection = exactObject(
    root.packageSelection,
    [
      "version",
      "observationId",
      "closureHash",
      "requirements",
      "references",
      "packageIds",
      "parties",
      "synchronizerId",
      "vettingValidAt",
      "acquiredAt",
      "authenticatedSubject",
    ],
    "purchase package selection",
  );
  const packageRequirements = exactArray(
    packageSelection.requirements,
    "purchase package requirements",
    64,
  ).map((value) => {
    const requirement = exactObject(
      value,
      ["packageName", "parties"],
      "purchase package requirement",
    );
    exactArray(requirement.parties, "purchase requirement parties", 16);
    return requirement;
  });
  const packageReferences = exactArray(
    packageSelection.references,
    "purchase package references",
    64,
  ).map((value) => {
    const reference = exactObject(
      value,
      ["packageId", "packageName", "packageVersion", "artifactIds"],
      "purchase package reference",
    );
    exactArray(reference.artifactIds, "purchase package artifact IDs", 64);
    return reference;
  });
  exactArray(packageSelection.packageIds, "purchase package IDs", 64);
  exactArray(packageSelection.parties, "purchase package parties", 16);
  return {
    root,
    request,
    challenge,
    instrument,
    capability,
    tokenFactory,
    packageSelection,
    packageRequirements,
    packageReferences,
  };
}
