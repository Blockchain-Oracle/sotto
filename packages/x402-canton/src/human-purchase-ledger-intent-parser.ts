import {
  assertAuthenticHumanPurchase,
  type HumanPurchaseCommitment,
} from "./human-purchase-commitment.js";
import { exactKeys, objectValue } from "./purchase-commitment-primitives.js";
import { assertStrictJson } from "./strict-json.js";

export type ParsedHumanPurchaseCanonical = Readonly<{
  root: Record<string, unknown>;
  request: Record<string, unknown>;
  challenge: Record<string, unknown>;
  instrument: Record<string, unknown>;
  payerIdentity: Record<string, unknown>;
  limits: Record<string, unknown>;
  tokenFactory: Record<string, unknown>;
  packageSelection: Record<string, unknown>;
  packageReference: Record<string, unknown>;
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

export function exactHumanArray(
  value: unknown,
  length: number,
  label: string,
): unknown[] {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    Object.keys(value).length !== length
  ) {
    throw new Error(`${label} must contain exactly ${length} values`);
  }
  return value;
}

function decodeCanonical(
  commitment: HumanPurchaseCommitment,
): Record<string, unknown> {
  assertAuthenticHumanPurchase(commitment);
  if (
    commitment.canonicalBytes[0] === 0xef &&
    commitment.canonicalBytes[1] === 0xbb &&
    commitment.canonicalBytes[2] === 0xbf
  ) {
    throw new Error("human purchase canonical bytes must not contain a BOM");
  }
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      commitment.canonicalBytes,
    );
  } catch {
    throw new Error("human purchase canonical bytes are invalid");
  }
  assertStrictJson(source, 8, 128);
  const root = exactObject(
    JSON.parse(source),
    [
      "version",
      "authorizationMode",
      "request",
      "challenge",
      "payerIdentity",
      "limits",
      "tokenFactory",
      "packageSelection",
      "authorizationInstanceId",
      "attemptId",
    ],
    "human purchase canonical value",
  );
  if (JSON.stringify(root) !== source) {
    throw new Error("human purchase canonical bytes are not canonical JSON");
  }
  return root;
}

export function parseHumanPurchaseCanonical(
  commitment: HumanPurchaseCommitment,
): ParsedHumanPurchaseCanonical {
  const root = decodeCanonical(commitment);
  const request = exactObject(
    root.request,
    ["bindingVersion", "requestCommitment", "bodyHash"],
    "human purchase request",
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
    "human purchase challenge",
  );
  const instrument = exactObject(
    challenge.instrument,
    ["admin", "id"],
    "human purchase instrument",
  );
  const payerIdentity = exactObject(
    root.payerIdentity,
    [
      "version",
      "party",
      "network",
      "synchronizerId",
      "publicKeyFingerprint",
      "signingAlgorithm",
      "signatureFormat",
      "publicKeyFormat",
      "keyPurpose",
      "topologyHash",
      "acquiredAt",
      "subjectHash",
    ],
    "human payer identity",
  );
  const limits = exactObject(
    root.limits,
    ["maximumFeeAtomic", "maximumTotalDebitAtomic"],
    "human purchase limits",
  );
  const tokenFactory = exactObject(
    root.tokenFactory,
    ["interfaceId", "contractId", "creationTemplateId", "expectedAdmin"],
    "human token factory",
  );
  const packageSelection = exactObject(
    root.packageSelection,
    [
      "version",
      "closureHash",
      "references",
      "packageIds",
      "parties",
      "synchronizerId",
      "vettingValidAt",
      "acquiredAt",
      "subjectHash",
    ],
    "human package selection",
  );
  const packageReference = exactObject(
    exactHumanArray(
      packageSelection.references,
      1,
      "human package references",
    )[0],
    ["packageId", "packageName", "packageVersion", "artifactIds"],
    "human package reference",
  );
  exactHumanArray(packageReference.artifactIds, 1, "human package artifacts");
  exactHumanArray(packageSelection.packageIds, 1, "human package IDs");
  exactHumanArray(packageSelection.parties, 3, "human package parties");
  return {
    root,
    request,
    challenge,
    instrument,
    payerIdentity,
    limits,
    tokenFactory,
    packageSelection,
    packageReference,
  };
}
