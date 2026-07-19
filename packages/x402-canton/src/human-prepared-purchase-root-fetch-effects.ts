import type { Fetch } from "@canton-network/core-ledger-proto";
import type { HumanPurchaseLedgerIntent } from "./human-purchase-ledger-intent.js";
import {
  preparedIdentifier,
  preparedParties,
} from "./prepared-purchase-effect-values.js";
import type {
  PreparedPurchaseGraph,
  PreparedPurchaseGraphNode,
} from "./prepared-purchase-graph-types.js";
import type { PreparedPurchaseMetadata } from "./prepared-purchase-metadata-types.js";
import { HOLDING_INTERFACE_ID } from "./purchase-holding-types.js";

type FetchNode = Extract<PreparedPurchaseGraphNode, { kind: "fetch" }>;

function validateIdentity(
  fetch: Fetch,
  metadata: PreparedPurchaseMetadata,
  intent: HumanPurchaseLedgerIntent,
  holdingIds: ReadonlySet<string>,
): void {
  const input = metadata.inputContracts.get(fetch.contractId);
  const template = fetch.templateId;
  const source = input?.templateId;
  const selectedPackage = intent.packageSelection.packageIds[0];
  if (
    input === undefined ||
    template === undefined ||
    source === undefined ||
    fetch.lfVersion !== "2.1" ||
    template.packageId !== selectedPackage ||
    template.moduleName !== source.moduleName ||
    template.entityName !== source.entityName ||
    fetch.packageName !== input.packageName
  ) {
    throw new Error("prepared human root fetch identity does not match");
  }
  const holding = holdingIds.has(fetch.contractId);
  if (holding) {
    preparedIdentifier(
      fetch.interfaceId,
      HOLDING_INTERFACE_ID,
      "human root Holding fetch interface",
    );
  } else if (fetch.interfaceId !== undefined) {
    throw new Error("prepared human root context fetch has an interface");
  }
  preparedParties(
    fetch.signatories,
    input.signatories,
    "human root fetch signatory",
  );
  preparedParties(
    fetch.stakeholders,
    input.stakeholders,
    "human root fetch stakeholder",
  );
  preparedParties(
    fetch.actingParties,
    holding
      ? [intent.tokenFactory.expectedAdmin, intent.challenge.payerParty]
      : [intent.tokenFactory.expectedAdmin],
    "human root fetch acting",
  );
}

export function validateHumanPreparedRootFetchEffects(
  graph: PreparedPurchaseGraph,
  rootChildren: readonly string[],
  metadata: PreparedPurchaseMetadata,
  intent: HumanPurchaseLedgerIntent,
  contextIds: ReadonlyMap<string, string>,
  inputHoldingCids: readonly string[],
): ReadonlySet<string> {
  const expected = [
    contextIds.get("transfer-preapproval"),
    contextIds.get("external-party-config-state"),
    contextIds.get("external-party-config-state"),
    ...inputHoldingCids,
  ];
  const candidates = rootChildren
    .slice(0, expected.length)
    .map((nodeId) => graph.nodes.get(nodeId));
  if (
    expected.some((contractId) => contractId === undefined) ||
    candidates.some((node) => node?.kind !== "fetch")
  ) {
    throw new Error("prepared human root fetch effects do not match");
  }
  const fetches = candidates as FetchNode[];
  if (
    JSON.stringify(fetches.map(({ fetch }) => fetch.contractId)) !==
    JSON.stringify(expected)
  ) {
    throw new Error("prepared human root fetch order does not match");
  }
  const holdingIds = new Set(inputHoldingCids);
  for (const { fetch } of fetches) {
    validateIdentity(fetch, metadata, intent, holdingIds);
  }
  return new Set(fetches.map(({ nodeId }) => nodeId));
}
