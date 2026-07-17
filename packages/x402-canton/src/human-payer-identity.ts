import { createHash, randomBytes } from "node:crypto";
import type {
  WalletPublicKeyFormat,
  WalletSignatureFormat,
  WalletSigningAlgorithm,
} from "./wallet-connector-types.js";
import { identifier } from "./purchase-commitment-primitives.js";
import {
  parseHumanPayerIdentity,
  validateHumanPayerIdentityReader,
} from "./human-payer-identity-validation.js";
import {
  requireHumanObservationActive,
  withHumanObservationDeadline,
  type HumanObservationOptions,
  type HumanObservationReadOptions,
} from "./human-observation-deadline.js";

export const HUMAN_PAYER_IDENTITY_VERSION =
  "sotto-human-payer-identity-v1" as const;
export const MAX_HUMAN_PAYER_IDENTITY_ACQUISITION_MS = 10_000;
export const MAX_HUMAN_PAYER_IDENTITY_AGE_MS = 60_000;
const CLOCK_ROLLBACK_TOLERANCE_MS = 5_000;

export type HumanPayerIdentityReader = Readonly<{
  readAuthenticatedSubject: (
    options?: HumanObservationReadOptions,
  ) => Promise<unknown>;
  readPayerIdentity: (
    options?: HumanObservationReadOptions,
  ) => Promise<unknown>;
}>;

export type HumanPayerIdentityObservationOptions = HumanObservationOptions;

export type HumanPayerIdentityObservation = Readonly<{
  observationId: `sha256:${string}`;
  observedAt: string;
}>;

export type AuthenticatedHumanPayerIdentity = Readonly<{
  acquiredAt: string;
  keyPurpose: "SIGNING";
  network: `canton:${string}`;
  party: string;
  publicKeyFormat: WalletPublicKeyFormat;
  publicKeyFingerprint: `1220${string}`;
  signatureFormat: WalletSignatureFormat;
  signingAlgorithm: WalletSigningAlgorithm;
  subjectHash: `sha256:${string}`;
  synchronizerId: string;
  topologyHash: string;
  version: typeof HUMAN_PAYER_IDENTITY_VERSION;
}>;

type ObservationState = {
  acquisitionStartedAt: number;
  capturedAt: number;
  claimed: boolean;
  identity: AuthenticatedHumanPayerIdentity;
};

const observations = new WeakMap<object, ObservationState>();
const authenticatedIdentities = new WeakMap<object, ObservationState>();

async function readUpstream(
  phase: "subject" | "topology",
  read: () => Promise<unknown>,
): Promise<unknown> {
  try {
    return await read();
  } catch {
    throw new Error(`human payer identity ${phase} read failed`);
  }
}

function requireFresh(state: ObservationState, now = Date.now()): void {
  if (now - state.capturedAt < -CLOCK_ROLLBACK_TOLERANCE_MS) {
    throw new Error("human payer identity clock moved backwards");
  }
  if (
    state.capturedAt - state.acquisitionStartedAt >
      MAX_HUMAN_PAYER_IDENTITY_ACQUISITION_MS ||
    now - state.acquisitionStartedAt > MAX_HUMAN_PAYER_IDENTITY_AGE_MS
  ) {
    throw new Error("human payer identity is stale");
  }
}

export function createHumanPayerIdentityObserver(
  candidate: HumanPayerIdentityReader,
): (
  options?: HumanPayerIdentityObservationOptions,
) => Promise<HumanPayerIdentityObservation> {
  const source = validateHumanPayerIdentityReader(candidate);
  return async (options = {}) =>
    await withHumanObservationDeadline(
      "human payer identity",
      MAX_HUMAN_PAYER_IDENTITY_ACQUISITION_MS,
      options,
      async (signal) => {
        const readOptions = Object.freeze({ signal });
        const acquisitionStartedAt = Date.now();
        const initialSubject = identifier(
          await readUpstream("subject", () =>
            source.readAuthenticatedSubject(readOptions),
          ),
          "human payer authenticated subject",
          256,
        );
        requireHumanObservationActive(signal, "human payer identity");
        const candidateIdentity = await readUpstream("topology", () =>
          source.readPayerIdentity(readOptions),
        );
        requireHumanObservationActive(signal, "human payer identity");
        const finalSubject = identifier(
          await readUpstream("subject", () =>
            source.readAuthenticatedSubject(readOptions),
          ),
          "human payer authenticated subject",
          256,
        );
        requireHumanObservationActive(signal, "human payer identity");
        if (initialSubject !== finalSubject) {
          throw new Error("human payer authenticated subject changed");
        }
        const capturedAt = Date.now();
        const acquiredAt = new Date(capturedAt).toISOString();
        const identity = parseHumanPayerIdentity(
          candidateIdentity,
          `sha256:${createHash("sha256").update(initialSubject).digest("hex")}`,
          acquiredAt,
        );
        const observation = Object.freeze({
          observationId: `sha256:${randomBytes(32).toString("hex")}` as const,
          observedAt: acquiredAt,
        });
        const state = {
          acquisitionStartedAt,
          capturedAt,
          claimed: false,
          identity,
        };
        requireFresh(state);
        observations.set(observation, state);
        return observation;
      },
    );
}

export function claimHumanPayerIdentity(
  candidate: unknown,
): AuthenticatedHumanPayerIdentity {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("human payer identity observation is not authenticated");
  }
  const state = observations.get(candidate);
  if (state === undefined) {
    throw new Error("human payer identity observation is not authenticated");
  }
  requireFresh(state);
  if (state.claimed) throw new Error("human payer identity is already claimed");
  state.claimed = true;
  authenticatedIdentities.set(state.identity, state);
  return state.identity;
}

/** @internal Human purchase and command authority only. */
export function readAuthenticatedHumanPayerIdentityAt(
  candidate: unknown,
  now: number,
): AuthenticatedHumanPayerIdentity {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("human payer identity is not authenticated");
  }
  const state = authenticatedIdentities.get(candidate);
  if (state === undefined) {
    throw new Error("human payer identity is not authenticated");
  }
  requireFresh(state, now);
  return state.identity;
}

export function readAuthenticatedHumanPayerIdentity(
  candidate: unknown,
): AuthenticatedHumanPayerIdentity {
  return readAuthenticatedHumanPayerIdentityAt(candidate, Date.now());
}
