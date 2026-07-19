import {
  type BoundedPurchaseCommitmentInput,
  type PurchaseCapabilityObservation,
  type PurchaseCapabilitySnapshot,
} from "../src/index.js";
import {
  capturePurchaseCapabilityCreatedEventForTest,
  readPurchaseCapabilityObservation,
} from "../src/purchase-capability-observation.js";

function atomicToDecimal(value: string): string {
  const padded = value.padStart(11, "0");
  return `${padded.slice(0, -10)}.${padded.slice(-10)}`;
}

export function captureCapability(
  snapshot: PurchaseCapabilitySnapshot,
): PurchaseCapabilityObservation {
  return capturePurchaseCapabilityCreatedEventForTest(
    {
      nodeId: 0,
      contractId: snapshot.contractId,
      templateId: snapshot.templateId,
      contractKey: null,
      createArgument: {
        payer: snapshot.payerParty,
        agent: snapshot.agentParty,
        resourceBindingVersion: snapshot.resourceBindingVersion,
        allowedResourceHash: snapshot.resourceHash,
        allowedRecipient: snapshot.recipient,
        instrumentId: snapshot.instrument,
        perCallLimit: atomicToDecimal(snapshot.perCallLimitAtomic),
        remainingAllowance: atomicToDecimal(snapshot.remainingAllowanceAtomic),
        maximumTotalDebit: atomicToDecimal(snapshot.maximumTotalDebitAtomic),
        expiresAt: snapshot.expiresAt,
        revision: snapshot.revision,
        paused: snapshot.paused,
        transferFactoryCid: snapshot.transferFactoryContractId,
        expectedAdmin: snapshot.expectedAdmin,
      },
      createdEventBlob: "capability-created-event-blob",
      interfaceViews: [],
      witnessParties: [snapshot.payerParty, snapshot.agentParty],
      signatories: [snapshot.payerParty],
      observers: [snapshot.agentParty],
      createdAt: "2026-07-13T09:59:00.000000Z",
      packageName: "sotto-control",
    },
    42,
  );
}

export function replaceCapability(
  input: BoundedPurchaseCommitmentInput,
  mutate: (snapshot: PurchaseCapabilitySnapshot) => PurchaseCapabilitySnapshot,
): BoundedPurchaseCommitmentInput {
  const current = readPurchaseCapabilityObservation(input.capability).snapshot;
  return { ...input, capability: captureCapability(mutate(current)) };
}
