/**
 * SPECIMEN shapes for component development only. Values mirror the real
 * DevNet fixture shapes (0.25 CC price, `1220…` update-id / party
 * fingerprints) but represent NO live activity — the gallery labels them
 * SPECIMEN in the UI.
 */

export const SPECIMEN_PRICE = { value: "0.25", asset: "CC" } as const;

export const SPECIMEN_UPDATE_ID =
  "1220a91e44b1c0a5d8e2f7639bd04c1855aa0e2f91c47d83f2ab9640cbbe7c2f";

export const SPECIMEN_OWNER_PARTY =
  "sotto-owner::1220b6c4e9d10a7f45c2388d915e04a7c31fb02976aa41c58890d2731eab8a91";

export const SPECIMEN_MERCHANT_PARTY =
  "merchant-ctai::12204af8d02be519c7708a41e6f3355640918d2b6c05579ee21d40bc8dcc397b";

export const SPECIMEN_CHALLENGE = `{
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "exact",
      "network": "canton-devnet",
      "asset": "CC",
      "maxAmountRequired": "0.25",
      "payTo": "merchant-ctai::12204af8…cc397b",
      "resource": "https://api.merchant-ctai.example/fx/usd-cad"
    }
  ]
}`;

/** Base instant for static specimen timestamps (a fixed, labeled past time). */
export const SPECIMEN_T0 = new Date("2026-07-19T14:03:07Z");

export const at = (offsetSeconds: number): Date =>
  new Date(SPECIMEN_T0.getTime() + offsetSeconds * 1000);
