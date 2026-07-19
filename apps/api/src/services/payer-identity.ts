import {
  createFiveNorthTokenProvider,
  parseFiveNorthJson,
  readFiveNorthAccessTokenSubject,
  readFiveNorthResponse,
  type FiveNorthNetworkConfig,
} from "@sotto/canton-client";
import type { HumanPayerIdentityReader } from "@sotto/x402-canton";

const RESPONSE_LIMIT = 262_144;
const READ_TIMEOUT_MS = 10_000;

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Signing profile of the hosted wallet, served by the signer service from
 * its durable onboarding records. The API never sees key material — only
 * the public facts needed to assemble the payer identity.
 */
export type HostedWalletProfile = Readonly<{
  walletId: string;
  party: string;
  fingerprint: `1220${string}`;
  publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW";
  synchronizerId: string;
  topologyHash: string;
}>;

export type PayerIdentityReaderInput = Readonly<{
  network: FiveNorthNetworkConfig;
  profile: HostedWalletProfile;
  signal: AbortSignal;
  fetcher?: Fetcher;
}>;

function entries(value: unknown, field: string): ReadonlyArray<unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Five North payer ${field} response is invalid`);
  }
  const list = (value as Record<string, unknown>)[field];
  if (!Array.isArray(list) || list.length > 64) {
    throw new Error(`Five North payer ${field} response is invalid`);
  }
  return list;
}

function fieldOf(entry: unknown, field: string): unknown {
  if (typeof entry !== "object" || entry === null) {
    throw new Error(`Five North payer ${field} entry is invalid`);
  }
  return (entry as Record<string, unknown>)[field];
}

/**
 * Payer-identity reader for purchase initiation, mirroring the worker's
 * restore-time reader: the durable facts come from the signer profile and
 * this reader re-proves liveness on the real ledger — the payer Party must
 * be visible and its synchronizer connected before an intent is committed.
 */
export function createInitiationPayerIdentityReader(
  input: PayerIdentityReaderInput,
): HumanPayerIdentityReader {
  const { network, profile } = input;
  const fetcher = input.fetcher ?? fetch;
  const tokens = createFiveNorthTokenProvider(network, fetcher, input.signal);

  async function ledgerJson(
    path: string,
    signal: AbortSignal | undefined,
    label: string,
  ): Promise<unknown> {
    const token = await tokens.accessToken();
    const response = await fetcher(`${network.ledgerUrl}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      method: "GET",
      redirect: "error",
      signal: AbortSignal.any([
        input.signal,
        ...(signal === undefined ? [] : [signal]),
        AbortSignal.timeout(READ_TIMEOUT_MS),
      ]),
    });
    return parseFiveNorthJson(
      await readFiveNorthResponse(response, RESPONSE_LIMIT),
      label,
    );
  }

  return Object.freeze({
    readAuthenticatedSubject: async () =>
      readFiveNorthAccessTokenSubject(await tokens.accessToken()),
    readPayerIdentity: async (options) => {
      const party = await ledgerJson(
        `/v2/parties/${encodeURIComponent(profile.party)}`,
        options?.signal,
        "Five North payer Party",
      );
      const details = entries(party, "partyDetails");
      if (
        details.length !== 1 ||
        fieldOf(details[0], "party") !== profile.party
      ) {
        throw new Error("Five North payer Party is not visible");
      }
      const connected = await ledgerJson(
        "/v2/state/connected-synchronizers",
        options?.signal,
        "Five North connected synchronizers",
      );
      const synchronizers = entries(connected, "connectedSynchronizers").map(
        (entry) => fieldOf(entry, "synchronizerId"),
      );
      if (!synchronizers.includes(profile.synchronizerId)) {
        throw new Error("Five North payer synchronizer is not connected");
      }
      return Object.freeze({
        keyPurpose: "SIGNING",
        network: "canton:devnet",
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
