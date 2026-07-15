import { boundedCapabilityBootstrapState } from "./bounded-capability-bootstrap-state.js";
import { identifier, objectValue } from "./purchase-commitment-primitives.js";

const UPDATE_ID_PATTERN = /^1220[0-9a-f]{64}$/;

export function parseBoundedCapabilityBootstrapCompletionResponse(
  value: unknown,
  request: unknown,
) {
  boundedCapabilityBootstrapState(request);
  const response = objectValue(value, "bootstrap completion response");
  const offset = response.completionOffset;
  if (!Number.isSafeInteger(offset) || (offset as number) < 0) {
    throw new Error("bootstrap completion offset is invalid");
  }
  const updateId = identifier(response.updateId, "bootstrap update ID");
  if (!UPDATE_ID_PATTERN.test(updateId)) {
    throw new Error("bootstrap update ID is invalid");
  }
  return Object.freeze({ offset: offset as number, updateId });
}
