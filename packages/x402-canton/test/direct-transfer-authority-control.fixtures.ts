import {
  buildTransferFactoryBootstrapProbe,
  parseTransferFactoryBootstrapResponse,
  selectPurchaseHoldingsByCriteria,
  type DirectTransferAuthorityControlInput,
} from "../src/index.js";
import { FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID } from "../src/purchase-commitment-validation.js";
import { AGENT, DSO, PAYER, PROVIDER } from "./purchase-commitment.fixtures.js";
import { holdingEntry } from "./purchase-holding-observation.fixtures.js";
import { createPackageSelectionFixture } from "./purchase-package-selection.fixtures.js";
import { responseBytes } from "./transfer-factory-observation.fixtures.js";

export const DIRECT_CONTROL_ID = `sha256:${"7".repeat(64)}` as const;
export const DIRECT_FACTORY_ID = "00direct-factory";
export const DIRECT_SYNCHRONIZER = "global-domain::1220sync";
export const DIRECT_REQUESTED_AT = "2026-07-13T09:59:55.000Z";
export const DIRECT_EXECUTE_BEFORE = "2026-07-13T10:02:00.000Z";

export function directTransferControlInput(): DirectTransferAuthorityControlInput {
  const holdings = selectPurchaseHoldingsByCriteria(
    [holdingEntry("00holding-a", "0.7500000000")],
    {
      debitCeilingAtomic: "100000000",
      instrument: { admin: DSO, id: "Amulet" },
      payerParty: PAYER,
      synchronizerId: DIRECT_SYNCHRONIZER,
    },
  );
  const probe = buildTransferFactoryBootstrapProbe({
    amountAtomic: "100000000",
    executeBefore: DIRECT_EXECUTE_BEFORE,
    expectedAdmin: DSO,
    inputHoldingCids: holdings.map(({ disclosure }) => disclosure.contractId),
    payerParty: PAYER,
    recipientParty: PROVIDER,
    requestedAt: DIRECT_REQUESTED_AT,
  });
  const factory = parseTransferFactoryBootstrapResponse(
    responseBytes({
      factoryId: DIRECT_FACTORY_ID,
      transferKind: "direct",
      choiceContext: {
        choiceContextData: {
          values: {
            "splice.example/round": {
              tag: "AV_ContractId",
              value: "00round",
            },
          },
        },
        disclosedContracts: [
          {
            templateId: FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID,
            contractId: DIRECT_FACTORY_ID,
            createdEventBlob: Buffer.from("direct-factory").toString("base64"),
            synchronizerId: DIRECT_SYNCHRONIZER,
          },
        ],
      },
    }),
    {
      choiceArgumentsDigest: probe.choiceArgumentsDigest,
      synchronizerId: DIRECT_SYNCHRONIZER,
    },
  );
  return {
    agentParty: AGENT,
    controlId: DIRECT_CONTROL_ID,
    factory,
    holdings,
    packageSelection:
      createPackageSelectionFixture() as unknown as DirectTransferAuthorityControlInput["packageSelection"],
    payerParty: PAYER,
    probe,
    synchronizerId: DIRECT_SYNCHRONIZER,
  };
}
