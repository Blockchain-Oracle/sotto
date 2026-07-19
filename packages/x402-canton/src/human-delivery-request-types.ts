export const HUMAN_DELIVERY_REQUEST_VERSION =
  "sotto-private-delivery-request-v1" as const;
export const MAX_HUMAN_DELIVERY_REQUEST_BYTES = 1_114_155;

export type HumanPaymentDeliveryRequest = Readonly<{
  bindingCanonicalBytes: Uint8Array;
  body?: Uint8Array;
}>;

export type HumanDeliveryRequest = Readonly<{
  version: typeof HUMAN_DELIVERY_REQUEST_VERSION;
  body: Uint8Array;
  bodyPresent: boolean;
  bodyHash: `sha256:${string}`;
  headers: ReadonlyArray<readonly [string, string]>;
  method: string;
  requestCommitment: `sha256:${string}`;
  url: string;
}>;
