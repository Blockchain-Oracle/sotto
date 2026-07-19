import type {
  FiveNorthWalletPreflightSnapshot,
  FiveNorthWalletRight,
} from "./five-north-wallet-preflight.js";

const RIGHT_KINDS = new Set<FiveNorthWalletRight["kind"]>([
  "act-as",
  "execute-as",
  "execute-any",
  "identity-provider-admin",
  "participant-admin",
  "read-any",
  "read-as",
]);
const PARTY_RIGHTS = new Set(["act-as", "execute-as", "read-as"]);
const BOOLEAN_FIELDS = [
  "agentPartyVisible",
  "executeRouteReachable",
  "externalPartyTopologySupported",
  "packageVisible",
  "preferredPackageConfirmed",
  "prepareRouteReachable",
  "synchronizerConfirmed",
] as const;

export function validateFiveNorthWalletPreflightSnapshot(
  snapshot: FiveNorthWalletPreflightSnapshot,
): void {
  if (typeof snapshot !== "object" || snapshot === null) {
    throw new Error("preflight snapshot is invalid");
  }
  for (const field of BOOLEAN_FIELDS) {
    if (typeof snapshot[field] !== "boolean") {
      throw new Error(`preflight ${field} must be boolean`);
    }
  }
  if (!Array.isArray(snapshot.rights) || snapshot.rights.length > 2_048) {
    throw new Error("preflight rights are invalid");
  }
  for (const [index, candidate] of snapshot.rights.entries()) {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      !RIGHT_KINDS.has(candidate.kind)
    ) {
      throw new Error(`preflight right[${index}] is invalid`);
    }
    const keys = Object.keys(candidate).sort();
    const expected = PARTY_RIGHTS.has(candidate.kind)
      ? ["kind", "party"]
      : ["kind"];
    if (JSON.stringify(keys) !== JSON.stringify(expected)) {
      throw new Error(`preflight right[${index}] shape is invalid`);
    }
    if (
      PARTY_RIGHTS.has(candidate.kind) &&
      (typeof (candidate as { party?: unknown }).party !== "string" ||
        (candidate as { party: string }).party.length === 0)
    ) {
      throw new Error(`preflight right[${index}] Party is invalid`);
    }
  }
}
