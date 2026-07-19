import type { SpikeConfig } from "./config.js";

export const FIVE_NORTH_PREPARE_ENDPOINTS = Object.freeze({
  issuerUrl:
    "https://auth.sandbox.fivenorth.io/application/o/validator-devnet-m2m",
  ledgerUrl: "https://ledger-api.validator.devnet.sandbox.fivenorth.io",
  tokenUrl: "https://auth.sandbox.fivenorth.io/application/o/token/",
  validatorUrl:
    "https://wallet.validator.devnet.sandbox.fivenorth.io/api/validator",
});

export type ApprovedFiveNorthPrepareNetwork = Readonly<SpikeConfig["network"]>;

export function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function exact(value: unknown, expected: string, label: string): void {
  if (value !== expected) {
    throw new Error(`${label} is not an approved Five North prepare value`);
  }
}

export function approveFiveNorthPrepareNetwork(
  candidate: SpikeConfig["network"],
): ApprovedFiveNorthPrepareNetwork {
  exact(candidate.audience, "validator-devnet-m2m", "OIDC audience");
  exact(candidate.clientId, "validator-devnet-m2m", "OIDC client ID");
  exact(candidate.scope, "daml_ledger_api", "OIDC scope");
  exact(
    candidate.issuerUrl,
    FIVE_NORTH_PREPARE_ENDPOINTS.issuerUrl,
    "OIDC issuer URL",
  );
  exact(
    candidate.tokenUrl,
    FIVE_NORTH_PREPARE_ENDPOINTS.tokenUrl,
    "OIDC token URL",
  );
  exact(
    candidate.ledgerUrl,
    FIVE_NORTH_PREPARE_ENDPOINTS.ledgerUrl,
    "Ledger URL",
  );
  exact(
    candidate.validatorUrl,
    FIVE_NORTH_PREPARE_ENDPOINTS.validatorUrl,
    "validator URL",
  );
  if (
    typeof candidate.clientSecret !== "string" ||
    candidate.clientSecret.length === 0 ||
    candidate.clientSecret.length > 16_384 ||
    hasControlCharacter(candidate.clientSecret)
  ) {
    throw new Error("OIDC client secret is invalid");
  }
  return Object.freeze({ ...candidate });
}

export function requireSottoPayerParty(candidate: unknown): string {
  if (
    typeof candidate !== "string" ||
    !candidate.startsWith("sotto-") ||
    !candidate.includes("::") ||
    candidate.trim() !== candidate ||
    Buffer.byteLength(candidate, "utf8") > 512 ||
    hasControlCharacter(candidate)
  ) {
    throw new Error("prepare payer must be one bounded sotto- Party");
  }
  return candidate;
}
