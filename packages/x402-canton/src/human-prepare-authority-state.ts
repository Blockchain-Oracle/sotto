import type {
  AuthenticatedHumanPrepareAuthorityPlaintext,
  HumanPrepareAuthorityPayload,
} from "./human-prepare-authority-types.js";

export type HumanPrepareAuthorityPlaintextState = {
  claimed: boolean;
  payload: HumanPrepareAuthorityPayload;
  plaintextSha256: `sha256:${string}`;
};

const states = new WeakMap<object, HumanPrepareAuthorityPlaintextState>();

export function readHumanPrepareAuthorityPlaintextState(
  candidate: unknown,
): HumanPrepareAuthorityPlaintextState {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("human prepare authority plaintext is not authenticated");
  }
  const state = states.get(candidate);
  if (state === undefined) {
    throw new Error("human prepare authority plaintext is not authenticated");
  }
  return state;
}

export function registerHumanPrepareAuthorityPlaintext(
  handle: AuthenticatedHumanPrepareAuthorityPlaintext,
  state: HumanPrepareAuthorityPlaintextState,
): void {
  states.set(handle, state);
}

export function prepareHumanPrepareAuthorityPlaintextClaim(
  candidate: unknown,
): Readonly<{
  payload: HumanPrepareAuthorityPayload;
  commit: () => void;
}> {
  const state = readHumanPrepareAuthorityPlaintextState(candidate);
  if (state.claimed) {
    throw new Error("human prepare authority plaintext is already claimed");
  }
  return Object.freeze({
    payload: state.payload,
    commit: () => {
      if (state.claimed) {
        throw new Error("human prepare authority plaintext is already claimed");
      }
      state.claimed = true;
    },
  });
}
