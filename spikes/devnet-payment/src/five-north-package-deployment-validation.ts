import { createHash } from "node:crypto";

export const MAXIMUM_FIVE_NORTH_DAR_BYTES = 16_777_216;
const SYNCHRONIZER_PATTERN = /^[^\s:]+::1220[0-9a-f]{64}$/u;

export function requireFiveNorthDarSha256(bytes: Uint8Array): string {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength === 0 ||
    bytes.byteLength > MAXIMUM_FIVE_NORTH_DAR_BYTES
  ) {
    throw new Error("Five North DAR exceeds byte limit or is empty");
  }
  return createHash("sha256").update(bytes).digest("hex");
}

export function requirePackageDeploymentIdentity(
  token: string,
): `sha256:${string}` {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[1] === undefined) {
    throw new Error("Five North access token is not a JWT");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("Five North access token payload is invalid");
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload) ||
    typeof (payload as Record<string, unknown>).sub !== "string" ||
    (payload as { sub: string }).sub.trim() === "" ||
    Buffer.byteLength((payload as { sub: string }).sub, "utf8") > 256
  ) {
    throw new Error("Five North access token subject is invalid");
  }
  return `sha256:${createHash("sha256")
    .update((payload as { sub: string }).sub)
    .digest("hex")}`;
}

export function requirePackageDeploymentSynchronizer(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Five North AmuletRules response must be an object");
  }
  const root = value as Record<string, unknown>;
  if (
    typeof root.amulet_rules !== "object" ||
    root.amulet_rules === null ||
    Array.isArray(root.amulet_rules)
  ) {
    throw new Error("Five North AmuletRules contract is invalid");
  }
  const synchronizerId = (root.amulet_rules as Record<string, unknown>)[
    "domain_id"
  ];
  if (
    typeof synchronizerId !== "string" ||
    !SYNCHRONIZER_PATTERN.test(synchronizerId)
  ) {
    throw new Error("Five North AmuletRules synchronizer is invalid");
  }
  return synchronizerId;
}
