import { describe, expect, it } from "vitest";
import { buildPrivatePrepareAuthorityAad } from "../src/purchase-prepare-authority-aad.js";

const SHA = "a".repeat(64);
const input = Object.freeze({
  attemptId: `sha256:${SHA}`,
  encryptionGeneration: 1,
  keyId: "prepare-key-2026-07",
  operationId: `sha256:${"b".repeat(64)}`,
  ownerId: "018f3f24-7d4a-7e2c-a421-0f3473b94301",
  purchaseCommitment: `sha256:${"c".repeat(64)}`,
  requestHash: "d".repeat(64),
  resourceRevisionId: "018f3f24-7d4a-7e2c-a421-0f3473b94302",
  sourceCommit: "e".repeat(40),
});

const expected =
  "sotto-private-prepare-authority-aad-v1\0" +
  JSON.stringify({
    aeadAlgorithm: "aes-256-gcm",
    attemptId: input.attemptId,
    authoritySchema: "sotto-private-prepare-authority-v1",
    encryptionGeneration: 1,
    keyId: input.keyId,
    operationId: input.operationId,
    ownerId: input.ownerId,
    purchaseCommitment: input.purchaseCommitment,
    requestHash: input.requestHash,
    resourceRevisionId: input.resourceRevisionId,
    sourceCommit: input.sourceCommit,
  });

describe("private prepare authority AAD", () => {
  it("pins the exact fixed-order byte contract", () => {
    const aad = buildPrivatePrepareAuthorityAad(input);

    expect(new TextDecoder().decode(aad)).toBe(expected);
    aad.fill(0);
    expect(
      new TextDecoder().decode(buildPrivatePrepareAuthorityAad(input)),
    ).toBe(expected);
  });

  it.each([
    ["attemptId", `sha256:${"f".repeat(64)}`],
    ["encryptionGeneration", 2],
    ["keyId", "prepare-key-2026-08"],
    ["operationId", `sha256:${"f".repeat(64)}`],
    ["ownerId", "018f3f24-7d4a-7e2c-a421-0f3473b94303"],
    ["purchaseCommitment", `sha256:${"f".repeat(64)}`],
    ["requestHash", "f".repeat(64)],
    ["resourceRevisionId", "018f3f24-7d4a-7e2c-a421-0f3473b94304"],
    ["sourceCommit", "f".repeat(40)],
  ] as const)("binds %s", (field, value) => {
    const changed = buildPrivatePrepareAuthorityAad({
      ...input,
      [field]: value,
    });

    expect(changed).not.toEqual(buildPrivatePrepareAuthorityAad(input));
  });

  it.each([
    ["attemptId", "sha256:short"],
    ["encryptionGeneration", 0],
    ["encryptionGeneration", 2_147_483_648],
    ["keyId", "unsafe/key"],
    ["operationId", "sha256:short"],
    ["ownerId", "not-a-uuid"],
    ["purchaseCommitment", "sha256:short"],
    ["requestHash", "short"],
    ["resourceRevisionId", "not-a-uuid"],
    ["sourceCommit", "short"],
  ] as const)("rejects invalid %s", (field, value) => {
    expect(() =>
      buildPrivatePrepareAuthorityAad({ ...input, [field]: value } as never),
    ).toThrow("private prepare authority AAD is invalid");
  });

  it("rejects extra AAD members", () => {
    expect(() =>
      buildPrivatePrepareAuthorityAad({ ...input, extra: "ignored" } as never),
    ).toThrow("private prepare authority AAD is invalid");
  });

  it("snapshots each AAD member exactly once", () => {
    let reads = 0;
    const candidate = {
      ...input,
      get attemptId() {
        reads += 1;
        return reads === 1 ? input.attemptId : "not-valid";
      },
    };

    expect(
      new TextDecoder().decode(buildPrivatePrepareAuthorityAad(candidate)),
    ).toBe(expected);
    expect(reads).toBe(1);
  });
});
