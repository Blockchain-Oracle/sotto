import {
  evaluateFiveNorthWalletPreflight,
  type FiveNorthWalletPreflightResult,
  type FiveNorthWalletPreflightScope,
  type FiveNorthWalletPreflightSnapshot,
} from "./five-north-wallet-preflight.js";
import { writeFiveNorthWalletPreflightReport } from "./five-north-wallet-preflight-report.js";

type Input = FiveNorthWalletPreflightScope &
  Readonly<{
    collect: (
      scope: FiveNorthWalletPreflightScope,
    ) => Promise<FiveNorthWalletPreflightSnapshot>;
    sourceCommit: string;
    workspaceRoot: string;
  }>;

export type FiveNorthWalletPreflightRun = Readonly<{
  reportPath: string;
  result: FiveNorthWalletPreflightResult;
}>;

export async function runFiveNorthWalletPreflight(
  input: Input,
): Promise<FiveNorthWalletPreflightRun> {
  const scope = Object.freeze({
    agentParty: input.agentParty,
    payerParty: input.payerParty,
  });
  const result = evaluateFiveNorthWalletPreflight(
    await input.collect(scope),
    scope,
  );
  const reportPath = await writeFiveNorthWalletPreflightReport({
    observedAt: new Date().toISOString(),
    result,
    sourceCommit: input.sourceCommit,
    workspaceRoot: input.workspaceRoot,
  });
  return Object.freeze({ reportPath, result });
}
