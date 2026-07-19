import type {
  Create,
  Exercise,
  Fetch,
} from "@canton-network/core-ledger-proto";

export type PreparedPurchaseGraphNode =
  | Readonly<{
      nodeId: string;
      kind: "exercise";
      children: readonly string[];
      exercise: Exercise;
    }>
  | Readonly<{
      nodeId: string;
      kind: "create";
      children: readonly [];
      create: Create;
    }>
  | Readonly<{
      nodeId: string;
      kind: "fetch";
      children: readonly [];
      fetch: Fetch;
    }>;

export type PreparedPurchaseGraph = Readonly<{
  rootId: string;
  nodes: ReadonlyMap<string, PreparedPurchaseGraphNode>;
}>;
