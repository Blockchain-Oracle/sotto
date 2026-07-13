import { describe, expect, it } from "vitest";
import {
  activeContracts,
  activeContractCount,
  buildActiveContractRequest,
  findCreatedContract,
} from "../src/daml-evidence.js";

describe("Daml live evidence", () => {
  it("extracts one exact Sotto contract from a ledger-effects transaction", () => {
    const response = {
      transaction: {
        events: [
          {
            CreatedEvent: {
              contractId: "policy-cid",
              createArgument: { remainingLimit: "0.7500000000" },
              packageName: "sotto-control",
              templateId:
                "f72d7eb3:Sotto.Control.PrivacyProbe:PurchasePolicyProbe",
            },
          },
        ],
      },
    };

    expect(
      findCreatedContract(response, "sotto-control", "PurchasePolicyProbe"),
    ).toEqual({
      contractId: "policy-cid",
      createArgument: { remainingLimit: "0.7500000000" },
    });
  });

  it("builds a party-scoped template ACS request at an exact offset", () => {
    expect(
      buildActiveContractRequest(
        "sotto-policy-owner::1220participant",
        "#sotto-control:Sotto.Control.PrivacyProbe:PurchasePolicyProbe",
        42,
      ),
    ).toMatchObject({
      activeAtOffset: 42,
      filter: {
        filtersByParty: {
          "sotto-policy-owner::1220participant": {
            cumulative: [
              {
                identifierFilter: {
                  TemplateFilter: {
                    value: {
                      templateId:
                        "#sotto-control:Sotto.Control.PrivacyProbe:PurchasePolicyProbe",
                    },
                  },
                },
              },
            ],
          },
        },
      },
    });
  });

  it("counts only active ACS entries", () => {
    const response = [
      {
        contractEntry: {
          JsActiveContract: {
            createdEvent: {
              contractId: "active-cid",
              createArgument: { revision: "1" },
            },
          },
        },
      },
      { contractEntry: { JsIncompleteUnassigned: {} } },
    ];
    expect(activeContractCount(response)).toBe(1);
    expect(activeContracts(response)).toEqual([
      { contractId: "active-cid", createArgument: { revision: "1" } },
    ]);
  });
});
