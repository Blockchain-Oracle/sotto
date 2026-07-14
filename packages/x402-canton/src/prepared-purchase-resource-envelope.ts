export const MAX_PREPARE_RESPONSE_BYTES = 3_145_728;
export const MAX_PREPARED_TRANSACTION_BYTES = 2_097_152;
export const MAX_PREPARED_NODES = 64;
export const MAX_PREPARED_EDGES = 63;
export const MAX_PREPARED_DEPTH = 8;
export const MAX_PREPARED_INPUT_CONTRACTS = 20;
export const MAX_PREPARED_HOLDING_OUTPUTS = 16;
export const MAX_PREPARED_STRUCTURE_ITEMS = 4_096;
export const MAX_PREPARED_VALUE_DEPTH = 16;
export const MAX_PREPARED_EVENT_BLOB_BYTES = 262_144;
export const MAX_TOTAL_PREPARED_EVENT_BLOB_BYTES = 1_048_576;

export const PREPARED_PURCHASE_RESOURCE_LIMITS = Object.freeze({
  responseBytes: MAX_PREPARE_RESPONSE_BYTES,
  transactionBytes: MAX_PREPARED_TRANSACTION_BYTES,
  nodeCount: MAX_PREPARED_NODES,
  edgeCount: MAX_PREPARED_EDGES,
  graphDepth: MAX_PREPARED_DEPTH,
  inputContractCount: MAX_PREPARED_INPUT_CONTRACTS,
  receiverHoldingCount: MAX_PREPARED_HOLDING_OUTPUTS,
  changeHoldingCount: MAX_PREPARED_HOLDING_OUTPUTS,
  valueWorkUnits: MAX_PREPARED_STRUCTURE_ITEMS,
  valueDepth: MAX_PREPARED_VALUE_DEPTH,
  eventBlobBytes: MAX_PREPARED_EVENT_BLOB_BYTES,
  totalEventBlobBytes: MAX_TOTAL_PREPARED_EVENT_BLOB_BYTES,
});

type PreparedPurchaseResourceEnvelope = Readonly<
  Record<keyof typeof PREPARED_PURCHASE_RESOURCE_LIMITS, number>
>;

export function validatePreparedPurchaseResourceEnvelope(
  value: PreparedPurchaseResourceEnvelope,
): void {
  const expected = Object.keys(PREPARED_PURCHASE_RESOURCE_LIMITS).sort();
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expected)) {
    throw new Error("prepared Purchase resource envelope fields do not match");
  }
  for (const field of expected as Array<
    keyof typeof PREPARED_PURCHASE_RESOURCE_LIMITS
  >) {
    const actual = value[field];
    if (
      !Number.isSafeInteger(actual) ||
      actual < 0 ||
      actual > PREPARED_PURCHASE_RESOURCE_LIMITS[field]
    ) {
      throw new Error(`prepared Purchase resource envelope exceeds ${field}`);
    }
  }
}
