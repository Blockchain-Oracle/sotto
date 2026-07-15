import { buildBoundedCapabilityBootstrap } from "@sotto/x402-canton";

export function bootstrapRequest() {
  return buildBoundedCapabilityBootstrap({
    agentParty: "sotto-agent::1220participant",
    allowedRecipient: "sotto-provider::1220participant",
    allowedResourceHash: `sha256:${"a".repeat(64)}`,
    expiresAt: "2026-07-13T20:30:00.000Z",
    instrument: { admin: "DSO::1220dso", id: "Amulet" },
    maximumTotalDebitAtomic: "3250000000",
    network: "canton:devnet",
    payerParty: "sotto-payer::1220participant",
    perCallLimitAtomic: "2500000000",
    remainingAllowanceAtomic: "3250000000",
    synchronizerId: "global-domain::1220synchronizer",
    transferFactoryContractId: "00factory",
    userId: "ledger-user-6",
  });
}

export function completionEntry(
  bootstrap: ReturnType<typeof bootstrapRequest>,
  input: Readonly<{
    actAs?: readonly string[];
    commandId?: string;
    offset?: number;
    statusCode?: number;
    updateId?: string;
    userId?: string;
  }> = {},
) {
  return {
    completionResponse: {
      Completion: {
        value: {
          actAs: input.actAs ?? [...bootstrap.actAs],
          commandId: input.commandId ?? bootstrap.commandId,
          offset: input.offset ?? 42,
          status: { code: input.statusCode ?? 0 },
          updateId: input.updateId ?? `1220${"b".repeat(64)}`,
          userId: input.userId ?? bootstrap.userId,
        },
      },
    },
  };
}

export function checkpointEntry(offset: number) {
  return {
    completionResponse: {
      OffsetCheckpoint: { value: { offset } },
    },
  };
}
