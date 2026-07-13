import { SOTTO_CONTROL_PACKAGE_ID } from "@sotto/x402-canton";
import { requirePackageId } from "./daml-template-ids.js";

type Environment = Readonly<Record<string, string | undefined>>;

export type SpikeConfig = Readonly<{
  explorer: { baseUrl: string };
  network: {
    audience: string;
    clientId: string;
    clientSecret: string;
    issuerUrl: string;
    ledgerUrl: string;
    scope: string;
    tokenUrl: string;
    validatorUrl: string;
  };
  payer: { party: string; purchaseId: string; signerUrl: string };
  policy: {
    agentParty: string;
    outsiderParty: string;
    ownerParty: string;
    packageId: string;
  };
  provider: { party: string; resourceUrl: string };
  relay: { url: string };
}>;

function required(environment: Environment, name: string): string {
  const value = environment[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required configuration: ${name}`);
  }
  return value;
}

function httpsUrl(
  environment: Environment,
  name: string,
  preserveTrailingSlash = false,
): string {
  const value = required(environment, name);
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS`);
  }
  const normalized = url.toString();
  return preserveTrailingSlash ? normalized : normalized.replace(/\/$/, "");
}

function approvedSottoPackageId(environment: Environment): string {
  const packageId = requirePackageId(
    required(environment, "SOTTO_CONTROL_PACKAGE_ID"),
    "SOTTO_CONTROL_PACKAGE_ID",
  );
  if (packageId !== SOTTO_CONTROL_PACKAGE_ID) {
    throw new Error(
      "SOTTO_CONTROL_PACKAGE_ID must equal the approved Sotto control package",
    );
  }
  return packageId;
}

export function readSpikeConfig(environment: Environment): SpikeConfig {
  return {
    explorer: {
      baseUrl: httpsUrl(environment, "CANTON_EXPLORER_BASE_URL"),
    },
    network: {
      audience: required(environment, "FIVE_NORTH_OIDC_AUDIENCE"),
      clientId: required(environment, "FIVE_NORTH_OIDC_CLIENT_ID"),
      clientSecret: required(environment, "FIVE_NORTH_OIDC_CLIENT_SECRET"),
      issuerUrl: httpsUrl(environment, "FIVE_NORTH_OIDC_ISSUER_URL"),
      ledgerUrl: httpsUrl(environment, "FIVE_NORTH_LEDGER_URL"),
      scope: required(environment, "FIVE_NORTH_OIDC_SCOPE"),
      tokenUrl: httpsUrl(environment, "FIVE_NORTH_OIDC_TOKEN_URL", true),
      validatorUrl: httpsUrl(environment, "FIVE_NORTH_VALIDATOR_URL"),
    },
    payer: {
      party: required(environment, "PAYER_PARTY"),
      purchaseId: required(environment, "SOTTO_PURCHASE_ID"),
      signerUrl: httpsUrl(environment, "PAYER_SIGNER_URL"),
    },
    policy: {
      agentParty: required(environment, "POLICY_AGENT_PARTY"),
      outsiderParty: required(environment, "POLICY_OUTSIDER_PARTY"),
      ownerParty: required(environment, "POLICY_OWNER_PARTY"),
      packageId: approvedSottoPackageId(environment),
    },
    provider: {
      party: required(environment, "PROVIDER_PARTY"),
      resourceUrl: httpsUrl(environment, "PAID_PROVIDER_URL"),
    },
    relay: {
      url: httpsUrl(environment, "X402_RELAY_URL"),
    },
  };
}

export function summarizeConfig(config: SpikeConfig) {
  return {
    configured: Object.values(config).length === 6,
    explorer: config.explorer.baseUrl.length > 0,
    network: config.network.ledgerUrl.length > 0,
    payer: config.payer.party.length > 0,
    policy: config.policy.packageId.length > 0,
    provider: config.provider.resourceUrl.length > 0,
    relay: config.relay.url.length > 0,
  } as const;
}
