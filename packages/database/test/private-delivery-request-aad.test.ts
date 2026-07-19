import { describe, expect, it } from "vitest";
import {
  buildPrivateDeliveryRequestAad,
  PRIVATE_DELIVERY_REQUEST_SCHEMA,
  type PrivateDeliveryRequestAadInput,
} from "../src/private-delivery-request-aad.js";

const validInput: PrivateDeliveryRequestAadInput = Object.freeze({
  attemptId: `sha256:${"a".repeat(64)}`,
  encryptionGeneration: 1,
  keyId: "delivery-key-2026-07",
  operationId: `sha256:${"b".repeat(64)}`,
  ownerId: "018f3f24-7d4a-7e2c-a421-0f3473b99041",
  purchaseCommitment: `sha256:${"c".repeat(64)}`,
  requestCommitment: `sha256:${"d".repeat(64)}`,
  requestHash: "e".repeat(64),
  resourceRevisionId: "018f3f24-7d4a-7e2c-a421-0f3473b99042",
  sourceCommit: "f".repeat(40),
});

function changed(
  mutate: (candidate: Record<string, unknown>) => void,
): unknown {
  const candidate = structuredClone(validInput) as unknown as Record<
    string,
    unknown
  >;
  mutate(candidate);
  return candidate;
}

describe("private delivery request AAD", () => {
  it("pins deterministic domain-separated request identity bytes", () => {
    const source = new TextDecoder().decode(
      buildPrivateDeliveryRequestAad(validInput),
    );

    expect(source).toBe(
      `sotto-private-delivery-request-aad-v1\0${JSON.stringify({
        aeadAlgorithm: "aes-256-gcm",
        attemptId: validInput.attemptId,
        encryptionGeneration: 1,
        keyId: validInput.keyId,
        operationId: validInput.operationId,
        ownerId: validInput.ownerId,
        payloadSchema: PRIVATE_DELIVERY_REQUEST_SCHEMA,
        purchaseCommitment: validInput.purchaseCommitment,
        requestCommitment: validInput.requestCommitment,
        requestHash: validInput.requestHash,
        resourceRevisionId: validInput.resourceRevisionId,
        sourceCommit: validInput.sourceCommit,
      })}`,
    );
  });

  it.each([
    ["missing member", changed((value) => delete value.requestCommitment)],
    ["extra member", changed((value) => (value.secret = "private"))],
    ["attempt", changed((value) => (value.attemptId = "sha256:bad"))],
    ["operation", changed((value) => (value.operationId = "sha256:bad"))],
    ["owner", changed((value) => (value.ownerId = "bad"))],
    [
      "purchase commitment",
      changed((value) => (value.purchaseCommitment = "sha256:bad")),
    ],
    [
      "request commitment",
      changed((value) => (value.requestCommitment = "sha256:bad")),
    ],
    ["request hash", changed((value) => (value.requestHash = "bad"))],
    ["resource", changed((value) => (value.resourceRevisionId = "bad"))],
    ["source", changed((value) => (value.sourceCommit = "bad"))],
    ["key", changed((value) => (value.keyId = "BAD KEY"))],
    ["generation zero", changed((value) => (value.encryptionGeneration = 0))],
    [
      "generation fractional",
      changed((value) => (value.encryptionGeneration = 1.5)),
    ],
  ])("rejects %s", (_name, candidate) => {
    expect(() =>
      buildPrivateDeliveryRequestAad(
        candidate as PrivateDeliveryRequestAadInput,
      ),
    ).toThrow("private delivery request AAD is invalid");
  });
});
