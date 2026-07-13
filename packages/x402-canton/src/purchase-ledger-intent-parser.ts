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
}>;

function exactObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  const result = objectValue(value, label);
  exactKeys(result, keys, label);
  return result;
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
    ["interfaceId", "contractId", "implementationTemplateId", "expectedAdmin"],
    "purchase token factory",
  );
  return { root, request, challenge, instrument, capability, tokenFactory };
}
