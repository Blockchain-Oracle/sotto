export type ProviderOriginRegistration = Readonly<{
  registrationId: string;
  ownerId: string;
  ownerPartyId: string;
  providerId: string;
  providerDisplayName: string;
  originId: string;
  originUrl: string;
}>;

export type ProviderOriginRecord = Readonly<{
  registrationId: string;
  ownerId: string;
  ownerPartyId: string;
  providerId: string;
  providerDisplayName: string;
  originId: string;
  normalizedOrigin: string;
}>;

export type ProviderOriginRegistrationResult = ProviderOriginRecord &
  Readonly<{ outcome: "created" | "replayed" }>;

export type CatalogOperationalEvent = Readonly<{
  code: "CATALOG_POOL_ERROR";
}>;

export type CatalogRepositoryInput = Readonly<{
  databaseUrl: string;
  maxConnections?: number;
  applicationName?: string;
  onOperationalError?: (event: CatalogOperationalEvent) => void | Promise<void>;
}>;

export type CatalogRepository = Readonly<{
  registerProviderOrigin(
    input: ProviderOriginRegistration,
  ): Promise<ProviderOriginRegistrationResult>;
  findProviderOrigin(originUrl: string): Promise<ProviderOriginRecord | null>;
  close(): Promise<void>;
}>;

export class CatalogConflictError extends Error {
  readonly code = "CATALOG_CONFLICT";

  constructor() {
    super("catalog identity conflict");
    this.name = "CatalogConflictError";
  }
}

export class CatalogPersistenceError extends Error {
  readonly code = "CATALOG_PERSISTENCE";

  constructor() {
    super("catalog persistence failed");
    this.name = "CatalogPersistenceError";
  }
}
