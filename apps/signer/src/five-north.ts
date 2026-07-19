import {
  runFiveNorthExternalPayerCli,
  runFiveNorthExternalPayerTapCli,
} from "@sotto/capability-wallet";
import type { SignerFiveNorthEnvironment } from "./env.js";

export type FiveNorthOnboardInput = Readonly<{
  expectedFingerprint: `1220${string}`;
  keyFile: string;
  partyHint: string;
  signal: AbortSignal;
}>;

export type FiveNorthOnboardResult = Readonly<{
  partyId: string;
  synchronizerId: string;
}>;

export type FiveNorthTapInput = Readonly<{
  expectedFingerprint: `1220${string}`;
  keyFile: string;
  payerParty: string;
  signal: AbortSignal;
}>;

export type FiveNorthTapResult = Readonly<{
  amount: string;
  submissionId: string;
  updateId: string;
}>;

/**
 * The live-operation boundary. Real Five North calls only happen through this
 * interface; unit tests inject a fake and never reach DevNet.
 */
export type FiveNorthRunner = Readonly<{
  onboard: (input: FiveNorthOnboardInput) => Promise<FiveNorthOnboardResult>;
  tap: (input: FiveNorthTapInput) => Promise<FiveNorthTapResult>;
}>;

const IDENTIFIER = /^[\x21-\x7e]{1,512}$/u;

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null) {
    throw new Error("Five North result shape is invalid");
  }
  return value as Record<string, unknown>;
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new Error(`Five North ${label} is invalid`);
  }
  return value;
}

export function createLiveFiveNorthRunner(
  fiveNorth: SignerFiveNorthEnvironment,
): FiveNorthRunner {
  const onboard = async (
    input: FiveNorthOnboardInput,
  ): Promise<FiveNorthOnboardResult> => {
    const result = await runFiveNorthExternalPayerCli({
      arguments: [
        "--live-onboard",
        "--expected-fingerprint",
        input.expectedFingerprint,
        "--key-file",
        input.keyFile,
        "--party-hint",
        input.partyHint,
        "--synchronizer-id",
        fiveNorth.synchronizerId,
      ],
      environment: fiveNorth.environment,
      signal: input.signal,
    });
    if (result.mode !== "live" || result.mutationSubmitted !== true) {
      throw new Error("Five North onboarding did not report live submission");
    }
    return Object.freeze({
      partyId: identifier(result.proposedPartyId, "party ID"),
      synchronizerId: fiveNorth.synchronizerId,
    });
  };

  const tap = async (input: FiveNorthTapInput): Promise<FiveNorthTapResult> => {
    const result = record(
      await runFiveNorthExternalPayerTapCli({
        arguments: [
          "--expected-fingerprint",
          input.expectedFingerprint,
          "--key-file",
          input.keyFile,
          "--payer-party",
          input.payerParty,
          "--synchronizer-id",
          fiveNorth.synchronizerId,
        ],
        environment: fiveNorth.environment,
        signal: input.signal,
      }),
    );
    if (result.mutationSubmitted !== true) {
      throw new Error("Five North tap did not report live submission");
    }
    return Object.freeze({
      amount: identifier(result.amount, "tap amount"),
      submissionId: identifier(result.submissionId, "tap submission ID"),
      updateId: identifier(result.updateId, "tap update ID"),
    });
  };

  return Object.freeze({ onboard, tap });
}
