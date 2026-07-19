export type SettlementProof = Readonly<{
  attemptId: `sha256:${string}`;
  requestCommitment: `sha256:${string}`;
  updateId: string;
}>;

const MAX_PROOF_HEADER_BYTES = 4_096;
const canonicalBase64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const sha256Reference = /^sha256:[0-9a-f]{64}$/u;
const updateId = /^1220[0-9a-f]{64}$/u;
const proofKeys = ["attemptId", "requestCommitment", "updateId"] as const;

function validatedProof(value: unknown): SettlementProof {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Settlement proof must be an object");
  }
  const proof = value as Record<string, unknown>;
  const keys = Object.keys(proof);
  if (
    keys.length !== proofKeys.length ||
    proofKeys.some((key) => !Object.hasOwn(proof, key))
  ) {
    throw new Error("Settlement proof must contain the exact required keys");
  }
  if (
    typeof proof.attemptId !== "string" ||
    !sha256Reference.test(proof.attemptId) ||
    typeof proof.requestCommitment !== "string" ||
    !sha256Reference.test(proof.requestCommitment) ||
    typeof proof.updateId !== "string" ||
    !updateId.test(proof.updateId)
  ) {
    throw new Error("Settlement proof fields are invalid");
  }
  return Object.freeze({
    attemptId: proof.attemptId as SettlementProof["attemptId"],
    requestCommitment:
      proof.requestCommitment as SettlementProof["requestCommitment"],
    updateId: proof.updateId,
  });
}

function canonicalJson(proof: SettlementProof): string {
  return JSON.stringify({
    attemptId: proof.attemptId,
    requestCommitment: proof.requestCommitment,
    updateId: proof.updateId,
  });
}

export function parseSettlementProofHeader(value: string): SettlementProof {
  if (Buffer.byteLength(value, "utf8") > MAX_PROOF_HEADER_BYTES) {
    throw new Error("PAYMENT-SIGNATURE exceeds 4096 bytes");
  }
  if (!canonicalBase64.test(value)) {
    throw new Error("PAYMENT-SIGNATURE must use canonical base64");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) {
    throw new Error("PAYMENT-SIGNATURE must use canonical base64");
  }
  let json: string;
  let parsed: unknown;
  try {
    json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    parsed = JSON.parse(json);
  } catch {
    throw new Error("PAYMENT-SIGNATURE must contain canonical UTF-8 JSON");
  }
  const proof = validatedProof(parsed);
  if (json !== canonicalJson(proof)) {
    throw new Error("Settlement proof JSON must be canonical");
  }
  return proof;
}

export function encodeSettlementProof(proof: SettlementProof): string {
  return Buffer.from(canonicalJson(validatedProof(proof)), "utf8").toString(
    "base64",
  );
}
