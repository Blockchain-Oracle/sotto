import type { PackagePreferenceReadRequest } from "@sotto/x402-canton";
import {
  boundedIdentifier,
  exactArray,
  exactKeys,
  objectValue,
  utf8Compare,
} from "./five-north-package-preference-validation.js";

const PACKAGE_NAME = "splice-amulet";
const PACKAGE_ID = /^[a-f0-9]{64}$/u;
const PARTY = /^[^\s:]+::1220[a-f0-9]{64}$/u;
const SYNCHRONIZER = /^[^\s:]+::1220[a-f0-9]{64}$/u;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function canonicalTime(value: unknown, label: string): string {
  if (typeof value !== "string" || !TIMESTAMP.test(value)) {
    throw new Error(`${label} must use canonical millisecond UTC`);
  }
  const milliseconds = Date.parse(value);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function exactParties(value: unknown): string[] {
  const parties = exactArray(value, 3, "human package parties").map((party) =>
    boundedIdentifier(party, "human package Party", 512),
  );
  if (
    parties.some((party) => !PARTY.test(party)) ||
    new Set(parties).size !== parties.length ||
    JSON.stringify(parties) !== JSON.stringify([...parties].sort(utf8Compare))
  ) {
    throw new Error("human package Parties are not exact and lexical");
  }
  return parties;
}

export function buildFiveNorthHumanPackagePreferenceBody(
  candidate: PackagePreferenceReadRequest,
): Readonly<{ body: string; synchronizerId: string }> {
  const request = objectValue(candidate, "human package preference request");
  exactKeys(
    request,
    ["packageRequirements", "synchronizerId", "vettingValidAt"],
    "human package preference request",
  );
  const requirement = objectValue(
    exactArray(request.packageRequirements, 1, "human package requirements")[0],
    "human package requirement",
  );
  exactKeys(
    requirement,
    ["packageName", "parties"],
    "human package requirement",
  );
  if (requirement.packageName !== PACKAGE_NAME) {
    throw new Error("human package requirement must be splice-amulet");
  }
  const synchronizerId = boundedIdentifier(
    request.synchronizerId,
    "human package synchronizer",
    512,
  );
  if (!SYNCHRONIZER.test(synchronizerId)) {
    throw new Error("human package synchronizer is invalid");
  }
  const body = JSON.stringify({
    packageVettingRequirements: [
      { packageName: PACKAGE_NAME, parties: exactParties(requirement.parties) },
    ],
    synchronizerId,
    vettingValidAt: canonicalTime(
      request.vettingValidAt,
      "human package vettingValidAt",
    ),
  });
  if (Buffer.byteLength(body, "utf8") > 8_192) {
    throw new Error("human package request exceeds its byte limit");
  }
  return Object.freeze({ body, synchronizerId });
}

export function parseFiveNorthHumanPackagePreferenceResponse(
  value: unknown,
  synchronizerId: string,
) {
  const response = objectValue(value, "human package preference response");
  exactKeys(
    response,
    ["packageReferences", "synchronizerId"],
    "human package preference response",
  );
  if (response.synchronizerId !== synchronizerId) {
    throw new Error("human package response synchronizer does not match");
  }
  const reference = objectValue(
    exactArray(response.packageReferences, 1, "human package references")[0],
    "human package reference",
  );
  exactKeys(
    reference,
    ["packageId", "packageName", "packageVersion"],
    "human package reference",
  );
  const packageId = boundedIdentifier(
    reference.packageId,
    "human package ID",
    64,
  );
  if (!PACKAGE_ID.test(packageId) || reference.packageName !== PACKAGE_NAME) {
    throw new Error("human package reference is not approved");
  }
  return Object.freeze([
    Object.freeze({
      packageId,
      packageName: PACKAGE_NAME,
      packageVersion: boundedIdentifier(
        reference.packageVersion,
        "human package version",
        128,
      ),
    }),
  ]);
}
