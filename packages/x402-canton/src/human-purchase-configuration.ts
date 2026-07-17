import type { HumanPurchaseTrustedConfiguration } from "./human-purchase-commitment-types.js";
import {
  atomic,
  exactKeys,
  identifier,
  objectValue,
} from "./purchase-commitment-primitives.js";

export function validateHumanPurchaseConfiguration(
  candidate: HumanPurchaseTrustedConfiguration,
): HumanPurchaseTrustedConfiguration {
  const config = objectValue(candidate, "human purchase trusted configuration");
  exactKeys(
    config,
    [
      "contractId",
      "expectedAdmin",
      "expectedAsset",
      "expectedInstrumentId",
      "maximumAllowedFeeAtomic",
    ],
    "human purchase trusted configuration",
  );
  atomic(config.maximumAllowedFeeAtomic, "maximum allowed human fee");
  return Object.freeze({
    contractId: identifier(config.contractId, "human token factory contractId"),
    expectedAsset: identifier(config.expectedAsset, "human expected asset"),
    expectedAdmin: identifier(
      config.expectedAdmin,
      "human token factory expected admin",
    ),
    expectedInstrumentId: identifier(
      config.expectedInstrumentId,
      "human expected instrument ID",
    ),
    maximumAllowedFeeAtomic: config.maximumAllowedFeeAtomic as string,
  });
}
