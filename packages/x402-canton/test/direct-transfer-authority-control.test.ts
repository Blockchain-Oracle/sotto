import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDirectTransferAuthorityControl,
  type DirectTransferAuthorityPrepareRequest,
} from "../src/index.js";
import { TOKEN_TRANSFER_FACTORY_INTERFACE_ID } from "../src/purchase-commitment-validation.js";
import { PAYER, PROVIDER } from "./purchase-commitment.fixtures.js";
import { createPackageSelectionFixture } from "./purchase-package-selection.fixtures.js";
import {
  DIRECT_EXECUTE_BEFORE,
  DIRECT_FACTORY_ID,
  DIRECT_SYNCHRONIZER,
  directTransferControlInput,
} from "./direct-transfer-authority-control.fixtures.js";

function withoutActAs(request: DirectTransferAuthorityPrepareRequest) {
  const clone = structuredClone(request) as Record<string, unknown>;
  delete clone.actAs;
  return clone;
}

describe("direct TransferFactory authority control", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:01.000Z") });
  });

  afterEach(() => vi.useRealTimers());

  it("builds one exact transfer pair differing only by acting Party", () => {
    const input = directTransferControlInput();
    const pair = buildDirectTransferAuthorityControl(input);
    const command = pair.agentRequest.commands[0]!.ExerciseCommand;

    expect(pair.agentRequest.actAs).toEqual([input.agentParty]);
    expect(pair.payerRequest.actAs).toEqual([PAYER]);
    expect(withoutActAs(pair.agentRequest)).toEqual(
      withoutActAs(pair.payerRequest),
    );
    expect(command).toMatchObject({
      choice: "TransferFactory_Transfer",
      contractId: DIRECT_FACTORY_ID,
      templateId: TOKEN_TRANSFER_FACTORY_INTERFACE_ID,
      choiceArgument: {
        expectedAdmin: input.probe.choiceArguments.expectedAdmin,
        transfer: {
          sender: PAYER,
          receiver: PROVIDER,
          amount: "0.0100000000",
          inputHoldingCids: ["00holding-a"],
        },
        extraArgs: {
          context: {
            values: {
              "splice.example/round": {
                tag: "AV_ContractId",
                value: "00round",
              },
            },
          },
        },
      },
    });
    expect(pair.agentRequest).toMatchObject({
      readAs: [],
      synchronizerId: DIRECT_SYNCHRONIZER,
      maxRecordTime: DIRECT_EXECUTE_BEFORE,
      hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
      verboseHashing: false,
      prefetchContractKeys: [],
    });
    expect(pair.agentRequest.packageIdSelectionPreference).toEqual(
      input.packageSelection.packageIds,
    );
    expect(
      pair.agentRequest.disclosedContracts.map(({ contractId }) => contractId),
    ).toEqual(["00direct-factory", "00holding-a"]);
    expect(pair.agentRequest.commandId).toMatch(
      /^sotto-direct-authority-control-v1-[0-9a-f]{64}$/u,
    );
  });

  it("deep-freezes both requests and snapshots execution material", () => {
    const input = directTransferControlInput();
    const factory = structuredClone(input.factory);
    const pair = buildDirectTransferAuthorityControl({ ...input, factory });

    expect(Object.isFrozen(pair)).toBe(true);
    for (const request of [pair.agentRequest, pair.payerRequest]) {
      expect(Object.isFrozen(request)).toBe(true);
      expect(Object.isFrozen(request.commands)).toBe(true);
      expect(Object.isFrozen(request.commands[0]!.ExerciseCommand)).toBe(true);
      expect(Object.isFrozen(request.disclosedContracts)).toBe(true);
      expect(Object.isFrozen(request.packageIdSelectionPreference)).toBe(true);
    }
    (factory.choiceContextData.values as Record<string, unknown>)["later"] =
      "mutation";
    expect(
      pair.agentRequest.commands[0]!.ExerciseCommand.choiceArgument.extraArgs
        .context,
    ).not.toHaveProperty("later");
  });

  it("rejects unauthenticated or wrongly scoped package selection", () => {
    const input = directTransferControlInput();
    expect(() =>
      buildDirectTransferAuthorityControl({
        ...input,
        packageSelection: structuredClone(input.packageSelection),
      }),
    ).toThrow(/package preference.*not authenticated/iu);

    const wrongScope = createPackageSelectionFixture(undefined, (selection) => {
      selection.synchronizerId = "other-domain::1220sync";
    });
    expect(() =>
      buildDirectTransferAuthorityControl({
        ...directTransferControlInput(),
        packageSelection: wrongScope as unknown as ReturnType<
          typeof directTransferControlInput
        >["packageSelection"],
      }),
    ).toThrow(/package.*synchronizer/iu);
  });

  it("rejects authority, holding, or factory substitution", () => {
    const input = directTransferControlInput();
    for (const candidate of [
      { ...input, agentParty: input.payerParty },
      { ...input, holdings: [] },
      {
        ...input,
        factory: { ...input.factory, factoryId: "00other-factory" },
      },
      {
        ...input,
        factory: {
          ...input.factory,
          choiceArgumentsDigest: `sha256:${"f".repeat(64)}`,
        },
      },
    ]) {
      expect(() =>
        buildDirectTransferAuthorityControl(candidate as never),
      ).toThrow();
    }
  });
});
