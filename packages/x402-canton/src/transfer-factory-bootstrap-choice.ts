import {
  atomic,
  atomicToDamlDecimal,
  canonicalTime,
  identifier,
} from "./purchase-commitment-primitives.js";
import {
  digestTransferFactoryChoiceArguments,
  type TransferFactoryChoiceArguments,
} from "./transfer-factory-choice.js";
import { MAX_PURCHASE_HOLDINGS } from "./purchase-holding-types.js";

type BootstrapProbeInput = Readonly<{
  amountAtomic: string;
  executeBefore: string;
  expectedAdmin: string;
  inputHoldingCids: readonly string[];
  payerParty: string;
  recipientParty: string;
  requestedAt: string;
}>;

function emptyMetadata() {
  return Object.freeze({ values: Object.freeze({}) });
}

export function buildTransferFactoryBootstrapProbe(
  input: BootstrapProbeInput,
): Readonly<{
  choiceArguments: TransferFactoryChoiceArguments;
  choiceArgumentsDigest: `sha256:${string}`;
}> {
  const requestedAt = canonicalTime(input.requestedAt, "probe requestedAt");
  const executeBefore = canonicalTime(
    input.executeBefore,
    "probe executeBefore",
  );
  if (executeBefore <= requestedAt) {
    throw new Error("probe execution window is invalid");
  }
  if (
    !Array.isArray(input.inputHoldingCids) ||
    input.inputHoldingCids.length === 0 ||
    input.inputHoldingCids.length > MAX_PURCHASE_HOLDINGS
  ) {
    throw new Error("probe holding count is invalid");
  }
  const inputHoldingCids = input.inputHoldingCids.map((contractId) =>
    identifier(contractId, "probe holding contract ID"),
  );
  if (new Set(inputHoldingCids).size !== inputHoldingCids.length) {
    throw new Error("probe holding contract ID is duplicated");
  }
  const expectedAdmin = identifier(input.expectedAdmin, "probe admin");
  const amount = atomic(input.amountAtomic, "probe amount");
  if (amount <= 0n) throw new Error("probe amount must be positive");
  const choiceArguments = Object.freeze({
    expectedAdmin,
    transfer: Object.freeze({
      sender: identifier(input.payerParty, "probe payer Party"),
      receiver: identifier(input.recipientParty, "probe recipient Party"),
      amount: atomicToDamlDecimal(amount.toString(), "probe amount"),
      instrumentId: Object.freeze({ admin: expectedAdmin, id: "Amulet" }),
      requestedAt: input.requestedAt,
      executeBefore: input.executeBefore,
      inputHoldingCids: Object.freeze(inputHoldingCids),
      meta: emptyMetadata(),
    }),
    extraArgs: Object.freeze({
      context: emptyMetadata(),
      meta: emptyMetadata(),
    }),
  });
  return Object.freeze({
    choiceArguments,
    choiceArgumentsDigest:
      digestTransferFactoryChoiceArguments(choiceArguments),
  });
}
