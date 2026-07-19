import type { PublishVerifiedResourceInput } from "./publication-types.js";
import {
  exactKeys,
  integer,
  objectValue,
  requestHash,
  uuid,
} from "./publication-validation-primitives.js";

export type ValidatedPublicationRequest = Readonly<{
  publicationId: string;
  listingId: string;
  ownerId: string;
  originProofId: string;
  resourceId: string;
  resourceRevisionId: string;
  expectedListingVersion: number;
  requestHash: string;
}>;

export function validatePublicationRequest(
  candidate: PublishVerifiedResourceInput,
): ValidatedPublicationRequest {
  const input = objectValue(candidate, "publication request");
  exactKeys(
    input,
    [
      "publicationId",
      "listingId",
      "ownerId",
      "originProofId",
      "resourceId",
      "resourceRevisionId",
      "expectedListingVersion",
    ],
    "publication request",
  );
  const canonical = Object.freeze({
    publicationId: uuid(input.publicationId, "publication ID"),
    listingId: uuid(input.listingId, "listing ID"),
    ownerId: uuid(input.ownerId, "publication owner ID"),
    originProofId: uuid(input.originProofId, "publication proof ID"),
    resourceId: uuid(input.resourceId, "publication resource ID"),
    resourceRevisionId: uuid(
      input.resourceRevisionId,
      "publication revision ID",
    ),
    expectedListingVersion: integer(
      input.expectedListingVersion,
      "expected listing version",
      0,
    ),
  });
  return Object.freeze({ ...canonical, requestHash: requestHash(canonical) });
}
