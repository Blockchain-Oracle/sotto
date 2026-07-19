import { randomUUID } from "node:crypto";
import {
  createEphemeralExternalPartyPreflightIdentity,
  type ExternalPartyPreflightIdentity,
} from "@sotto/capability-wallet";
import type { SpikeConfig } from "./config.js";
import { type FiveNorthCapabilityReadinessScope } from "./five-north-capability-readiness.js";
import { createFiveNorthCapabilityReadinessTransport } from "./five-north-capability-readiness-transport.js";
import {
  parseCapabilityAmuletRules,
  parseCapabilityPackagePresence,
  parsePreferredCapabilityPackage,
} from "./five-north-capability-readiness-validation.js";
import { SOTTO_CONTROL_PACKAGE_ID } from "@sotto/x402-canton";
import { createFiveNorthWalletPreflightHttp } from "./five-north-wallet-preflight-http.js";
import { isFiveNorthUnsupportedResponse } from "./five-north-response.js";
import type { FiveNorthTokenProvider } from "./five-north-token.js";
import { readFiveNorthAccessTokenSubject } from "./five-north-token.js";
import type { FiveNorthWalletPreflightSnapshot } from "./five-north-wallet-preflight.js";
import {
  parseAgentParty,
  parseAuthenticatedUser,
  parseConnectedSynchronizer,
  parseExternalPartyTopology,
  parseWalletRights,
  requireEphemeralPublicKey,
} from "./five-north-wallet-preflight-validation.js";

const PREPARE_PATH = "/v2/interactive-submission/prepare";
const EXECUTE_PATH = "/v2/interactive-submission/execute";
const GENERATE_TOPOLOGY_PATH = "/v2/parties/external/generate-topology";
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
type Readiness = Readonly<{
  packageVisible: boolean;
  preferredPackageConfirmed: boolean;
  synchronizerId?: string;
}>;
type ReadinessReader = (
  scope: FiveNorthCapabilityReadinessScope,
) => Promise<Readiness>;
type Options = Readonly<{
  createExternalPartyIdentity?: () => Promise<ExternalPartyPreflightIdentity>;
  fetcher?: Fetcher;
  readReadiness?: ReadinessReader;
  signal: AbortSignal;
  tokenProvider?: FiveNorthTokenProvider;
}>;

function createReadinessReader(
  network: SpikeConfig["network"],
  options: Options,
  tokenProvider: FiveNorthTokenProvider,
): ReadinessReader {
  if (options.readReadiness !== undefined) return options.readReadiness;
  const reader = createFiveNorthCapabilityReadinessTransport(network, {
    ...(options.fetcher === undefined ? {} : { fetcher: options.fetcher }),
    signal: options.signal,
    tokenProvider,
  });
  const optional = async (read: () => Promise<unknown>) => {
    try {
      return await read();
    } catch (error) {
      if (isFiveNorthUnsupportedResponse(error)) return undefined;
      throw error;
    }
  };
  return async (scope) => {
    const [rulesValue, packageValue] = await Promise.all([
      optional(() => reader.readAmuletRules()),
      optional(() => reader.readPackagePresence(SOTTO_CONTROL_PACKAGE_ID)),
    ]);
    const rules =
      rulesValue === undefined
        ? undefined
        : parseCapabilityAmuletRules(rulesValue);
    if (packageValue !== undefined) {
      parseCapabilityPackagePresence(packageValue);
    }
    let preferredPackageConfirmed = false;
    if (rules !== undefined) {
      const preferred = await optional(() =>
        reader.readPreferredSottoPackage(scope.payerParty, scope.agentParty),
      );
      if (preferred !== undefined) {
        parsePreferredCapabilityPackage(preferred, rules.synchronizerId);
        preferredPackageConfirmed = true;
      }
    }
    if (preferredPackageConfirmed && packageValue === undefined) {
      throw new Error("Five North package discovery is inconsistent");
    }
    return Object.freeze({
      packageVisible: packageValue !== undefined,
      preferredPackageConfirmed,
      ...(rules === undefined ? {} : { synchronizerId: rules.synchronizerId }),
    });
  };
}

export function createFiveNorthWalletPreflightTransport(
  network: SpikeConfig["network"],
  options: Options,
): (
  scope: FiveNorthCapabilityReadinessScope,
) => Promise<FiveNorthWalletPreflightSnapshot> {
  const createExternalPartyIdentity =
    options.createExternalPartyIdentity ??
    createEphemeralExternalPartyPreflightIdentity;
  const http = createFiveNorthWalletPreflightHttp(network, options);
  const readinessReader = createReadinessReader(
    network,
    options,
    http.tokenProvider,
  );
  return async (scope) => {
    const token = await http.tokenProvider.accessToken();
    const subject = readFiveNorthAccessTokenSubject(token);
    const [user, rights, agent, connected, prepare, execute, readiness] =
      await Promise.all([
        http.getJson("/v2/authenticated-user"),
        http.getJson(`/v2/users/${encodeURIComponent(subject)}/rights`),
        http.getJson(`/v2/parties/${encodeURIComponent(scope.agentParty)}`),
        http.getJson("/v2/state/connected-synchronizers"),
        http.headRoute(PREPARE_PATH),
        http.headRoute(EXECUTE_PATH),
        readinessReader(scope),
      ]);
    const authenticatedSubject = parseAuthenticatedUser(user, subject);
    const synchronizerConfirmed =
      readiness.synchronizerId !== undefined &&
      parseConnectedSynchronizer(connected, readiness.synchronizerId);
    const identity = await createExternalPartyIdentity();
    const publicKey = requireEphemeralPublicKey(identity.publicKey);
    let externalPartyTopologySupported = false;
    if (readiness.synchronizerId !== undefined) {
      try {
        const topology = parseExternalPartyTopology(
          await http.postJson(GENERATE_TOPOLOGY_PATH, {
            synchronizer: readiness.synchronizerId,
            partyHint: `sotto-wallet-preflight-${randomUUID()}`,
            publicKey: {
              format: "CRYPTO_KEY_FORMAT_RAW",
              keyData: publicKey,
              keySpec: "SIGNING_KEY_SPEC_EC_CURVE25519",
            },
            localParticipantObservationOnly: false,
            confirmationThreshold: 1,
            otherConfirmingParticipantUids: [],
            observingParticipantUids: [],
          }),
          identity.fingerprint,
        );
        if (
          (await identity.hashTopology(topology.topologyTransactions)) !==
          topology.multiHash
        ) {
          throw new Error("external Party topology hash mismatch");
        }
        externalPartyTopologySupported = true;
      } catch (error) {
        if (!isFiveNorthUnsupportedResponse(error)) throw error;
      }
    }
    return Object.freeze({
      agentParty: scope.agentParty,
      agentPartyVisible: parseAgentParty(agent, scope.agentParty),
      authenticatedSubject,
      executeRouteReachable: execute,
      externalPartyTopologySupported,
      packageVisible: readiness.packageVisible,
      preferredPackageConfirmed: readiness.preferredPackageConfirmed,
      prepareRouteReachable: prepare,
      rights: parseWalletRights(rights),
      synchronizerConfirmed,
    });
  };
}
