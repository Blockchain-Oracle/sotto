type Mutation = readonly [string, readonly (string | number)[], unknown];

const SEND = ["transaction", "events", 0, "ExercisedEvent"] as const;
const CHOICE = [...SEND, "choiceArgument"] as const;
const RESULT = [...SEND, "exerciseResult"] as const;
const HOLDING = ["transaction", "events", 1, "CreatedEvent"] as const;
const HOLDING_AMOUNT = [...HOLDING, "createArgument", "amount"] as const;

export const HUMAN_PROVIDER_SETTLEMENT_MUTATIONS: readonly Mutation[] = [
  ["update", ["transaction", "updateId"], `1220${"d".repeat(64)}`],
  ["synchronizer", ["transaction", "synchronizerId"], "wrong"],
  ["negative offset", ["transaction", "offset"], -1],
  ["fractional offset", ["transaction", "offset"], 42.5],
  ["choice", [...SEND, "choice"], "Archive"],
  ["payer", [...SEND, "actingParties"], ["wrong"]],
  ["extra acting party", [...SEND, "actingParties"], ["payer", "other"]],
  ["consuming send", [...SEND, "consuming"], true],
  ["preapproval", [...SEND, "contractId"], "wrong"],
  ["package", [...SEND, "templateId"], "wrong"],
  ["amount", [...CHOICE, "amount"], "0.2400000000"],
  ["sender", [...CHOICE, "sender"], "wrong"],
  ["description", [...CHOICE, "description"], "unexpected"],
  ["input tag", [...CHOICE, "inputs", 0, "tag"], "wrong"],
  ["input", [...CHOICE, "inputs", 0, "value"], "wrong"],
  ["context", [...CHOICE, "context", "featuredAppRight"], "wrong"],
  [
    "metadata",
    [...CHOICE, "meta", "values", "sotto-x402/v1/challenge-id"],
    `sha256:${"f".repeat(64)}`,
  ],
  ["result tag", [...RESULT, "result", "createdAmulets", 0, "tag"], "wrong"],
  [
    "result sender",
    [...RESULT, "meta", "values", "splice.lfdecentralizedtrust.org/sender"],
    "wrong",
  ],
  [
    "result kind",
    [...RESULT, "meta", "values", "splice.lfdecentralizedtrust.org/tx-kind"],
    "wrong",
  ],
  ["holding template", [...HOLDING, "templateId"], "wrong"],
  ["holding owner", [...HOLDING, "createArgument", "owner"], "wrong"],
  ["holding DSO", [...HOLDING, "createArgument", "dso"], "wrong"],
  ["holding amount", [...HOLDING_AMOUNT, "initialAmount"], "0.2400000000"],
  ["holding round", [...HOLDING_AMOUNT, "createdAt", "number"], "05"],
  ["holding rate", [...HOLDING_AMOUNT, "ratePerRound", "rate"], "0.0001"],
  [
    "holding link",
    [...RESULT, "result", "createdAmulets", 0, "value"],
    "wrong",
  ],
];
