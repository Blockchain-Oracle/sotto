import { expect, it } from "vitest";
import {
  parseExternalPartyTopology,
  parseWalletRights,
} from "../src/five-north-wallet-preflight-validation.js";

const FINGERPRINT = `1220${"a".repeat(64)}`;

it("rejects malformed broad rights and mismatched topology identities", () => {
  expect(() =>
    parseWalletRights({
      rights: [{ kind: { CanExecuteAsAnyParty: null } }],
    }),
  ).toThrow(/right/iu);

  expect(() =>
    parseExternalPartyTopology(
      {
        multiHash: "topology-hash",
        partyId: "sotto-preflight::1220proposed",
        publicKeyFingerprint: `1220${"b".repeat(64)}`,
        topologyTransactions: [Buffer.from("topology").toString("base64")],
      },
      FINGERPRINT,
    ),
  ).toThrow(/fingerprint/iu);
});
