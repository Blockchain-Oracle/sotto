import { FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID } from "./purchase-commitment-validation.js";
import { SHA256_PATTERN } from "./purchase-commitment-primitives.js";
import {
  parseTransferFactoryResponseWithExpectation,
  type TransferFactoryResponseExpectation,
} from "./transfer-factory-response.js";

type BootstrapExpectation = Readonly<{
  choiceArgumentsDigest: `sha256:${string}`;
  synchronizerId: string;
}>;

export function parseTransferFactoryBootstrapResponse(
  bytes: Uint8Array,
  expectation: BootstrapExpectation,
) {
  if (!SHA256_PATTERN.test(expectation.choiceArgumentsDigest)) {
    throw new Error("TransferFactory choice arguments digest is invalid");
  }
  const pinned: TransferFactoryResponseExpectation = {
    choiceArgumentsDigest: expectation.choiceArgumentsDigest,
    creationTemplateId: FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID,
    requireFactoryDisclosure: true,
    synchronizerId: expectation.synchronizerId,
  };
  return parseTransferFactoryResponseWithExpectation(bytes, pinned);
}
