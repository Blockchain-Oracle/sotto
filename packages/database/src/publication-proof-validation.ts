import type { OriginProofInput } from "./publication-types.js";
import {
  exactKeys,
  integer,
  objectValue,
  requestHash,
  sha256,
  time,
  uuid,
} from "./publication-validation-primitives.js";

export type ValidatedOriginProof = Readonly<{
  proofId: string;
  ownerId: string;
  originId: string;
  proofRevision: number;
  challengeHash: string;
  evidenceHash: string;
  verifiedAt: string;
  expiresAt: string;
  requestHash: string;
}>;

export function validateOriginProof(
  candidate: OriginProofInput,
): ValidatedOriginProof {
  const input = objectValue(candidate, "origin proof");
  exactKeys(
    input,
    [
      "proofId",
      "ownerId",
      "originId",
      "proofRevision",
      "challengeHash",
      "evidenceHash",
      "verifiedAt",
      "expiresAt",
    ],
    "origin proof",
  );
  const canonical = Object.freeze({
    proofId: uuid(input.proofId, "origin proof ID"),
    ownerId: uuid(input.ownerId, "origin proof owner ID"),
    originId: uuid(input.originId, "origin proof origin ID"),
    proofRevision: integer(input.proofRevision, "origin proof revision", 1),
    challengeHash: sha256(input.challengeHash, "origin proof challenge hash"),
    evidenceHash: sha256(input.evidenceHash, "origin proof evidence hash"),
    verifiedAt: time(input.verifiedAt, "origin proof verifiedAt"),
    expiresAt: time(input.expiresAt, "origin proof expiresAt"),
  });
  if (Date.parse(canonical.expiresAt) <= Date.parse(canonical.verifiedAt)) {
    throw new Error("origin proof expiry is invalid");
  }
  return Object.freeze({ ...canonical, requestHash: requestHash(canonical) });
}
