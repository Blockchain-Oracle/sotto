export const HOLDING_INTERFACE_QUERY_ID =
  "#splice-api-token-holding-v1:Splice.Api.Token.HoldingV1:Holding" as const;
export const HOLDING_INTERFACE_PACKAGE_ID =
  "718a0f77e505a8de22f188bd4c87fe74101274e9d4cb1bfac7d09aec7158d35b" as const;
export const HOLDING_INTERFACE_ID =
  `${HOLDING_INTERFACE_PACKAGE_ID}:Splice.Api.Token.HoldingV1:Holding` as const;
export const FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID =
  "23f47481dab6b1ec01339d6e14494d85bb2844c25f45b26fc5c9ef4cd4942d1f" as const;

export const MAX_PURCHASE_HOLDINGS = 16;
export const MAX_HOLDING_ACS_ENTRIES = 256;
export const MAX_HOLDING_ACS_RESPONSE_BYTES = 2_000_000;
export const MAX_HOLDING_BLOB_BYTES = 262_144;
export const MAX_TOTAL_HOLDING_BLOB_BYTES = 1_048_576;

export type ValidatedDisclosedContract = Readonly<{
  templateId: string;
  contractId: string;
  createdEventBlob: string;
  synchronizerId: string;
}>;

export type PurchaseHoldingAcsRequest = Readonly<{
  filter: Readonly<{
    filtersByParty: Readonly<Record<string, unknown>>;
  }>;
  verbose: false;
  activeAtOffset: number;
}>;

export type PurchaseHoldingAcsReader = Readonly<{
  readLedgerEnd: () => Promise<unknown>;
  readActiveContracts: (request: PurchaseHoldingAcsRequest) => Promise<unknown>;
}>;

export type SelectedPurchaseHolding = Readonly<{
  amountAtomic: string;
  disclosure: ValidatedDisclosedContract;
}>;
