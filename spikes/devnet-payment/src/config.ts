type Environment = Readonly<Record<string, string | undefined>>;

export type SpikeConfig = Readonly<{
  explorer: { baseUrl: string };
  network: {
    clientId: string;
    clientSecret: string;
    issuerUrl: string;
    ledgerUrl: string;
  };
  payer: { party: string; signerUrl: string };
  provider: { resourceUrl: string };
  relay: { url: string };
}>;

function required(environment: Environment, name: string): string {
  const value = environment[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required configuration: ${name}`);
  }
  return value;
}

function httpsUrl(environment: Environment, name: string): string {
  const value = required(environment, name);
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS`);
  }
  return url.toString().replace(/\/$/, "");
}

export function readSpikeConfig(environment: Environment): SpikeConfig {
  return {
    explorer: {
      baseUrl: httpsUrl(environment, "CANTON_EXPLORER_BASE_URL"),
    },
    network: {
      clientId: required(environment, "FIVE_NORTH_OIDC_CLIENT_ID"),
      clientSecret: required(environment, "FIVE_NORTH_OIDC_CLIENT_SECRET"),
      issuerUrl: httpsUrl(environment, "FIVE_NORTH_OIDC_ISSUER_URL"),
      ledgerUrl: httpsUrl(environment, "FIVE_NORTH_LEDGER_URL"),
    },
    payer: {
      party: required(environment, "PAYER_PARTY"),
      signerUrl: httpsUrl(environment, "PAYER_SIGNER_URL"),
    },
    provider: {
      resourceUrl: httpsUrl(environment, "PAID_PROVIDER_URL"),
    },
    relay: {
      url: httpsUrl(environment, "X402_RELAY_URL"),
    },
  };
}

export function summarizeConfig(config: SpikeConfig) {
  return {
    configured: Object.values(config).length === 5,
    explorer: config.explorer.baseUrl.length > 0,
    network: config.network.ledgerUrl.length > 0,
    payer: config.payer.party.length > 0,
    provider: config.provider.resourceUrl.length > 0,
    relay: config.relay.url.length > 0,
  } as const;
}
