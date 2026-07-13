import type { PaymentAuthorization } from "@sotto/x402-canton";
import { createHash } from "node:crypto";

export type InstrumentId = Readonly<{ admin: string; id: string }>;
export type ScanContract = Readonly<{
  contract: {
    contract_id: string;
    created_event_blob: string;
    payload: Record<string, unknown>;
    template_id: string;
  };
  domain_id: string;
}>;

export type OpenMiningRound = ScanContract &
  Readonly<{
    contract: ScanContract["contract"] & {
      payload: {
        opensAt: string;
        round: { number: string };
        targetClosesAt: string;
      };
    };
  }>;

export type PayerHolding = Readonly<{
  amount: string;
  contractId: string;
  instrumentId: InstrumentId;
  owner: string;
}>;

type SettlementInput = Readonly<{
  amuletRules: ScanContract;
  authorization: PaymentAuthorization;
  now: Date;
  openMiningRounds: ReadonlyArray<OpenMiningRound>;
  payerHolding: PayerHolding;
  providerParty: string;
  userId: string;
}>;

function decimalToAtomic(value: string): bigint {
  const match = /^(0|[1-9]\d*)\.(\d{10})$/.exec(value);
  if (match === null) {
    throw new Error("Canton amount must have exactly 10 decimal places");
  }
  const whole = match[1];
  const fraction = match[2];
  if (whole === undefined || fraction === undefined) {
    throw new Error("Canton amount is malformed");
  }
  return BigInt(whole) * 10_000_000_000n + BigInt(fraction);
}

export function atomicToDecimal(value: string): string {
  if (!/^(?:0|[1-9]\d*)$/.test(value)) {
    throw new Error("Payment amount must be an atomic integer");
  }
  const padded = value.padStart(11, "0");
  return `${padded.slice(0, -10)}.${padded.slice(-10)}`;
}

function disclosed(contract: ScanContract) {
  return {
    contractId: contract.contract.contract_id,
    createdEventBlob: contract.contract.created_event_blob,
    synchronizerId: contract.domain_id,
    templateId: contract.contract.template_id,
  };
}

export function settlementCommandId(
  proof: Pick<PaymentAuthorization, "attemptId" | "requestCommitment">,
): string {
  const commitment = createHash("sha256")
    .update(
      JSON.stringify({
        version: "sotto-settlement-command-v1",
        attemptId: proof.attemptId,
        requestCommitment: proof.requestCommitment,
      }),
    )
    .digest("hex");
  return `sotto-settle-${commitment}`;
}

function selectOpenRound(
  rounds: ReadonlyArray<OpenMiningRound>,
  now: Date,
): OpenMiningRound {
  const current = rounds
    .filter(
      ({ contract }) =>
        Date.parse(contract.payload.opensAt) <= now.getTime() &&
        now.getTime() < Date.parse(contract.payload.targetClosesAt),
    )
    .toSorted(
      (left, right) =>
        Number(right.contract.payload.round.number) -
        Number(left.contract.payload.round.number),
    )[0];
  if (current === undefined) {
    throw new Error("No current open mining round is available");
  }
  return current;
}

export function buildSettlementRequest(input: SettlementInput) {
  const { authorization, payerHolding, providerParty } = input;
  const { requirement } = authorization;
  const dso = input.amuletRules.contract.payload.dso;
  if (
    requirement.extra.assetTransferMethod !== "amulet-rules-transfer" ||
    requirement.network !== "canton:devnet"
  ) {
    throw new Error("Settlement requires the Canton DevNet Amulet method");
  }
  if (
    requirement.payTo !== providerParty ||
    requirement.extra.feePayer !== authorization.payerParty
  ) {
    throw new Error("Settlement parties do not match the authorization");
  }
  if (
    payerHolding.owner !== authorization.payerParty ||
    payerHolding.instrumentId.admin !== dso ||
    payerHolding.instrumentId.admin !== requirement.extra.instrumentId.admin ||
    payerHolding.instrumentId.id !== requirement.extra.instrumentId.id
  ) {
    throw new Error("Settlement holding does not match the authorization");
  }
  if (
    input.amuletRules.domain_id !== requirement.extra.synchronizerId ||
    input.now.getTime() >= Date.parse(authorization.expiresAt)
  ) {
    throw new Error("Settlement synchronizer or expiry is invalid");
  }
  const amount = atomicToDecimal(requirement.amount);
  if (decimalToAtomic(payerHolding.amount) <= BigInt(requirement.amount)) {
    throw new Error("Payer holding cannot cover amount and fees");
  }
  const round = selectOpenRound(input.openMiningRounds, input.now);
  if (round.domain_id !== input.amuletRules.domain_id) {
    throw new Error("Open round is on a different synchronizer");
  }
  return {
    actAs: [authorization.payerParty, providerParty],
    readAs: [authorization.payerParty, providerParty],
    userId: input.userId,
    commandId: settlementCommandId(authorization),
    workflowId: "sotto-x402-settlement-v1",
    synchronizerId: requirement.extra.synchronizerId,
    commands: [
      {
        ExerciseCommand: {
          templateId: "#splice-amulet:Splice.AmuletRules:AmuletRules",
          contractId: input.amuletRules.contract.contract_id,
          choice: "AmuletRules_Transfer",
          choiceArgument: {
            transfer: {
              sender: authorization.payerParty,
              provider: providerParty,
              inputs: [{ tag: "InputAmulet", value: payerHolding.contractId }],
              outputs: [
                {
                  receiver: providerParty,
                  receiverFeeRatio: "0.0000000000",
                  amount,
                },
              ],
              beneficiaries: null,
            },
            context: {
              openMiningRound: round.contract.contract_id,
              issuingMiningRounds: [],
              validatorRights: [],
              featuredAppRight: null,
            },
            expectedDso: dso,
          },
        },
      },
    ],
    disclosedContracts: [disclosed(input.amuletRules), disclosed(round)],
  } as const;
}
