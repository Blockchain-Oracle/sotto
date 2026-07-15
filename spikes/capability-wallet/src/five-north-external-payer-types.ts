export const FIVE_NORTH_EXTERNAL_PAYER_VERSION =
  "sotto-five-north-external-payer-v1" as const;

export type ExternalPartyTopology = Readonly<{
  multiHash: string;
  partyId: string;
  publicKeyFingerprint: string;
  topologyTransactions: ReadonlyArray<string>;
}>;

export type ExternalPartyCreation = Readonly<{
  execute: (
    signature: string,
    options: Readonly<{ grantUserRights: false }>,
  ) => Promise<ExternalPartyTopology>;
  topology: () => Promise<ExternalPartyTopology>;
}>;

export type ExternalPartyCreator = (
  publicKey: string,
  options: Readonly<{ partyHint: string; synchronizerId: string }>,
) => ExternalPartyCreation;

export type FiveNorthExternalPayerInput = Readonly<{
  expectedFingerprint?: string;
  keyFile: string;
  mode: "dry-run" | "live";
  partyHint: string;
  signal: AbortSignal;
  synchronizerId: string;
}>;

export type FiveNorthExternalPayerResult = Readonly<{
  fingerprint: `1220${string}`;
  mode: "dry-run" | "live";
  mutationSubmitted: boolean;
  partyHint: string;
  proposedPartyId: string;
  synchronizerId: string;
  version: typeof FIVE_NORTH_EXTERNAL_PAYER_VERSION;
}>;
