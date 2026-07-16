import type { PreparedTransaction } from "@canton-network/core-ledger-proto";
import {
  preparedRecord,
  requirePreparedIdentifier,
  requirePreparedParties,
  requirePreparedScalar,
} from "./reference-wallet-prepared-values.js";
import type { FiveNorthExternalPayerTapInput } from "./five-north-external-payer-tap-types.js";
import { verifyFiveNorthExternalPayerTapResults } from "./five-north-external-payer-tap-results.js";
import { verifyFiveNorthExternalPayerTapHolding } from "./five-north-external-payer-tap-holding.js";

const PACKAGE_ID =
  "23f47481dab6b1ec01339d6e14494d85bb2844c25f45b26fc5c9ef4cd4942d1f";
const RULES = `${PACKAGE_ID}:Splice.AmuletRules:AmuletRules`;
const ROUND = `${PACKAGE_ID}:Splice.Round:OpenMiningRound`;
type Transaction = NonNullable<PreparedTransaction["transaction"]>;

function tapArgument(
  value: Parameters<typeof preparedRecord>[0],
  id: string,
  input: FiveNorthExternalPayerTapInput,
): string {
  const fields = preparedRecord(
    value,
    ["receiver", "amount", "openRound"],
    "tap argument",
    id,
  );
  requirePreparedScalar(
    fields.get("receiver"),
    "party",
    input.payerParty,
    "tap receiver",
  );
  requirePreparedScalar(
    fields.get("amount"),
    "numeric",
    input.amount,
    "tap amount",
  );
  const round = fields.get("openRound");
  if (
    round?.sum.oneofKind !== "contractId" ||
    !/^00[0-9a-z-]{1,510}$/u.test(round.sum.contractId)
  ) {
    throw new Error("reference wallet prepared tap round is invalid");
  }
  return round.sum.contractId;
}

function exactNodeMap(nodes: Transaction["nodes"]) {
  const map = new Map(nodes.map((node) => [node.nodeId, node]));
  if (map.size !== 4 || [...map.keys()].some((id) => id === "")) {
    throw new Error("external payer tap prepared nodes do not match");
  }
  return map;
}

function exercise(map: ReturnType<typeof exactNodeMap>, id: string) {
  const wrapper = map.get(id)?.versionedNode;
  if (
    wrapper?.oneofKind !== "v1" ||
    wrapper.v1.nodeType.oneofKind !== "exercise"
  ) {
    throw new Error("external payer tap exercise is absent");
  }
  return wrapper.v1.nodeType.exercise;
}

export function verifyFiveNorthExternalPayerTapEffects(
  transaction: Transaction,
  input: FiveNorthExternalPayerTapInput,
): Readonly<{
  dso: string;
  roundContractId: string;
  rulesContractId: string;
}> {
  const nodes = exactNodeMap(transaction.nodes);
  const root = exercise(nodes, "0");
  if (
    root.lfVersion !== "2.1" ||
    root.packageName !== "splice-amulet" ||
    root.choiceId !== "AmuletRules_DevNet_Tap" ||
    root.consuming ||
    root.children.length !== 1 ||
    root.choiceObservers.length !== 0 ||
    root.interfaceId !== undefined ||
    !/^00[0-9a-z-]{1,510}$/u.test(root.contractId)
  ) {
    throw new Error("external payer tap prepared root does not match");
  }
  requirePreparedIdentifier(root.templateId, RULES, "tap rules template");
  requirePreparedParties(root.actingParties, [input.payerParty], "tap actors");
  const dso = root.signatories[0];
  requirePreparedParties(root.signatories, [dso ?? ""], "tap signatories");
  requirePreparedParties(root.stakeholders, [dso ?? ""], "tap stakeholders");
  if (
    dso === undefined ||
    dso === input.payerParty ||
    !dso.startsWith("DSO::")
  ) {
    throw new Error("external payer tap DSO authority does not match");
  }
  const round = tapArgument(root.chosenValue, `${RULES}_DevNet_Tap`, input);
  const mint = exercise(nodes, root.children[0]!);
  if (
    mint.contractId !== root.contractId ||
    mint.lfVersion !== "2.1" ||
    mint.packageName !== "splice-amulet" ||
    mint.choiceId !== "AmuletRules_Mint" ||
    mint.consuming ||
    mint.children.length !== 2 ||
    new Set(mint.children).size !== 2 ||
    mint.choiceObservers.length !== 0 ||
    mint.interfaceId !== undefined
  ) {
    throw new Error("external payer tap mint does not match");
  }
  requirePreparedIdentifier(mint.templateId, RULES, "tap mint template");
  requirePreparedParties(
    mint.actingParties,
    [dso, input.payerParty],
    "tap mint actors",
  );
  requirePreparedParties(mint.signatories, [dso], "tap mint signatories");
  requirePreparedParties(mint.stakeholders, [dso], "tap mint stakeholders");
  if (tapArgument(mint.chosenValue, `${RULES}_Mint`, input) !== round) {
    throw new Error("external payer tap round does not match");
  }
  const children = mint.children.map((id) => nodes.get(id));
  const fetched = children.find(
    (node) =>
      node?.versionedNode.oneofKind === "v1" &&
      node.versionedNode.v1.nodeType.oneofKind === "fetch",
  );
  const created = children.find(
    (node) =>
      node?.versionedNode.oneofKind === "v1" &&
      node.versionedNode.v1.nodeType.oneofKind === "create",
  );
  if (
    fetched?.versionedNode.oneofKind !== "v1" ||
    fetched.versionedNode.v1.nodeType.oneofKind !== "fetch" ||
    created?.versionedNode.oneofKind !== "v1" ||
    created.versionedNode.v1.nodeType.oneofKind !== "create"
  ) {
    throw new Error("external payer tap effects do not match");
  }
  const fetch = fetched.versionedNode.v1.nodeType.fetch;
  const create = created.versionedNode.v1.nodeType.create;
  if (
    fetch.lfVersion !== "2.1" ||
    fetch.packageName !== "splice-amulet" ||
    fetch.interfaceId !== undefined ||
    create.lfVersion !== "2.1" ||
    create.packageName !== "splice-amulet" ||
    !/^00[0-9a-z-]{1,510}$/u.test(create.contractId)
  ) {
    throw new Error("external payer tap descendant identity does not match");
  }
  requirePreparedIdentifier(fetch.templateId, ROUND, "tap round template");
  requirePreparedParties(fetch.actingParties, [dso], "tap round actors");
  requirePreparedParties(fetch.signatories, [dso], "tap round signatories");
  requirePreparedParties(fetch.stakeholders, [dso], "tap round stakeholders");
  if (fetch.contractId !== round) {
    throw new Error("external payer tap fetched round does not match");
  }
  const createdRound = verifyFiveNorthExternalPayerTapHolding(
    create,
    dso,
    input,
  );
  verifyFiveNorthExternalPayerTapResults({
    createdHoldingId: create.contractId,
    createdRound,
    mintResult: mint.exerciseResult,
    rootResult: root.exerciseResult,
  });
  return Object.freeze({
    dso,
    roundContractId: round,
    rulesContractId: root.contractId,
  });
}
