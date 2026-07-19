import { buildBoundedCapabilityBootstrap } from "@sotto/x402-canton";
import {
  startCapabilityWalletBootstrap,
  type CapabilityWalletBootstrapRunnerInput,
} from "./capability-wallet-bootstrap-runner.js";

export type FiveNorthWalletCapabilityApproval = Readonly<{
  agentParty: string;
  expiresAt: string;
  instrumentAdmin: string;
  payerParty: string;
  providerParty: string;
  resourceHash: `sha256:${string}`;
  synchronizerId: string;
  transferFactoryContractId: string;
}>;

export type FiveNorthWalletCapabilityBootstrapPorts = Omit<
  CapabilityWalletBootstrapRunnerInput,
  "request" | "sourceCommit" | "workspaceRoot"
> &
  Readonly<{ readAuthenticatedUserId: () => Promise<string> }>;

type Input = Readonly<{
  approval: FiveNorthWalletCapabilityApproval;
  ports: FiveNorthWalletCapabilityBootstrapPorts;
  sourceCommit: string;
  workspaceRoot: string;
}>;

type Runner<Result> = Readonly<{
  start: (input: CapabilityWalletBootstrapRunnerInput) => Promise<Result>;
}>;

export async function startFiveNorthWalletCapabilityBootstrap<
  Result = Awaited<ReturnType<typeof startCapabilityWalletBootstrap>>,
>(input: Input, dependencies?: Runner<Result>): Promise<Result> {
  const { readAuthenticatedUserId, ...ports } = input.ports;
  const userId = await readAuthenticatedUserId();
  const request = buildBoundedCapabilityBootstrap({
    agentParty: input.approval.agentParty,
    allowedRecipient: input.approval.providerParty,
    allowedResourceHash: input.approval.resourceHash,
    expiresAt: input.approval.expiresAt,
    instrument: { admin: input.approval.instrumentAdmin, id: "Amulet" },
    maximumTotalDebitAtomic: "3250000000",
    network: "canton:devnet",
    payerParty: input.approval.payerParty,
    perCallLimitAtomic: "2500000000",
    remainingAllowanceAtomic: "3250000000",
    synchronizerId: input.approval.synchronizerId,
    transferFactoryContractId: input.approval.transferFactoryContractId,
    userId,
  });
  const start =
    dependencies?.start ??
    (startCapabilityWalletBootstrap as Runner<Result>["start"]);
  return start({
    ...ports,
    request,
    sourceCommit: input.sourceCommit,
    workspaceRoot: input.workspaceRoot,
  });
}
