import {
  createFiveNorthTokenProvider,
  parseFiveNorthJson,
  readFiveNorthAccessTokenSubject,
  readFiveNorthResponse,
  type FiveNorthNetworkConfig,
} from "@sotto/canton-client";
import type { HumanPayerIdentityReader } from "@sotto/x402-canton";
import type { HumanPrepareAuthorityRestoreScope } from "@sotto/x402-canton/internal/human-prepare-authority-persistence";

const RESPONSE_LIMIT = 262_144;
const READ_TIMEOUT_MS = 10_000;

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type PayerIdentityReaderInput = Readonly<{
  network: FiveNorthNetworkConfig;
  scope: HumanPrepareAuthorityRestoreScope;
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
 * Fresh payer-identity reader for prepare-authority restoration. The
 * identity material itself is the keyring-authenticated persisted scope;
 * this reader re-proves liveness on the real ledger before restoring it:
 * the payer Party must be visible and its synchronizer connected.
 */
export function createFiveNorthPayerIdentityReader(
  input: PayerIdentityReaderInput,
): HumanPayerIdentityReader {
  const { network, scope } = input;
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
      const identity = scope.payerIdentity;
      const party = await ledgerJson(
        `/v2/parties/${encodeURIComponent(identity.party)}`,
        options?.signal,
        "Five North payer Party",
      );
      const details = entries(party, "partyDetails");
      if (
        details.length !== 1 ||
        fieldOf(details[0], "party") !== identity.party
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
      if (!synchronizers.includes(identity.synchronizerId)) {
        throw new Error("Five North payer synchronizer is not connected");
      }
      return Object.freeze({
        keyPurpose: identity.keyPurpose,
        network: identity.network,
        party: identity.party,
        publicKeyFormat: identity.publicKeyFormat,
        publicKeyFingerprint: identity.publicKeyFingerprint,
        signatureFormat: identity.signatureFormat,
        signingAlgorithm: identity.signingAlgorithm,
        synchronizerId: identity.synchronizerId,
        topologyHash: identity.topologyHash,
      });
    },
  });
}
