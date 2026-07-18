import type {
  CatalogRepository,
  OriginProofInput,
  ProbeObservationInput,
  PublicationOperationResult,
  ProviderOriginRegistration,
  PublicPublishedResource,
  PublishVerifiedResourceInput,
} from "../src/index.js";

export const OWNER_ID = "018f3f24-7d4a-7e2c-a421-0f3473b96001";
export const ORIGIN_ID = "018f3f24-7d4a-7e2c-a421-0f3473b96003";
export const PROOF_ID = "018f3f24-7d4a-7e2c-a421-0f3473b96004";
export const RESOURCE_ID = "018f3f24-7d4a-7e2c-a421-0f3473b96005";
export const REVISION_ID = "018f3f24-7d4a-7e2c-a421-0f3473b96006";

export const originRegistration: ProviderOriginRegistration = {
  registrationId: "018f3f24-7d4a-7e2c-a421-0f3473b96000",
  ownerId: OWNER_ID,
  ownerPartyId: "sotto-publisher::1220owner",
  providerId: "018f3f24-7d4a-7e2c-a421-0f3473b96002",
  providerDisplayName: "Real Weather API",
  originId: ORIGIN_ID,
  originUrl: "https://weather.example.com/",
};

export const originProof = Object.freeze({
  proofId: PROOF_ID,
  ownerId: OWNER_ID,
  originId: ORIGIN_ID,
  proofRevision: 1,
  challengeHash: `sha256:${"a".repeat(64)}`,
  evidenceHash: `sha256:${"b".repeat(64)}`,
  verifiedAt: "2026-07-18T00:00:00.000Z",
  expiresAt: "2099-07-18T00:00:00.000Z",
}) satisfies OriginProofInput;

export const verifiedProbe = Object.freeze({
  observationId: "018f3f24-7d4a-7e2c-a421-0f3473b96007",
  originId: ORIGIN_ID,
  resourceId: RESOURCE_ID,
  method: "GET",
  routeTemplate: "/weather/current",
  observedAt: "2026-07-18T00:00:01.000Z",
  httpStatus: 402,
  evidenceHash: `sha256:${"c".repeat(64)}`,
  result: Object.freeze({
    kind: "verified-x402" as const,
    revisionId: REVISION_ID,
    name: "Current weather",
    description: "Return current weather for one location.",
    challengeHash: `sha256:${"d".repeat(64)}`,
    x402Version: 2,
    scheme: "exact",
    network: "canton:devnet",
    asset: "CC",
    recipient: "sotto-weather-provider::1220provider",
    amountAtomic: "2500000000",
    transferMethod: "transfer-factory",
  }),
}) satisfies ProbeObservationInput;

export const publication = Object.freeze({
  publicationId: "018f3f24-7d4a-7e2c-a421-0f3473b96008",
  listingId: "018f3f24-7d4a-7e2c-a421-0f3473b96009",
  ownerId: OWNER_ID,
  originProofId: PROOF_ID,
  resourceId: RESOURCE_ID,
  resourceRevisionId: REVISION_ID,
  expectedListingVersion: 0,
}) satisfies PublishVerifiedResourceInput;

export type PublicationCatalog = CatalogRepository &
  Readonly<{
    recordOriginProof(input: OriginProofInput): Promise<unknown>;
    recordProbeObservation(input: ProbeObservationInput): Promise<unknown>;
    publishVerifiedResource(
      input: PublishVerifiedResourceInput,
    ): Promise<PublicationOperationResult>;
    listPublishedResources(): Promise<readonly PublicPublishedResource[]>;
  }>;

export function nonX402Probe(): ProbeObservationInput {
  return Object.freeze({
    observationId: "018f3f24-7d4a-7e2c-a421-0f3473b96010",
    originId: ORIGIN_ID,
    resourceId: "018f3f24-7d4a-7e2c-a421-0f3473b96011",
    method: "GET",
    routeTemplate: "/free",
    observedAt: "2026-07-18T00:00:02.000Z",
    httpStatus: 200,
    evidenceHash: `sha256:${"e".repeat(64)}`,
    result: Object.freeze({
      kind: "non-x402" as const,
      reason: "HTTP_200" as const,
    }),
  });
}
