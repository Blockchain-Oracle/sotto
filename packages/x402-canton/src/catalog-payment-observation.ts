import {
  capturePaymentRequiredResponse,
  readPaymentRequiredObservation,
} from "./payment-observation.js";
import { parsePaymentChallenge } from "./payment-requirement.js";
import {
  atomic,
  exactKeys,
  identifier,
  objectValue,
} from "./purchase-commitment-primitives.js";
import { assertStrictJson } from "./strict-json.js";

export type CatalogPaymentRequiredInspection = Readonly<{
  amountAtomic: string;
  asset: string;
  challengeHash: `sha256:${string}`;
  network: `canton:${string}`;
  observedAt: string;
  recipient: string;
  resourceUrl: string;
  scheme: "exact";
  transferMethod: "transfer-factory";
  x402Version: 2;
}>;

export type CatalogPaymentRequiredExpectation = Readonly<{
  expectedNetwork: `canton:${string}`;
  expectedResourceUrl: string;
}>;

function canonicalUrl(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > 8_192) {
    throw new Error(`${label} is invalid`);
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.toString() !== value) {
      throw new Error("noncanonical");
    }
    return parsed.toString();
  } catch {
    throw new Error(`${label} is invalid`);
  }
}

function persistedIdentifier(
  value: unknown,
  label: string,
  maximumBytes: number,
): string {
  const candidate = identifier(value, label, maximumBytes);
  if (/\s|\p{Cf}/u.test(candidate)) {
    throw new Error(`${label} is not safe persisted text`);
  }
  return candidate;
}

function decodeChallenge(bytes: Uint8Array): Record<string, unknown> {
  let source: string;
  try {
    source = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes);
  } catch {
    throw new Error("PAYMENT-REQUIRED must contain strict UTF-8 JSON");
  }
  assertStrictJson(source);
  return objectValue(
    JSON.parse(source) as unknown,
    "Payment required challenge",
  );
}

function validateExpectation(
  value: CatalogPaymentRequiredExpectation,
): Readonly<{
  expectedNetwork: `canton:${string}`;
  expectedResourceUrl: string;
}> {
  const input = objectValue(value, "catalog payment expectation");
  exactKeys(
    input,
    ["expectedNetwork", "expectedResourceUrl"],
    "catalog payment expectation",
  );
  const network = persistedIdentifier(
    input.expectedNetwork,
    "expected network",
    255,
  );
  if (!network.startsWith("canton:") || network.length === 7) {
    throw new Error("expected network must be Canton");
  }
  return Object.freeze({
    expectedNetwork: network as `canton:${string}`,
    expectedResourceUrl: canonicalUrl(
      input.expectedResourceUrl,
      "expected resource URL",
    ),
  });
}

export function inspectCatalogPaymentRequiredResponse(
  response: Pick<Response, "headers" | "status">,
  expectation: CatalogPaymentRequiredExpectation,
): CatalogPaymentRequiredInspection {
  const expected = validateExpectation(expectation);
  const observation = capturePaymentRequiredResponse(response);
  const state = readPaymentRequiredObservation(observation);
  const challenge = decodeChallenge(state.challengeBytes);
  if (challenge.x402Version !== 2 || !Array.isArray(challenge.accepts)) {
    throw new Error("Payment required challenge must use x402Version 2");
  }
  if (challenge.accepts.length < 1 || challenge.accepts.length > 32) {
    throw new Error("Payment required challenge accepts are invalid");
  }
  const resource = objectValue(challenge.resource, "Payment required resource");
  const resourceUrl = canonicalUrl(
    resource.url,
    "Payment required resource URL",
  );
  if (resourceUrl !== expected.expectedResourceUrl) {
    throw new Error("Payment required resource URL does not match the request");
  }
  const matches = challenge.accepts.filter((candidate) => {
    const requirement = objectValue(candidate, "Payment requirement");
    return (
      requirement.scheme === "exact" &&
      requirement.network === expected.expectedNetwork
    );
  });
  if (matches.length !== 1) {
    throw new Error("Expected exactly one matching Canton requirement");
  }
  const selected = objectValue(matches[0], "Payment requirement");
  exactKeys(
    selected,
    [
      "amount",
      "asset",
      "extra",
      "maxTimeoutSeconds",
      "network",
      "payTo",
      "scheme",
    ],
    "Payment requirement",
  );
  const extra = objectValue(selected.extra, "Payment requirement extra");
  exactKeys(
    extra,
    [
      "assetTransferMethod",
      "executeBeforeSeconds",
      "feePayer",
      "instrumentId",
      ...(Object.hasOwn(extra, "memo") ? ["memo"] : []),
      "synchronizerId",
    ],
    "Payment requirement extra",
  );
  exactKeys(
    objectValue(extra.instrumentId, "instrumentId"),
    ["admin", "id"],
    "instrumentId",
  );
  const requirement = parsePaymentChallenge(selected);
  const amount = atomic(requirement.amount, "catalog payment amount");
  if (
    amount === 0n ||
    requirement.extra.assetTransferMethod !== "transfer-factory"
  ) {
    throw new Error("Catalog payment requirement is unsupported");
  }
  return Object.freeze({
    amountAtomic: amount.toString(),
    asset: persistedIdentifier(requirement.asset, "catalog payment asset", 64),
    challengeHash: observation.challengeId,
    network: requirement.network,
    observedAt: observation.observedAt,
    recipient: persistedIdentifier(
      requirement.payTo,
      "catalog payment recipient",
      255,
    ),
    resourceUrl,
    scheme: "exact",
    transferMethod: "transfer-factory",
    x402Version: 2,
  });
}
