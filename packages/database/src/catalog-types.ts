import type {
  OriginProofInput,
  ProbeObservationInput,
  PublicationOperationResult,
  PublicationRecordResult,
  PublicPublishedResource,
  PublishVerifiedResourceInput,
} from "./publication-types.js";
import type {
  PersistedProbeHealth,
  ProbeHealthInput,
  ResourceHealthInput,
  ResourceHealthObservation,
  ResourceHealthRecordResult,
} from "./resource-health-types.js";

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
  findProviderOriginById(
    originId: string,
  ): Promise<ProviderOriginRecord | null>;
  recordOriginProof(input: OriginProofInput): Promise<PublicationRecordResult>;
  recordProbeObservation(
    input: ProbeObservationInput,
  ): Promise<PublicationRecordResult>;
  recordProbeHealth(
    input: ProbeHealthInput,
  ): Promise<ResourceHealthRecordResult>;
  recordHealthObservation(
    input: ResourceHealthInput,
  ): Promise<ResourceHealthRecordResult>;
  findLatestResourceHealth(
    resourceId: string,
  ): Promise<ResourceHealthObservation | null>;
  findProbeHealthById(
    healthObservationId: string,
  ): Promise<PersistedProbeHealth | null>;
  publishVerifiedResource(
    input: PublishVerifiedResourceInput,
  ): Promise<PublicationOperationResult>;
  listPublishedResources(): Promise<readonly PublicPublishedResource[]>;
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
