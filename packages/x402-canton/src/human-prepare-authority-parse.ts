import { createHash } from "node:crypto";
import {
  decodePrepareBase64,
  exactPrepareObject,
} from "./human-prepare-authority-primitives.js";
import { registerHumanPrepareAuthorityPlaintext } from "./human-prepare-authority-state.js";
import {
  HUMAN_PREPARE_AUTHORITY_VERSION,
  MAX_HUMAN_PREPARE_AUTHORITY_BYTES,
  type AuthenticatedHumanPrepareAuthorityPlaintext,
  type HumanPrepareAuthorityPayload,
} from "./human-prepare-authority-types.js";
import { assertStrictJson } from "./strict-json.js";
import { snapshotStrictJsonObject } from "./strict-json-value.js";

function decode(candidate: unknown): string {
  if (
    !(candidate instanceof Uint8Array) ||
    candidate.byteLength < 1 ||
    candidate.byteLength > MAX_HUMAN_PREPARE_AUTHORITY_BYTES ||
    (typeof SharedArrayBuffer !== "undefined" &&
      candidate.buffer instanceof SharedArrayBuffer)
  ) {
    throw new Error("human prepare authority plaintext is invalid");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      candidate,
    );
  } catch {
    throw new Error("human prepare authority plaintext is not strict UTF-8");
  }
}

function validateShape(value: unknown): HumanPrepareAuthorityPayload {
  const root = exactPrepareObject(
    value,
    [
      "version",
      "purchase",
      "requestBindingCanonicalBytes",
      "paymentChallengeBytes",
      "requestDisplay",
      "connector",
      "trustedConfiguration",
      "payerIdentity",
      "packageSelection",
    ],
    "human prepare authority plaintext",
  );
  if (root.version !== HUMAN_PREPARE_AUTHORITY_VERSION) {
    throw new Error("human prepare authority version is unsupported");
  }
  const purchase = exactPrepareObject(
    root.purchase,
    [
      "version",
      "attemptId",
      "canonicalBytes",
      "challengeId",
      "commitment",
      "expiresAt",
      "requestCommitment",
    ],
    "human prepare authority purchase",
  );
  decodePrepareBase64(purchase.canonicalBytes, 32_768, "purchase canonical");
  decodePrepareBase64(
    root.requestBindingCanonicalBytes,
    65_536,
    "request binding canonical",
  );
  decodePrepareBase64(root.paymentChallengeBytes, 16_384, "payment challenge");
  return snapshotStrictJsonObject(value, "human prepare authority plaintext", {
    maximumBytes: MAX_HUMAN_PREPARE_AUTHORITY_BYTES,
    maximumDepth: 16,
    maximumNodes: 4_096,
  }) as unknown as HumanPrepareAuthorityPayload;
}

export function parseHumanPrepareAuthorityPlaintext(
  candidate: Uint8Array,
): AuthenticatedHumanPrepareAuthorityPlaintext {
  const source = decode(candidate);
  if (source.charCodeAt(0) === 0xfeff) {
    throw new Error("human prepare authority plaintext must not contain a BOM");
  }
  assertStrictJson(source, 16, 4_096);
  const decoded = JSON.parse(source) as unknown;
  if (JSON.stringify(decoded) !== source) {
    throw new Error("human prepare authority plaintext is not canonical JSON");
  }
  const payload = validateShape(decoded);
  const plaintextSha256 = `sha256:${createHash("sha256")
    .update(candidate)
    .digest("hex")}` as const;
  const handle = Object.freeze({
    version: HUMAN_PREPARE_AUTHORITY_VERSION,
    plaintextSha256,
  }) as AuthenticatedHumanPrepareAuthorityPlaintext;
  registerHumanPrepareAuthorityPlaintext(handle, {
    claimed: false,
    payload,
    plaintextSha256,
  });
  return handle;
}
