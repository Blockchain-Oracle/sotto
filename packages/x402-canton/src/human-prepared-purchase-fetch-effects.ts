import type { Fetch } from "@canton-network/core-ledger-proto";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import { preparedParties } from "./prepared-purchase-effect-values.js";
import type {
  PreparedPurchaseGraph,
  PreparedPurchaseGraphNode,
} from "./prepared-purchase-graph-types.js";
import type { PreparedPurchaseMetadata } from "./prepared-purchase-metadata-types.js";

function validateFetch(
  fetch: Fetch,
  input: PreparedPurchaseMetadata["inputContracts"] extends ReadonlyMap<
    string,
    infer T
  >
    ? T
    : never,
  intent: HumanPurchaseLedgerIntent,
  preapprovalProvider: string,
  holding: boolean,
): void {
  const actual = fetch.templateId;
  const source = input.templateId;
  const selectedPackage = intent.packageSelection.packageIds[0];
  if (
    actual === undefined ||
    source === undefined ||
    actual.moduleName !== source.moduleName ||
    actual.entityName !== source.entityName ||
    actual.packageId !== selectedPackage ||
    fetch.packageName !== input.packageName ||
    fetch.interfaceId !== undefined
  ) {
    throw new Error(
      "prepared human authenticated fetch identity does not match",
    );
  }
  preparedParties(
    fetch.signatories,
    input.signatories,
    "human fetch signatory",
  );
  preparedParties(
    fetch.stakeholders,
    input.stakeholders,
    "human fetch stakeholder",
  );
  const featuredAppRight =
    source.moduleName === "Splice.Amulet" &&
    source.entityName === "FeaturedAppRight";
  const expectedActingParties = holding
    ? [intent.tokenFactory.expectedAdmin, intent.challenge.payerParty]
    : featuredAppRight
      ? [...new Set([intent.tokenFactory.expectedAdmin, preapprovalProvider])]
      : [intent.tokenFactory.expectedAdmin];
  preparedParties(
    fetch.actingParties,
    expectedActingParties,
    holding ? "human Holding fetch acting" : "human fetch acting",
  );
}

export function validateHumanPreparedFetchEffects(
  graph: PreparedPurchaseGraph,
  preapproval: Extract<PreparedPurchaseGraphNode, { kind: "exercise" }>,
  metadata: PreparedPurchaseMetadata,
  intent: HumanPurchaseLedgerIntent,
  contextIds: ReadonlyMap<string, string>,
  inputHoldingCids: readonly string[],
  preapprovalProvider: string,
): ReadonlySet<string> {
  const expected = [
    contextIds.get("external-party-config-state"),
    contextIds.get("featured-app-right"),
    ...inputHoldingCids,
  ];
  const positions = [
    0,
    1,
    ...inputHoldingCids.map((_contractId, index) => 2 + index * 2),
  ];
  const candidates = positions.map((index) =>
    graph.nodes.get(preapproval.children[index] ?? ""),
  );
  if (
    expected.some((value) => value === undefined) ||
    candidates.some((node) => node?.kind !== "fetch")
  ) {
    throw new Error("prepared human TransferPreapproval fetches do not match");
  }
  const fetches = candidates as Extract<
    PreparedPurchaseGraphNode,
    { kind: "fetch" }
  >[];
  if (
    JSON.stringify(fetches.map(({ fetch }) => fetch.contractId)) !==
    JSON.stringify(expected)
  ) {
    throw new Error("prepared human TransferPreapproval fetch order differs");
  }
  for (const { fetch } of fetches) {
    const input = metadata.inputContracts.get(fetch.contractId);
    if (input === undefined) {
      throw new Error("prepared human authenticated fetch input is absent");
    }
    validateFetch(
      fetch,
      input,
      intent,
      preapprovalProvider,
      inputHoldingCids.includes(fetch.contractId),
    );
  }
  return new Set(fetches.map(({ nodeId }) => nodeId));
}
