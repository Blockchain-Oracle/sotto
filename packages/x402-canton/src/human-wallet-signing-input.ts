import type {
  HumanWalletSigningDependencies,
  HumanWalletSigningSessionInput,
  HumanWalletSigningSessionOptions,
} from "./human-wallet-signing-types.js";
import { MAX_HUMAN_WALLET_SIGNING_SESSION_MS } from "./human-wallet-signing-types.js";
import {
  exactWalletDataRecord,
  optionalWalletDataRecord,
} from "./wallet-data-record.js";

export type ValidatedHumanWalletSigningInput = Readonly<{
  input: HumanWalletSigningSessionInput;
  onApprovalRequested?: NonNullable<
    HumanWalletSigningSessionOptions["onApprovalRequested"]
  >;
  resolveRegisteredPublicKey: HumanWalletSigningDependencies["resolveRegisteredPublicKey"];
  signal?: AbortSignal;
  timeoutMilliseconds: number;
}>;

export function validateHumanWalletSigningInput(
  candidateInput: HumanWalletSigningSessionInput,
  candidateDependencies: HumanWalletSigningDependencies,
  candidateOptions: HumanWalletSigningSessionOptions,
): ValidatedHumanWalletSigningInput {
  const input = exactWalletDataRecord(
    candidateInput,
    ["preflight", "prepared"],
    "human wallet signing input",
  );
  const dependencies = exactWalletDataRecord(
    candidateDependencies,
    ["resolveRegisteredPublicKey"],
    "human wallet signing dependencies",
  );
  const options = optionalWalletDataRecord(
    candidateOptions,
    ["onApprovalRequested", "signal", "timeoutMilliseconds"],
    "human wallet signing options",
  );
  const resolveRegisteredPublicKey = dependencies.resolveRegisteredPublicKey;
  const onApprovalRequested = options.onApprovalRequested;
  const signal = options.signal;
  const timeoutMilliseconds =
    options.timeoutMilliseconds ?? MAX_HUMAN_WALLET_SIGNING_SESSION_MS;
  if (typeof resolveRegisteredPublicKey !== "function") {
    throw new Error("human wallet registered public-key resolver is required");
  }
  if (
    onApprovalRequested !== undefined &&
    typeof onApprovalRequested !== "function"
  ) {
    throw new Error("human wallet approval callback is invalid");
  }
  if (signal !== undefined && !(signal instanceof AbortSignal)) {
    throw new Error("human wallet signing signal is invalid");
  }
  if (
    !Number.isSafeInteger(timeoutMilliseconds) ||
    (timeoutMilliseconds as number) < 1 ||
    (timeoutMilliseconds as number) > MAX_HUMAN_WALLET_SIGNING_SESSION_MS
  ) {
    throw new Error("human wallet signing timeout is invalid");
  }
  const dependencyTarget = candidateDependencies as object;
  const optionsTarget = candidateOptions as object;
  return Object.freeze({
    input: Object.freeze({
      preflight: input.preflight,
      prepared: input.prepared,
    }) as HumanWalletSigningSessionInput,
    ...(onApprovalRequested === undefined
      ? {}
      : {
          onApprovalRequested: (
            started: Parameters<
              NonNullable<
                HumanWalletSigningSessionOptions["onApprovalRequested"]
              >
            >[0],
          ) =>
            Reflect.apply(onApprovalRequested, optionsTarget, [
              started,
            ]) as Promise<void>,
        }),
    resolveRegisteredPublicKey: (query, callOptions) =>
      Reflect.apply(resolveRegisteredPublicKey, dependencyTarget, [
        query,
        callOptions,
      ]) as Promise<unknown>,
    ...(signal === undefined ? {} : { signal }),
    timeoutMilliseconds: timeoutMilliseconds as number,
  });
}
