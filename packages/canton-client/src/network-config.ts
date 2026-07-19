type Environment = Readonly<Record<string, string | undefined>>;

export type FiveNorthNetworkConfig = Readonly<{
  audience: string;
  clientId: string;
  clientSecret: string;
  issuerUrl: string;
  ledgerUrl: string;
  scope: string;
  tokenUrl: string;
  validatorUrl: string;
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
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS`);
  }
  const normalized = url.toString();
  return preserveTrailingSlash ? normalized : normalized.replace(/\/$/, "");
}

export function readFiveNorthNetworkConfig(
  environment: Environment,
): FiveNorthNetworkConfig {
  return Object.freeze({
    audience: required(environment, "FIVE_NORTH_OIDC_AUDIENCE"),
    clientId: required(environment, "FIVE_NORTH_OIDC_CLIENT_ID"),
    clientSecret: required(environment, "FIVE_NORTH_OIDC_CLIENT_SECRET"),
    issuerUrl: httpsUrl(environment, "FIVE_NORTH_OIDC_ISSUER_URL"),
    ledgerUrl: httpsUrl(environment, "FIVE_NORTH_LEDGER_URL"),
    scope: required(environment, "FIVE_NORTH_OIDC_SCOPE"),
    tokenUrl: httpsUrl(environment, "FIVE_NORTH_OIDC_TOKEN_URL", true),
    validatorUrl: httpsUrl(environment, "FIVE_NORTH_VALIDATOR_URL"),
  });
}
