import { SDK } from "@canton-network/wallet-sdk";
import { APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID } from "@sotto/x402-canton";
import type { ExternalPayerEnvironment } from "./five-north-external-payer-sdk.js";
import { fiveNorthTapSdkConfig } from "./five-north-external-payer-tap-sdk.js";
import type {
  FiveNorthCapabilityRevokeDependencies,
  RevokeDispatch,
} from "./five-north-capability-revoke-validation.js";

type RevokePrepared = Readonly<{
  preparedPromise: Promise<unknown>;
  toJSON: () => Promise<Readonly<{ response: RevokeDispatch["response"] }>>;
}>;

type RevokeOnlineSdk = Readonly<{
  ledger: {
    execute: (signed: unknown, options: unknown) => Promise<unknown>;
    fromSignature: (response: unknown, signature: string) => unknown;
    prepare: (options: unknown) => RevokePrepared;
  };
}>;

export type RevokeSdkDependencies = Readonly<{
  createSdk: (
    config: ReturnType<typeof fiveNorthTapSdkConfig>,
  ) => Promise<RevokeOnlineSdk>;
}>;

function active(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("capability revoke cancelled");
}

async function awaitActive<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  active(signal);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      complete();
    };
    const onAbort = () =>
      finish(() => reject(new Error("capability revoke cancelled")));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) return onAbort();
    void promise.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

async function createOnlineSdk(
  config: ReturnType<typeof fiveNorthTapSdkConfig>,
): Promise<RevokeOnlineSdk> {
  return (await SDK.create(config as never)) as unknown as RevokeOnlineSdk;
}

export async function acquireFiveNorthCapabilityRevokePreparation(
  environment: ExternalPayerEnvironment,
  signal: AbortSignal,
  dependencies: RevokeSdkDependencies = { createSdk: createOnlineSdk },
): Promise<FiveNorthCapabilityRevokeDependencies["prepareRevoke"]> {
  const sdk = await awaitActive(
    dependencies.createSdk(fiveNorthTapSdkConfig(environment)),
    signal,
  );
  return async (input): Promise<RevokeDispatch> => {
    active(input.signal);
    const prepared = sdk.ledger.prepare({
      commandId: input.submissionId,
      commands: {
        ExerciseCommand: {
          choice: "Revoke",
          choiceArgument: {},
          contractId: input.capabilityContractId,
          templateId: APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID,
        },
      },
      partyId: input.payerParty,
      synchronizerId: input.synchronizerId,
    });
    const [rawResponse, json] = await awaitActive(
      Promise.all([prepared.preparedPromise, prepared.toJSON()]),
      input.signal,
    );
    return Object.freeze({
      execute: (signature: string) =>
        awaitActive(
          sdk.ledger.execute(sdk.ledger.fromSignature(rawResponse, signature), {
            partyId: input.payerParty,
            submissionId: input.submissionId,
          }),
          input.signal,
        ),
      response: json.response,
    });
  };
}
