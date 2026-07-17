import {
  createHumanPayerIdentityObserver,
  createHumanWalletConnectorPreflight,
  FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID,
  HUMAN_PURCHASE_APPROVAL_VERSION,
  HUMAN_WALLET_CAPABILITIES_VERSION,
  type AuthenticatedHumanWalletConnectorPreflight,
  type HumanWalletConnector,
} from "@sotto/x402-canton";
import type { SpikeConfig } from "./config.js";
import { withFiveNorthHumanWalletDeadline } from "./five-north-human-wallet-deadline.js";
import { approveFiveNorthPrepareNetwork } from "./five-north-prepare-network.js";
import {
  createFiveNorthWalletPreflightHttp,
  type FiveNorthWalletPreflightHttp,
} from "./five-north-wallet-preflight-http.js";
import {
  readFiveNorthHumanWalletProfile,
  type FiveNorthHumanWalletProfile,
} from "./five-north-human-wallet-profile.js";
import { readFiveNorthAccessTokenSubject } from "./five-north-token.js";
import {
  parseAgentParty,
  parseAuthenticatedUser,
  parseConnectedSynchronizer,
} from "./five-north-wallet-preflight-validation.js";

const CONNECTOR_ID = "wallet-sdk-reference";
const CONNECTOR_ORIGIN = "wallet://sotto-reference";
const FIVE_NORTH_NETWORK = "canton:devnet" as const;

type Input = Readonly<{
  keyFile: string;
  network: SpikeConfig["network"];
  signal: AbortSignal;
  workspaceRoot: string;
}>;

type Dependencies = Readonly<{
  createHttp: (
    network: SpikeConfig["network"],
    options: Readonly<{ signal: AbortSignal }>,
  ) => FiveNorthWalletPreflightHttp;
  readProfile: typeof readFiveNorthHumanWalletProfile;
}>;

function active(signal: unknown): asserts signal is AbortSignal {
  if (!(signal instanceof AbortSignal)) {
    throw new Error("Five North human wallet signal is invalid");
  }
  if (signal.aborted) throw new Error("Five North human wallet cancelled");
}

function capabilities(profile: FiveNorthHumanWalletProfile) {
  return Object.freeze({
    version: HUMAN_WALLET_CAPABILITIES_VERSION,
    approvalVersions: Object.freeze([HUMAN_PURCHASE_APPROVAL_VERSION]),
    connectorId: CONNECTOR_ID,
    connectorKind: "wallet-sdk" as const,
    explicitApproval: true as const,
    hashingSchemeVersions: Object.freeze(["HASHING_SCHEME_VERSION_V2"]),
    networks: Object.freeze([FIVE_NORTH_NETWORK]),
    origin: CONNECTOR_ORIGIN,
    packageIds: Object.freeze([FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID]),
    payerParty: profile.party,
    preparedTransactionSigning: true as const,
    signingKey: Object.freeze({
      fingerprint: profile.fingerprint,
      publicKeyFormat: profile.publicKeyFormat,
      purpose: "SIGNING" as const,
      signatureFormat: "SIGNATURE_FORMAT_CONCAT" as const,
      signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519" as const,
    }),
    synchronizerIds: Object.freeze([profile.synchronizerId]),
  });
}

export function createFiveNorthReadOnlyHumanWalletConnector(
  profile: FiveNorthHumanWalletProfile,
): HumanWalletConnector {
  const discovered = capabilities(profile);
  return Object.freeze({
    discover: async ({ signal }) => {
      active(signal);
      return discovered;
    },
    requestApproval: async (_request, { signal }) => {
      active(signal);
      throw new Error("read-only human wallet cannot request approval");
    },
  });
}

function payerIdentityReader(
  http: FiveNorthWalletPreflightHttp,
  profile: FiveNorthHumanWalletProfile,
) {
  return Object.freeze({
    readAuthenticatedSubject: async (options?: { signal: AbortSignal }) => {
      active(options?.signal);
      const tokenSubject = readFiveNorthAccessTokenSubject(
        await http.tokenProvider.accessToken(),
      );
      active(options.signal);
      const user = await http.getJson("/v2/authenticated-user", options.signal);
      active(options.signal);
      return parseAuthenticatedUser(user, tokenSubject);
    },
    readPayerIdentity: async (options?: { signal: AbortSignal }) => {
      active(options?.signal);
      const [party, connected] = await Promise.all([
        http.getJson(
          `/v2/parties/${encodeURIComponent(profile.party)}`,
          options.signal,
        ),
        http.getJson("/v2/state/connected-synchronizers", options.signal),
      ]);
      active(options.signal);
      if (!parseAgentParty(party, profile.party)) {
        throw new Error("Five North human payer Party is not visible");
      }
      if (!parseConnectedSynchronizer(connected, profile.synchronizerId)) {
        throw new Error("Five North human payer synchronizer is not connected");
      }
      return Object.freeze({
        keyPurpose: "SIGNING",
        network: FIVE_NORTH_NETWORK,
        party: profile.party,
        publicKeyFormat: profile.publicKeyFormat,
        publicKeyFingerprint: profile.fingerprint,
        signatureFormat: "SIGNATURE_FORMAT_CONCAT",
        signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519",
        synchronizerId: profile.synchronizerId,
        topologyHash: profile.topologyHash,
      });
    },
  });
}

export async function createFiveNorthReferenceHumanWalletPreflight(
  input: Input,
  dependencies: Dependencies = {
    createHttp: createFiveNorthWalletPreflightHttp,
    readProfile: readFiveNorthHumanWalletProfile,
  },
): Promise<AuthenticatedHumanWalletConnectorPreflight> {
  return await withFiveNorthHumanWalletDeadline(
    input.signal,
    async (signal) => {
      const network = approveFiveNorthPrepareNetwork(input.network);
      const profile = await dependencies.readProfile({
        keyFile: input.keyFile,
        signal,
        workspaceRoot: input.workspaceRoot,
      });
      active(signal);
      const http = dependencies.createHttp(network, { signal });
      const connector = createFiveNorthReadOnlyHumanWalletConnector(profile);
      const result = await createHumanWalletConnectorPreflight(
        {
          connector,
          connectorId: CONNECTOR_ID,
          connectorKind: "wallet-sdk",
          connectorOrigin: CONNECTOR_ORIGIN,
          expectedPackageId: FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID,
          observePayerIdentity: createHumanPayerIdentityObserver(
            payerIdentityReader(http, profile),
          ),
        },
        { signal },
      );
      active(signal);
      if (result.outcome !== "compatible") {
        throw new Error(`Five North human wallet is ${result.reason}`);
      }
      return result;
    },
  );
}
