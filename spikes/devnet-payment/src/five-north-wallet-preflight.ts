import { createHash } from "node:crypto";
import { validateFiveNorthWalletPreflightSnapshot } from "./five-north-wallet-preflight-snapshot.js";

export const FIVE_NORTH_WALLET_PREFLIGHT_VERSION =
  "sotto-five-north-wallet-preflight-v1" as const;

export type FiveNorthWalletRight =
  | Readonly<{ kind: "act-as"; party: string }>
  | Readonly<{ kind: "execute-as"; party: string }>
  | Readonly<{ kind: "execute-any" }>
  | Readonly<{ kind: "identity-provider-admin" }>
  | Readonly<{ kind: "participant-admin" }>
  | Readonly<{ kind: "read-any" }>
  | Readonly<{ kind: "read-as"; party: string }>;

export type FiveNorthWalletPreflightSnapshot = Readonly<{
  agentParty: string;
  agentPartyVisible: boolean;
  authenticatedSubject: string;
  executeRouteReachable: boolean;
  externalPartyTopologySupported: boolean;
  packageVisible: boolean;
  preferredPackageConfirmed: boolean;
  prepareRouteReachable: boolean;
  rights: ReadonlyArray<FiveNorthWalletRight>;
  synchronizerConfirmed: boolean;
}>;

export type FiveNorthWalletPreflightScope = Readonly<{
  agentParty: string;
  payerParty: string;
}>;

export type FiveNorthWalletPreflightReason =
  | "AGENT_ACT_AS_MISSING"
  | "AGENT_PARTY_UNAVAILABLE"
  | "BROAD_AUTHORITY_PRESENT"
  | "EXECUTE_ROUTE_UNREACHABLE"
  | "EXTERNAL_PARTY_TOPOLOGY_UNSUPPORTED"
  | "PAYER_AUTHORITY_PRESENT"
  | "PREFERRED_PACKAGE_UNCONFIRMED"
  | "PREPARE_ROUTE_UNREACHABLE"
  | "SOTTO_PACKAGE_UNAVAILABLE"
  | "SYNCHRONIZER_UNCONFIRMED";

export type FiveNorthWalletPreflightResult = Readonly<{
  checks: Readonly<{
    agentActAsPresent: boolean;
    agentPartyVisible: boolean;
    broadAuthorityAbsent: boolean;
    executeRouteReachable: boolean;
    externalPartyTopologySupported: boolean;
    packageVisible: boolean;
    payerActAsAbsent: boolean;
    preferredPackageConfirmed: boolean;
    prepareRouteReachable: boolean;
    synchronizerConfirmed: boolean;
  }>;
  reasons: ReadonlyArray<FiveNorthWalletPreflightReason>;
  subjectHash: `sha256:${string}`;
  verdict: "SUPPORTED" | "UNSUPPORTED";
  version: typeof FIVE_NORTH_WALLET_PREFLIGHT_VERSION;
}>;

function requiredIdentity(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 512 ||
    value.trim() !== value
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function addReason(
  reasons: FiveNorthWalletPreflightReason[],
  condition: boolean,
  reason: FiveNorthWalletPreflightReason,
): void {
  if (!condition) reasons.push(reason);
}

export function evaluateFiveNorthWalletPreflight(
  snapshot: FiveNorthWalletPreflightSnapshot,
  scope: FiveNorthWalletPreflightScope,
): FiveNorthWalletPreflightResult {
  validateFiveNorthWalletPreflightSnapshot(snapshot);
  const agentParty = requiredIdentity(
    scope.agentParty,
    "preflight agent Party",
  );
  const payerParty = requiredIdentity(
    scope.payerParty,
    "preflight payer Party",
  );
  const subject = requiredIdentity(
    snapshot.authenticatedSubject,
    "preflight authenticated subject",
  );
  if (agentParty === payerParty) {
    throw new Error("preflight payer and agent must be distinct");
  }
  if (snapshot.agentParty !== agentParty) {
    throw new Error("preflight agent Party does not match scope");
  }
  const broadAuthorityPresent = snapshot.rights.some(({ kind }) =>
    [
      "participant-admin",
      "identity-provider-admin",
      "execute-any",
      "read-any",
    ].includes(kind),
  );
  const agentActAsPresent = snapshot.rights.some(
    (right) =>
      (right.kind === "act-as" || right.kind === "execute-as") &&
      right.party === agentParty,
  );
  const payerAuthorityPresent =
    snapshot.rights.some(({ kind }) =>
      ["participant-admin", "identity-provider-admin", "execute-any"].includes(
        kind,
      ),
    ) ||
    snapshot.rights.some(
      (right) =>
        (right.kind === "act-as" || right.kind === "execute-as") &&
        right.party === payerParty,
    );
  const checks = Object.freeze({
    agentActAsPresent,
    agentPartyVisible: snapshot.agentPartyVisible,
    broadAuthorityAbsent: !broadAuthorityPresent,
    executeRouteReachable: snapshot.executeRouteReachable,
    externalPartyTopologySupported: snapshot.externalPartyTopologySupported,
    packageVisible: snapshot.packageVisible,
    payerActAsAbsent: !payerAuthorityPresent,
    preferredPackageConfirmed: snapshot.preferredPackageConfirmed,
    prepareRouteReachable: snapshot.prepareRouteReachable,
    synchronizerConfirmed: snapshot.synchronizerConfirmed,
  });
  const reasons: FiveNorthWalletPreflightReason[] = [];
  addReason(reasons, checks.agentActAsPresent, "AGENT_ACT_AS_MISSING");
  addReason(reasons, checks.agentPartyVisible, "AGENT_PARTY_UNAVAILABLE");
  addReason(reasons, checks.broadAuthorityAbsent, "BROAD_AUTHORITY_PRESENT");
  addReason(reasons, checks.executeRouteReachable, "EXECUTE_ROUTE_UNREACHABLE");
  addReason(
    reasons,
    checks.externalPartyTopologySupported,
    "EXTERNAL_PARTY_TOPOLOGY_UNSUPPORTED",
  );
  addReason(reasons, checks.payerActAsAbsent, "PAYER_AUTHORITY_PRESENT");
  addReason(
    reasons,
    checks.preferredPackageConfirmed,
    "PREFERRED_PACKAGE_UNCONFIRMED",
  );
  addReason(reasons, checks.prepareRouteReachable, "PREPARE_ROUTE_UNREACHABLE");
  addReason(reasons, checks.packageVisible, "SOTTO_PACKAGE_UNAVAILABLE");
  addReason(reasons, checks.synchronizerConfirmed, "SYNCHRONIZER_UNCONFIRMED");
  const frozenReasons = Object.freeze([...reasons].sort());
  return Object.freeze({
    checks,
    reasons: frozenReasons,
    subjectHash: `sha256:${createHash("sha256").update(subject).digest("hex")}`,
    verdict: frozenReasons.length === 0 ? "SUPPORTED" : "UNSUPPORTED",
    version: FIVE_NORTH_WALLET_PREFLIGHT_VERSION,
  });
}
