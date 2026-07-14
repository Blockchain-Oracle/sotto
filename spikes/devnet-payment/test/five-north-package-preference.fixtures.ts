import type { SpikeConfig } from "../src/config.js";

export const network: SpikeConfig["network"] = {
  audience: "validator-devnet-m2m",
  clientId: "validator-devnet-m2m",
  clientSecret: "test-secret",
  issuerUrl:
    "https://auth.sandbox.fivenorth.io/application/o/validator-devnet-m2m",
  ledgerUrl: "https://ledger-api.validator.devnet.sandbox.fivenorth.io",
  scope: "daml_ledger_api",
  tokenUrl: "https://auth.sandbox.fivenorth.io/application/o/token/",
  validatorUrl:
    "https://wallet.validator.devnet.sandbox.fivenorth.io/api/validator",
};

export const SUBJECT = "ledger-user-6";
export const SYNCHRONIZER = `global-domain::1220${"e".repeat(64)}`;
export const VETTING_VALID_AT = "2026-07-14T10:00:30.000Z";
export const PARTIES = Object.freeze(
  [
    `DSO::1220${"d".repeat(64)}`,
    `sotto-agent::1220${"a".repeat(64)}`,
    `sotto-payer::1220${"b".repeat(64)}`,
    `sotto-provider::1220${"c".repeat(64)}`,
  ].sort(),
);

export function preferenceRequest() {
  return {
    packageRequirements: ["sotto-control", "splice-amulet"].map(
      (packageName) => ({ packageName, parties: [...PARTIES] }),
    ),
    synchronizerId: SYNCHRONIZER,
    vettingValidAt: VETTING_VALID_AT,
  };
}

export function preferenceResponse() {
  return {
    packageReferences: [
      {
        packageId:
          "4d614496ec9b30b22545fd350ecb9ec999164cfb0b5953f46dbbf937f8918f57",
        packageName: "sotto-control",
        packageVersion: "0.2.0",
      },
      {
        packageId:
          "73e9ffdb6b0bc19a5f67372b118103926da11547ab9109eccae47e4e4cc35d6f",
        packageName: "splice-amulet",
        packageVersion: "0.1.21",
      },
    ],
    synchronizerId: SYNCHRONIZER,
  };
}

export function tokenResponse(
  subject: unknown = SUBJECT,
  expiresIn = 28_800,
): Response {
  const payload = Buffer.from(JSON.stringify({ sub: subject })).toString(
    "base64url",
  );
  return Response.json({
    access_token: `header.${payload}.signature`,
    expires_in: expiresIn,
  });
}
