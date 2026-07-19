import {
  claimHumanPackagePreferenceObservation,
  createHumanPackagePreferenceObserver,
  type AuthenticatedHumanPackagePreference,
  type HumanPackagePreferenceReader,
} from "@sotto/x402-canton";
import type { SpikeConfig } from "./config.js";
import { buildFiveNorthHumanPackagePreferenceManifest } from "./five-north-package-preference-manifest.js";
import {
  buildFiveNorthHumanPackagePreferenceBody,
  parseFiveNorthHumanPackagePreferenceResponse,
} from "./five-north-human-package-preference-validation.js";
import { approveFiveNorthPrepareNetwork } from "./five-north-prepare-network.js";
import {
  parseFiveNorthJson,
  readFiveNorthResponse,
} from "./five-north-response.js";
import {
  createFiveNorthTokenProvider,
  readFiveNorthAccessTokenSubject,
} from "./five-north-token.js";
import type { PrepareOnlyHumanPackageSelectionScope } from "./prepare-only-human-purchase-types.js";

const PATH = "/v2/interactive-submission/preferred-packages";
const RESPONSE_LIMIT = 65_536;
const TIMEOUT_MS = 10_000;
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
type Options = Readonly<{
  fetcher?: Fetcher;
  signal: AbortSignal;
}>;

function active(scope: AbortSignal, operation?: AbortSignal): void {
  if (scope.aborted || operation?.aborted === true) {
    throw new Error("Five North human package preference cancelled");
  }
}

function createReader(
  candidateNetwork: SpikeConfig["network"],
  options: Options,
): HumanPackagePreferenceReader {
  const network = approveFiveNorthPrepareNetwork(candidateNetwork);
  const fetcher = options.fetcher ?? fetch;
  if (!(options.signal instanceof AbortSignal)) {
    throw new Error("Five North human package preference needs a signal");
  }
  const tokens = createFiveNorthTokenProvider(network, fetcher, options.signal);
  let authenticatedSubject: string | undefined;

  async function subject(operation?: AbortSignal): Promise<string> {
    active(options.signal, operation);
    const value = readFiveNorthAccessTokenSubject(await tokens.accessToken());
    active(options.signal, operation);
    authenticatedSubject ??= value;
    if (value !== authenticatedSubject) {
      throw new Error("Five North human package token subject changed");
    }
    return value;
  }

  return Object.freeze({
    readAuthenticatedSubject: async (readOptions) =>
      subject(readOptions?.signal),
    readPackageReferences: async (candidate, readOptions) => {
      const request = buildFiveNorthHumanPackagePreferenceBody(candidate);
      const operation = readOptions?.signal;
      const token = await tokens.accessToken();
      const tokenSubject = readFiveNorthAccessTokenSubject(token);
      authenticatedSubject ??= tokenSubject;
      if (tokenSubject !== authenticatedSubject) {
        throw new Error("Five North human package token subject changed");
      }
      active(options.signal, operation);
      let response: Response;
      try {
        response = await fetcher(`${network.ledgerUrl}${PATH}`, {
          body: request.body,
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          method: "POST",
          redirect: "error",
          signal: AbortSignal.any([
            options.signal,
            ...(operation === undefined ? [] : [operation]),
            AbortSignal.timeout(TIMEOUT_MS),
          ]),
        });
      } catch {
        active(options.signal, operation);
        throw new Error("Five North human package transport failed");
      }
      active(options.signal, operation);
      const mediaType = (response.headers.get("content-type") ?? "")
        .split(";", 1)[0]!
        .trim()
        .toLowerCase();
      if (mediaType !== "application/json" && !mediaType.endsWith("+json")) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error("Five North human package response is not JSON");
      }
      return parseFiveNorthHumanPackagePreferenceResponse(
        parseFiveNorthJson(
          await readFiveNorthResponse(response, RESPONSE_LIMIT),
          "Five North human package response",
        ),
        request.synchronizerId,
      );
    },
  });
}

export function createFiveNorthHumanPackageSelectionClaimer(
  network: SpikeConfig["network"],
  options: Options,
): (
  scope: PrepareOnlyHumanPackageSelectionScope,
) => Promise<AuthenticatedHumanPackagePreference> {
  const closure = buildFiveNorthHumanPackagePreferenceManifest();
  const observe = createHumanPackagePreferenceObserver(
    createReader(network, options),
  );
  return async (scope) => {
    if (!(scope.signal instanceof AbortSignal)) {
      throw new Error("Five North human package claim signal is invalid");
    }
    active(options.signal, scope.signal);
    const signal = AbortSignal.any([options.signal, scope.signal]);
    const candidate = Object.freeze({
      adminParty: scope.adminParty,
      challengeId: scope.challengeId,
      challengeObservedAt: scope.challengeObservedAt,
      closure,
      executeBefore: scope.executeBefore,
      providerParty: scope.providerParty,
      vettingValidAt: scope.executeBefore,
      walletPreflight: scope.walletPreflight,
    });
    const observation = await observe(candidate, { signal });
    active(options.signal, scope.signal);
    return claimHumanPackagePreferenceObservation(observation, candidate);
  };
}
