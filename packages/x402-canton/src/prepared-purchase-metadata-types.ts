import type { Create } from "@canton-network/core-ledger-proto";

export type PreparedPurchaseMetadata = Readonly<{
  inputContracts: ReadonlyMap<string, Create>;
}>;
