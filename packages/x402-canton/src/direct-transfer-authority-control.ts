import { TOKEN_TRANSFER_FACTORY_INTERFACE_ID } from "./purchase-commitment-validation.js";
import { SHA256_PATTERN, sha256Hex } from "./purchase-commitment-primitives.js";
import { mergePurchaseDisclosures } from "./purchase-disclosure-merge.js";
import { snapshotStrictJsonObject } from "./strict-json-value.js";
import { MAX_REGISTRY_CONTEXT_BYTES } from "./transfer-factory-types.js";
import {
  validateDirectTransferExecutionMaterial,
  validateDirectTransferPackageSelection,
} from "./direct-transfer-authority-control-validation.js";
import type {
  DirectTransferAuthorityChoiceArgument,
  DirectTransferAuthorityControl,
  DirectTransferAuthorityControlInput,
  DirectTransferAuthorityPrepareRequest,
} from "./direct-transfer-authority-control-types.js";

export type {
  DirectTransferAuthorityChoiceArgument,
  DirectTransferAuthorityControl,
  DirectTransferAuthorityControlInput,
  DirectTransferAuthorityPrepareRequest,
  DirectTransferAuthorityProbe,
} from "./direct-transfer-authority-control-types.js";

function choiceArgument(
  input: DirectTransferAuthorityControlInput,
): DirectTransferAuthorityChoiceArgument {
  const source = input.probe.choiceArguments;
  const transfer = Object.freeze({
    ...source.transfer,
    instrumentId: Object.freeze({ ...source.transfer.instrumentId }),
    inputHoldingCids: Object.freeze([...source.transfer.inputHoldingCids]),
    meta: Object.freeze({ values: Object.freeze({}) }),
  });
  return Object.freeze({
    expectedAdmin: source.expectedAdmin,
    transfer,
    extraArgs: Object.freeze({
      context: snapshotStrictJsonObject(
        input.factory.choiceContextData,
        "direct transfer choice context",
        {
          maximumBytes: MAX_REGISTRY_CONTEXT_BYTES,
          maximumDepth: 16,
          maximumNodes: 2_048,
        },
      ),
      meta: Object.freeze({ values: Object.freeze({}) }),
    }),
  });
}

export function buildDirectTransferAuthorityControl(
  input: DirectTransferAuthorityControlInput,
): DirectTransferAuthorityControl {
  if (!SHA256_PATTERN.test(input.controlId)) {
    throw new Error("direct transfer control ID is invalid");
  }
  const { agent, factoryId, payer, synchronizerId } =
    validateDirectTransferExecutionMaterial(input);
  const packageIds = validateDirectTransferPackageSelection(input);
  const argument = choiceArgument(input);
  const disclosures = mergePurchaseDisclosures(
    input.holdings.map(({ disclosure }) => disclosure),
    input.factory.disclosedContracts,
  );
  const exercise = Object.freeze({
    templateId: TOKEN_TRANSFER_FACTORY_INTERFACE_ID,
    contractId: factoryId,
    choice: "TransferFactory_Transfer" as const,
    choiceArgument: argument,
  });
  const commands = Object.freeze([
    Object.freeze({ ExerciseCommand: exercise }),
  ]) as DirectTransferAuthorityPrepareRequest["commands"];
  const commandDigest = sha256Hex(
    JSON.stringify({
      input: input.controlId,
      commands,
      disclosures,
      packageIds,
    }),
  );
  const request = (authority: string): DirectTransferAuthorityPrepareRequest =>
    Object.freeze({
      commandId: `sotto-direct-authority-control-v1-${commandDigest}`,
      commands,
      actAs: Object.freeze([authority]) as readonly [string],
      readAs: Object.freeze([]) as readonly [],
      disclosedContracts: disclosures,
      synchronizerId,
      packageIdSelectionPreference: packageIds,
      verboseHashing: false,
      prefetchContractKeys: Object.freeze([]) as readonly [],
      maxRecordTime: input.probe.choiceArguments.transfer.executeBefore,
      hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
    });
  return Object.freeze({
    agentRequest: request(agent),
    payerRequest: request(payer),
  });
}
