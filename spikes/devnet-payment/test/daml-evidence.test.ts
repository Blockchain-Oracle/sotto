import { describe, expect, it } from "vitest";
import {
  activeContracts,
  activeContractCount,
  buildActiveContractRequest,
  findCreatedContract,
} from "../src/daml-evidence.js";

describe("Daml live evidence", () => {
  const packageId = "f".repeat(64);
  const policyTemplate = `${packageId}:Sotto.Control.PrivacyProbe:PurchasePolicyProbe`;

  it("extracts one exact Sotto contract from a ledger-effects transaction", () => {
    const response = {
      transaction: {
        events: [
          {
            CreatedEvent: {
              contractId: "policy-cid",
              createArgument: { remainingLimit: "0.7500000000" },
              packageName: "sotto-control",
              templateId: policyTemplate,
            },
          },
        ],
      },
    };

    expect(
      findCreatedContract(response, packageId, "PurchasePolicyProbe"),
    ).toEqual({
      contractId: "policy-cid",
      createArgument: { remainingLimit: "0.7500000000" },
    });
  });

  it("rejects a same-named contract from another package", () => {
    const response = {
      transaction: {
        events: [
          {
            CreatedEvent: {
              contractId: "policy-cid",
              createArgument: { remainingLimit: "0.7500000000" },
              packageName: "sotto-control",
              templateId: `wrong:${policyTemplate}`,
            },
          },
        ],
      },
    };

    expect(() =>
      findCreatedContract(response, packageId, "PurchasePolicyProbe"),
    ).toThrow("Expected one");
  });

  it("builds a party-scoped template ACS request at an exact offset", () => {
    expect(
      buildActiveContractRequest(
        "sotto-policy-owner::1220participant",
        policyTemplate,
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
                      templateId: policyTemplate,
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
