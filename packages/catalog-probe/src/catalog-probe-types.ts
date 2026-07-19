import type {
  ProbeHealthInput,
  ProbeObservationInput,
  PublicationRecordResult,
  ResourceHealthInput,
} from "@sotto/database";
import type { PinnedHttpsProbeRequest } from "./pinned-https-request.js";
import type {
  PublicHttpsTarget,
  ProbeAddressResolver,
} from "./public-https-target.js";

export type CatalogProbeInput = Readonly<{
  description: string;
  method: "GET";
  name: string;
  observationId: string;
  originId: string;
  resourceId: string;
  revisionId: string;
  routeTemplate: string;
}>;

export type CatalogProbeOrigin = Readonly<{
  originId: string;
  normalizedOrigin: string;
}>;

export type CatalogProbeStore = Readonly<{
  findProbeHealthById(healthObservationId: string): Promise<Readonly<{
    health: ResourceHealthInput;
    probe: ProbeObservationInput | null;
  }> | null>;
  findProviderOriginById(originId: string): Promise<CatalogProbeOrigin | null>;
  recordProbeHealth(input: ProbeHealthInput): Promise<PublicationRecordResult>;
  recordHealthObservation(
    input: ResourceHealthInput,
  ): Promise<PublicationRecordResult>;
}>;

export type CatalogProbeOptions = Readonly<{
  networkTimeoutMilliseconds?: number;
  signal?: AbortSignal;
}>;

export type CatalogProbeAcquisition =
  | Readonly<{
      outcome: "observed";
      observation: ProbeObservationInput;
      health: ResourceHealthInput;
      persistence: PublicationRecordResult;
    }>
  | Readonly<{
      outcome: "failed";
      health: ResourceHealthInput;
      persistence: PublicationRecordResult;
    }>;

export type CatalogPinnedHttpsRequester = (
  target: PublicHttpsTarget,
  request: PinnedHttpsProbeRequest,
) => Promise<Response>;

export type CatalogProbeDependencies = Readonly<{
  expectedNetwork: `canton:${string}`;
  monotonicNowMilliseconds?: () => number;
  requestPinnedHttps?: CatalogPinnedHttpsRequester;
  resolveAddresses?: ProbeAddressResolver;
  store: CatalogProbeStore;
}>;

export type CatalogProbe = Readonly<{
  acquireAndRecord(
    input: CatalogProbeInput,
    options?: CatalogProbeOptions,
  ): Promise<CatalogProbeAcquisition>;
}>;
