import type {
  Create,
  DamlTransaction,
} from "@canton-network/core-ledger-proto";
import type { HumanWalletApprovalRequest } from "@sotto/x402-canton";
import {
  referenceHumanWalletNonnegativeAtomic,
  referenceHumanWalletRound,
} from "./reference-human-wallet-numbers.js";
import type { ReferenceHumanWalletTransfer } from "./reference-human-wallet-transfer.js";
import {
  referenceHumanParties,
  referenceHumanRecord,
  referenceHumanScalar,
} from "./reference-human-wallet-values.js";

export type ReferenceHumanWalletHolding = Readonly<{
  contractId: string;
  initialAtomic: bigint;
  rateAtomic: bigint;
  round: bigint;
  roundZeroAtomic: bigint;
}>;

export type ReferenceHumanWalletHoldingEffects = Readonly<{
  change: readonly ReferenceHumanWalletHolding[];
  input: readonly ReferenceHumanWalletHolding[];
  receiver: readonly ReferenceHumanWalletHolding[];
}>;

function fail(label: string): never {
  throw new Error(`reference human wallet prepared ${label} does not match`);
}

export function readReferenceHumanWalletHolding(
  create: Create,
  request: HumanWalletApprovalRequest,
  allowedPackages: readonly string[],
  owner: string,
  label: string,
): ReferenceHumanWalletHolding {
  const approval = request.approval;
  const template = create.templateId;
  if (
    create.lfVersion !== "2.1" ||
    create.contractId === "" ||
    create.packageName !== "splice-amulet" ||
    template === undefined ||
    !allowedPackages.includes(template.packageId) ||
    template.moduleName !== "Splice.Amulet" ||
    template.entityName !== "Amulet"
  ) {
    fail(`${label} identity`);
  }
  const argument = referenceHumanRecord(
    create.argument,
    ["dso", "owner", "amount"],
    label,
    `${approval.selectedPackage.packageId}:Splice.Amulet:Amulet`,
  );
  referenceHumanScalar(
    argument.get("dso"),
    "party",
    approval.tokenFactory.expectedAdmin,
    `${label} admin`,
  );
  referenceHumanScalar(argument.get("owner"), "party", owner, `${label} owner`);
  const parties = [approval.tokenFactory.expectedAdmin, owner];
  referenceHumanParties(create.signatories, parties, `${label} signatory`);
  referenceHumanParties(create.stakeholders, parties, `${label} stakeholder`);
  const amount = referenceHumanRecord(
    argument.get("amount"),
    ["initialAmount", "createdAt", "ratePerRound"],
    `${label} amount`,
    `${approval.selectedPackage.packageId}:Splice.Fees:ExpiringAmount`,
  );
  const initialAtomic = referenceHumanWalletNonnegativeAtomic(
    amount.get("initialAmount"),
    `${label} initial amount`,
  );
  if (initialAtomic === 0n) fail(`${label} initial amount`);
  const round = referenceHumanWalletRound(
    amount.get("createdAt"),
    approval.selectedPackage.packageId,
    `${label} round`,
  );
  const rate = referenceHumanRecord(
    amount.get("ratePerRound"),
    ["rate"],
    `${label} rate`,
    `${approval.selectedPackage.packageId}:Splice.Fees:RatePerRound`,
  );
  const rateAtomic = referenceHumanWalletNonnegativeAtomic(
    rate.get("rate"),
    `${label} rate`,
  );
  return Object.freeze({
    contractId: create.contractId,
    initialAtomic,
    rateAtomic,
    round,
    roundZeroAtomic: initialAtomic + rateAtomic * round,
  });
}

function exactCreate(creates: readonly Create[], contractId: string): Create {
  const matches = creates.filter((create) => create.contractId === contractId);
  if (matches.length !== 1) fail("Holding output linkage");
  return matches[0]!;
}

export function readReferenceHumanWalletHoldingEffects(
  transaction: DamlTransaction,
  request: HumanWalletApprovalRequest,
  transfer: ReferenceHumanWalletTransfer,
  inputs: ReadonlyMap<string, ReferenceHumanWalletHolding>,
): ReferenceHumanWalletHoldingEffects {
  const creates = transaction.nodes.flatMap(({ versionedNode }) =>
    versionedNode.oneofKind === "v1" &&
    versionedNode.v1.nodeType.oneofKind === "create"
      ? [versionedNode.v1.nodeType.create]
      : [],
  );
  const outputIds = [...transfer.receiverIds, ...transfer.changeIds];
  if (
    new Set(outputIds).size !== outputIds.length ||
    creates.length !== outputIds.length ||
    [...inputs.keys()].some((contractId) => outputIds.includes(contractId))
  ) {
    fail("Holding output linkage");
  }
  const selected = [request.approval.selectedPackage.packageId];
  const read = (contractId: string, owner: string, label: string) =>
    readReferenceHumanWalletHolding(
      exactCreate(creates, contractId),
      request,
      selected,
      owner,
      label,
    );
  return Object.freeze({
    input: Object.freeze([...inputs.values()]),
    receiver: Object.freeze(
      transfer.receiverIds.map((contractId) =>
        read(contractId, request.approval.providerParty, "receiver Holding"),
      ),
    ),
    change: Object.freeze(
      transfer.changeIds.map((contractId) =>
        read(contractId, request.approval.payerParty, "change Holding"),
      ),
    ),
  });
}
