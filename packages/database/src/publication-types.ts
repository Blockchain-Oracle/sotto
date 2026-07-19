export type Sha256Identifier = `sha256:${string}`;

export type OriginProofInput = Readonly<{
  proofId: string;
  ownerId: string;
  originId: string;
  proofRevision: number;
  challengeHash: Sha256Identifier;
  evidenceHash: Sha256Identifier;
  verifiedAt: string;
  expiresAt: string;
}>;

export type VerifiedX402ProbeResult = Readonly<{
  kind: "verified-x402";
  revisionId: string;
  name: string;
  description: string;
  challengeHash: Sha256Identifier;
  x402Version: 2;
  scheme: "exact";
  network: `canton:${string}`;
  asset: string;
  recipient: string;
  amountAtomic: string;
  transferMethod: "transfer-factory";
}>;

export type NonX402ProbeResult = Readonly<{
  kind: "non-x402";
  reason: "HTTP_200" | "MISSING_PAYMENT_REQUIRED" | "UNSUPPORTED_REQUIREMENT";
}>;

export type ProbeObservationInput = Readonly<{
  observationId: string;
  originId: string;
  resourceId: string;
  method: string;
  routeTemplate: string;
  observedAt: string;
  httpStatus: number;
  evidenceHash: Sha256Identifier;
  result: VerifiedX402ProbeResult | NonX402ProbeResult;
}>;

export type PublishVerifiedResourceInput = Readonly<{
  publicationId: string;
  listingId: string;
  ownerId: string;
  originProofId: string;
  resourceId: string;
  resourceRevisionId: string;
  expectedListingVersion: number;
}>;

export type PublicPublishedResource = Readonly<{
  resourceId: string;
  resourceRevisionId: string;
  listingVersion: number;
  providerId: string;
  providerDisplayName: string;
  normalizedOrigin: string;
  name: string;
  description: string;
  method: string;
  routeTemplate: string;
  x402Version: 2;
  scheme: "exact";
  network: string;
  asset: string;
  recipient: string;
  amountAtomic: string;
  transferMethod: "transfer-factory";
  lastVerifiedAt: string;
}>;

export type PublicationOperationResult = PublicPublishedResource &
  Readonly<{ outcome: "created" | "replayed" }>;

export type PublicationRecordResult = Readonly<{
  id: string;
  outcome: "created" | "replayed";
}>;

export class PublicationIneligibleError extends Error {
  readonly code = "PUBLICATION_INELIGIBLE";

  constructor() {
    super("resource is not eligible for publication");
    this.name = "PublicationIneligibleError";
  }
}

export class PublicationStaleError extends Error {
  readonly code = "PUBLICATION_STALE";

  constructor() {
    super("publication revision is stale");
    this.name = "PublicationStaleError";
  }
}
